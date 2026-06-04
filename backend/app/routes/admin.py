"""Admin routes for oversight, approvals, and audit operations."""

import hashlib
import json
import os
import shutil
from datetime import date, datetime, time, timedelta, timezone
from functools import wraps
from io import BytesIO
from xml.sax.saxutils import escape

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import and_, func, or_
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app import db
from app.models.audit_log import AuditLog
from app.models.case_file import CaseFile
from app.models.evidence import CustodyRecord, Evidence
from app.models.refresh_token import RefreshToken
from app.models.system_heartbeat import SystemHeartbeat
from app.models.user import User
from app.models.webauthn_credential import WebAuthnCredential
from app.modules.pqc_engine import HAS_OQS, pqc_engine
from app.utils.aadhar import hash_aadhar_number, masked_aadhar, normalize_aadhar_number

admin_bp = Blueprint("admin", __name__)

ALLOWED_ROLES = {"admin", "investigator", "court_user"}
ALLOWED_APPROVAL_STATUSES = {"pending", "approved", "rejected"}

PQC_INTEGRITY_BASELINE_AT = datetime.utcnow()
AUDIT_INTEGRITY_BASELINE_FILENAME = "audit_integrity_baseline.json"
AUDIT_FINGERPRINT_FIELDS = (
    "id",
    "user_id",
    "action",
    "resource_type",
    "resource_id",
    "details",
    "status",
    "error_message",
    "ip_address",
    "user_agent",
    "timestamp",
    "prev_hash",
    "current_hash",
)
KNOWN_FALSE_POSITIVE_TAMPER_LOGS = [
    {
        "action": "court_access_grant_create",
        "resource_type": "case_access_grant",
        "resource_id": "7",
        "date": date(2026, 3, 26),
        "details": {
            "case_file_id": "a267b79a-f5a5-4390-b862-b18a3318fd67",
            "court_user_id": 6,
            "duration_minutes": 60,
        },
    }
]


def require_roles(*roles):
    """Decorator to require one of the configured roles."""

    def decorator(func):
        @wraps(func)
        @jwt_required()
        def wrapped(*args, **kwargs):
            claims = get_jwt()
            if claims.get("role") not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            return func(*args, **kwargs)

        return wrapped

    return decorator


def _canonical_json(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def _utcnow():
    return datetime.utcnow()


def _audit_integrity_badge(action):
    action_lower = (action or "").lower()
    if "approve" in action_lower or "signature" in action_lower:
        return "Dilithium-Signed"
    if any(token in action_lower for token in ["upload", "encrypt", "evidence"]):
        return "Kyber-Verified"
    return "PQC-Tracked"


def _log_entry_hash(log_dict):
    digest = hashlib.sha3_256(_canonical_json(log_dict).encode("utf-8")).hexdigest()
    return digest


def _audit_action_label(action):
    raw = str(action or "").strip()
    if not raw:
        return ""
    normalized = raw.lower()
    if normalized in {"user_delete_access", "user_deactivate"}:
        return "USER DEACTIVATED"
    if normalized == "user_deleted_permanent":
        return "USER DELETED (PERMANENT)"
    if normalized == "pqid_view":
        return "PQID VIEWED"
    return raw


def _resolve_integrity_baseline():
    raw = (
        str(current_app.config.get("PQC_INTEGRITY_BASELINE_AT", "")).strip()
        or str(os.getenv("PQC_INTEGRITY_BASELINE_AT", "")).strip()
    )
    parsed = _parse_iso_datetime(raw)
    return parsed or PQC_INTEGRITY_BASELINE_AT


def _normalize_chain_hash(value, allow_genesis=False):
    text = str(value or "").strip()
    lowered = text.lower()
    if allow_genesis and lowered == "genesis":
        return "GENESIS"
    if len(lowered) == 64 and all(ch in "0123456789abcdef" for ch in lowered):
        return lowered
    return None


def _isoformat_z(value):
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return f"{value.isoformat()}Z"


def _is_chain_valid(log: AuditLog):
    current_hash = _normalize_chain_hash(log.current_hash)
    if not current_hash:
        return False

    duplicate_hash = (
        db.session.query(AuditLog.id)
        .filter(AuditLog.id < log.id, AuditLog.current_hash == current_hash)
        .order_by(AuditLog.id.desc())
        .limit(1)
        .scalar()
    )
    if duplicate_hash is not None:
        return False

    prev_hash = _normalize_chain_hash(log.prev_hash, allow_genesis=True)
    if prev_hash == "GENESIS":
        return True
    if prev_hash is None:
        return False

    previous_hash = (
        db.session.query(AuditLog.id)
        .filter(AuditLog.id < log.id, AuditLog.current_hash == prev_hash)
        .order_by(AuditLog.id.desc())
        .limit(1)
        .scalar()
    )
    return previous_hash is not None


def _resolve_db_path():
    try:
        db_path = db.engine.url.database
    except Exception:
        db_path = None
    if not db_path:
        return None
    return os.path.abspath(db_path)


def _backup_dir():
    root = os.path.abspath(os.path.join(current_app.root_path, ".."))
    return os.path.join(root, "backups")


def _audit_integrity_baseline_path():
    return os.path.join(_backup_dir(), AUDIT_INTEGRITY_BASELINE_FILENAME)


def _safe_backup_path(backup_dir: str, filename: str):
    normalized = os.path.abspath(os.path.join(backup_dir, filename))
    if not normalized.startswith(os.path.abspath(backup_dir) + os.sep):
        return None
    return normalized


def _attempted_username_from_log_details(details):
    if not details:
        return None
    parsed = details
    if isinstance(details, str):
        try:
            parsed = json.loads(details)
        except (TypeError, ValueError):
            return None
    if not isinstance(parsed, dict):
        return None
    username = parsed.get("username") or parsed.get("attempted_username")
    if not username:
        return None
    username_text = str(username).strip()
    return username_text or None


def _safe_parse_details(details):
    if not details:
        return {}
    if isinstance(details, dict):
        return details
    try:
        parsed = json.loads(details)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def _is_known_false_positive_tamper(log: AuditLog) -> bool:
    if not log:
        return False
    for entry in KNOWN_FALSE_POSITIVE_TAMPER_LOGS:
        if str(log.action or "") != entry.get("action"):
            continue
        if str(log.resource_type or "") != entry.get("resource_type"):
            continue
        if str(log.resource_id or "") != entry.get("resource_id"):
            continue
        if log.timestamp and log.timestamp.date() != entry.get("date"):
            continue
        if not log.timestamp and entry.get("date"):
            continue
        details = _safe_parse_details(log.details)
        expected_details = entry.get("details") or {}
        if not all(details.get(key) == expected_details.get(key) for key in expected_details):
            continue
        return True
    return False


def _audit_snapshot_username(log: AuditLog, usernames):
    if log.user_id:
        return usernames.get(log.user_id) or _attempted_username_from_log_details(log.details) or "System"
    return _attempted_username_from_log_details(log.details) or "System"


def _audit_log_snapshot(log: AuditLog, usernames):
    return {
        "id": log.id,
        "user_id": log.user_id,
        "username": _audit_snapshot_username(log, usernames),
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "details": log.details,
        "status": log.status,
        "error_message": log.error_message,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "timestamp": _isoformat_z(log.timestamp),
        "prev_hash": log.prev_hash,
        "current_hash": log.current_hash,
    }


def _audit_log_fingerprint(snapshot):
    material = {field: snapshot.get(field) for field in AUDIT_FINGERPRINT_FIELDS}
    return hashlib.sha3_256(_canonical_json(material).encode("utf-8")).hexdigest()


def _build_audit_baseline_records(logs):
    user_ids = {log.user_id for log in logs if log.user_id}
    usernames = {
        user.id: user.username for user in User.query.filter(User.id.in_(user_ids)).all()
    } if user_ids else {}

    records = {}
    for log in logs:
        snapshot = _audit_log_snapshot(log, usernames)
        records[log.id] = {
            "fingerprint": _audit_log_fingerprint(snapshot),
            "snapshot": snapshot,
        }
    return records


def _load_audit_integrity_baseline():
    baseline_path = _audit_integrity_baseline_path()
    if not os.path.isfile(baseline_path):
        return None

    try:
        with open(baseline_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError, TypeError):
        return None

    raw_records = payload.get("records")
    if not isinstance(raw_records, dict):
        return None

    records = {}
    for raw_id, entry in raw_records.items():
        try:
            log_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if not isinstance(entry, dict):
            continue
        snapshot = entry.get("snapshot")
        if not isinstance(snapshot, dict):
            continue
        fingerprint = str(entry.get("fingerprint") or "").strip()
        if not fingerprint:
            fingerprint = _audit_log_fingerprint(snapshot)
        records[log_id] = {"fingerprint": fingerprint, "snapshot": snapshot}

    return {"records": records, "updated_at": payload.get("updated_at")}


def _write_audit_integrity_baseline(records):
    backup_dir = _backup_dir()
    os.makedirs(backup_dir, exist_ok=True)
    baseline_path = _audit_integrity_baseline_path()
    payload = {
        "version": 1,
        "updated_at": _isoformat_z(_utcnow()),
        "record_count": len(records),
        "records": {str(log_id): records[log_id] for log_id in sorted(records)},
    }
    with open(baseline_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return baseline_path


def _diff_audit_snapshots(previous_snapshot, current_snapshot):
    changed = []
    for field in AUDIT_FINGERPRINT_FIELDS:
        if previous_snapshot.get(field) != current_snapshot.get(field):
            changed.append(field)
    return changed


def _summarize_audit_issues(issues):
    modified = sum(1 for issue in issues if issue.get("issue") == "modified")
    deleted = sum(1 for issue in issues if issue.get("issue") == "deleted")
    return {
        "total": len(issues),
        "modified": modified,
        "deleted": deleted,
    }


def _detect_structural_audit_issues(logs, current_records):
    issues = []
    seen_hashes = set()
    previous_id = None

    for log in logs:
        if previous_id is not None and log.id and log.id > previous_id + 1:
            for missing_id in range(previous_id + 1, log.id):
                issues.append(
                    {
                        "issue": "deleted",
                        "id": missing_id,
                        "message": "Audit log ID is missing from the sequence.",
                    }
                )

        previous_id = log.id
        snapshot = current_records.get(log.id, {}).get("snapshot")
        current_hash = _normalize_chain_hash(log.current_hash)
        prev_hash = _normalize_chain_hash(log.prev_hash, allow_genesis=True)

        if not current_hash:
            issues.append(
                {
                    "issue": "modified",
                    "id": log.id,
                    "message": "Audit log hash is missing or malformed.",
                    "current": snapshot,
                }
            )
            continue

        if current_hash in seen_hashes:
            issues.append(
                {
                    "issue": "modified",
                    "id": log.id,
                    "message": "Audit log hash is duplicated, which indicates tampering or corruption.",
                    "current": snapshot,
                }
            )
        elif prev_hash != "GENESIS" and prev_hash not in seen_hashes:
            issues.append(
                {
                    "issue": "modified",
                    "id": log.id,
                    "message": "Audit log points to a missing predecessor hash.",
                    "current": snapshot,
                }
            )

        seen_hashes.add(current_hash)

    return issues


def _analyze_audit_backup_issues(logs):
    current_records = _build_audit_baseline_records(logs)
    baseline = _load_audit_integrity_baseline()

    if baseline and baseline.get("records"):
        issues = []
        for log_id, baseline_record in sorted(baseline["records"].items()):
            current_record = current_records.get(log_id)
            if current_record is None:
                issues.append(
                    {
                        "issue": "deleted",
                        "id": log_id,
                        "message": "Audit log is missing from the current records.",
                        "baseline": baseline_record.get("snapshot"),
                    }
                )
                continue

            if current_record["fingerprint"] != baseline_record["fingerprint"]:
                previous_snapshot = baseline_record.get("snapshot") or {}
                current_snapshot = current_record.get("snapshot") or {}
                issues.append(
                    {
                        "issue": "modified",
                        "id": log_id,
                        "message": "Audit log contents changed since the last trusted baseline.",
                        "changed_fields": _diff_audit_snapshots(previous_snapshot, current_snapshot),
                        "baseline": previous_snapshot,
                        "current": current_snapshot,
                    }
                )

        return {
            "has_baseline": True,
            "current_records": current_records,
            "issues": issues,
        }

    return {
        "has_baseline": False,
        "current_records": current_records,
        "issues": _detect_structural_audit_issues(logs, current_records),
    }


def _build_load_series():
    now = datetime.utcnow()
    buckets = [0] * 12
    bucket_minutes = 5
    since = now - timedelta(minutes=bucket_minutes * len(buckets))

    recent_logs = (
        AuditLog.query.filter(AuditLog.timestamp >= since)
        .order_by(AuditLog.timestamp.asc())
        .all()
    )

    for log in recent_logs:
        delta = now - log.timestamp
        index = len(buckets) - 1 - int(delta.total_seconds() // (bucket_minutes * 60))
        if 0 <= index < len(buckets):
            buckets[index] += 1

    max_count = max(buckets) if buckets else 1
    if max_count == 0:
        max_count = 1
    activity_pct = [int((value / max_count) * 100) for value in buckets]

    load1 = 0.0
    if hasattr(os, "getloadavg"):
        try:
            load1 = float(os.getloadavg()[0])
        except OSError:
            load1 = 0.0
    server_load_pct = max(0, min(100, int((load1 / 4.0) * 100)))
    return {"activity": activity_pct, "server_load_pct": server_load_pct}


def _parse_health_date(raw_value):
    if not raw_value:
        return datetime.utcnow().date()
    try:
        return datetime.strptime(raw_value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_tz_offset_minutes(raw_value):
    if raw_value is None or raw_value == "":
        return 0
    try:
        offset = int(raw_value)
    except (TypeError, ValueError):
        return None
    if offset < -840 or offset > 840:
        return None
    return offset


def _parse_iso_datetime(raw_value):
    if not raw_value:
        return None
    text = str(raw_value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _format_pdf_timestamp(value):
    if not value:
        return "N/A"
    return value.strftime("%Y-%m-%d %H:%M:%S UTC")


def _build_health_onoff_series(day: date, tz_offset_minutes=0):
    # JS timezone offset semantics: UTC = Local + offset_minutes
    local_day_start = datetime.combine(day, time.min)
    utc_day_start = local_day_start + timedelta(minutes=tz_offset_minutes)
    utc_day_end = utc_day_start + timedelta(days=1)

    minute_count_map = [[0] * 60 for _ in range(24)]
    minute_load_map = [[0] * 60 for _ in range(24)]
    logs = (
        SystemHeartbeat.query.filter(
            SystemHeartbeat.beat_minute >= utc_day_start,
            SystemHeartbeat.beat_minute < utc_day_end,
        )
        .with_entities(SystemHeartbeat.beat_minute, SystemHeartbeat.load_pct)
        .all()
    )

    for row in logs:
        timestamp_utc = row.beat_minute
        local_dt = timestamp_utc - timedelta(minutes=tz_offset_minutes)
        if local_dt.date() != day:
            continue
        hour_idx = local_dt.hour
        minute_idx = local_dt.minute
        minute_count_map[hour_idx][minute_idx] += 1
        minute_load_map[hour_idx][minute_idx] = max(
            0, min(100, int(row.load_pct or 0))
        )

    # Mark current local minute as online for today's selected local date.
    now_local = datetime.utcnow() - timedelta(minutes=tz_offset_minutes)
    if day == now_local.date():
        minute_count_map[now_local.hour][now_local.minute] = max(
            1, minute_count_map[now_local.hour][now_local.minute]
        )
        # If no persisted heartbeat yet for this minute, snapshot current load.
        if minute_load_map[now_local.hour][now_local.minute] == 0:
            load1 = 0.0
            if hasattr(os, "getloadavg"):
                try:
                    load1 = float(os.getloadavg()[0])
                except OSError:
                    load1 = 0.0
            minute_load_map[now_local.hour][now_local.minute] = max(
                0, min(100, int((load1 / 4.0) * 100))
            )

    hour_event_totals = [sum(minute_count_map[idx]) for idx in range(24)]

    hourly_points = []
    for idx in range(24):
        events = hour_event_totals[idx]
        active_minutes = sum(1 for value in minute_count_map[idx] if value > 0)
        if day == now_local.date():
            if idx < now_local.hour:
                considered_minutes = 60
            elif idx == now_local.hour:
                considered_minutes = now_local.minute + 1
            else:
                considered_minutes = 0
        else:
            considered_minutes = 60
        sampled_load_values = [
            minute_load_map[idx][minute]
            for minute in range(considered_minutes)
            if minute_count_map[idx][minute] > 0
        ]
        sampled_minutes = len(sampled_load_values)
        avg_load_pct = (
            int(round(sum(sampled_load_values) / sampled_minutes))
            if sampled_minutes > 0
            else 0
        )
        uptime_percentage = (
            int(round((active_minutes / considered_minutes) * 100))
            if considered_minutes > 0
            else 0
        )
        coverage_pct = (
            int(round((sampled_minutes / considered_minutes) * 100))
            if considered_minutes > 0
            else 0
        )
        percentage = (
            avg_load_pct
        )
        hourly_points.append(
            {
                "hour": idx,
                "label": f"{idx:02d}:00",
                "status": 1 if active_minutes > 0 else 0,
                "events": events,
                "active_minutes": active_minutes,
                "considered_minutes": considered_minutes,
                "sampled_minutes": sampled_minutes,
                "coverage_pct": coverage_pct,
                "avg_load_pct": avg_load_pct,
                "uptime_pct": uptime_percentage,
                "percentage": percentage,
            }
        )
    return hourly_points, minute_count_map, minute_load_map


def _build_health_summary(day: date, minute_count_map, tz_offset_minutes=0):
    now_local = datetime.utcnow() - timedelta(minutes=tz_offset_minutes)
    if day == now_local.date():
        considered_minutes = (now_local.hour * 60) + now_local.minute + 1
    else:
        considered_minutes = 24 * 60

    considered_minutes = max(1, min(24 * 60, considered_minutes))
    online_minutes = 0

    for minute_index in range(considered_minutes):
        hour_idx = minute_index // 60
        minute_idx = minute_index % 60
        if minute_count_map[hour_idx][minute_idx] > 0:
            online_minutes += 1

    offline_minutes = max(0, considered_minutes - online_minutes)
    uptime_pct = int(round((online_minutes / considered_minutes) * 100))

    return {
        "considered_minutes": considered_minutes,
        "online_minutes": online_minutes,
        "offline_minutes": offline_minutes,
        "online_hours": round(online_minutes / 60.0, 1),
        "offline_hours": round(offline_minutes / 60.0, 1),
        "uptime_pct": uptime_pct,
    }


def _create_audit_log(
    user_id,
    action,
    resource_type,
    resource_id,
    status="success",
    details=None,
    error_message=None,
):
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=_canonical_json(details) if details is not None else None,
        status=status,
        error_message=error_message,
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent", ""),
    )
    db.session.add(log)


def _not_deleted_filter():
    return or_(Evidence.is_deleted.is_(False), Evidence.is_deleted.is_(None))


def _normalized_approval_status_expr():
    return func.lower(func.trim(func.coalesce(Evidence.approval_status, "approved")))


def _approval_status_filter(status):
    return _normalized_approval_status_expr() == status


def _normalized_case_approval_status_expr():
    return func.lower(func.trim(func.coalesce(CaseFile.approval_status, "approved")))


def _case_approval_status_filter(status):
    return _normalized_case_approval_status_expr() == status


def _evidence_with_usernames(items):
    uploader_ids = {item.uploaded_by for item in items if item.uploaded_by}
    approver_ids = {item.approved_by for item in items if item.approved_by}
    user_ids = uploader_ids.union(approver_ids)
    users = {user.id: user.username for user in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    return [
        {
            **item.to_dict(),
            "uploader_username": users.get(item.uploaded_by, f"user:{item.uploaded_by}")
            if item.uploaded_by
            else "unknown",
            "approved_by_username": users.get(item.approved_by) if item.approved_by else None,
        }
        for item in items
    ]


@admin_bp.route("/overview", methods=["GET"])
@require_roles("admin")
def overview():
    """Command-center metrics for the admin landing view."""
    try:
        def _pct(numerator, denominator):
            if not denominator:
                return None
            return round((numerator / denominator) * 100, 1)

        total_evidence = Evidence.query.filter(_not_deleted_filter()).count()
        open_cases = (
            CaseFile.query.filter(
                or_(CaseFile.status.is_(None), func.lower(CaseFile.status) != "closed")
            ).count()
        )
        pending_approvals = Evidence.query.filter(
            and_(_not_deleted_filter(), _approval_status_filter("pending"))
        ).count()
        approved_evidence = Evidence.query.filter(
            and_(_not_deleted_filter(), _approval_status_filter("approved"))
        ).count()
        rejected_evidence = Evidence.query.filter(
            and_(_not_deleted_filter(), _approval_status_filter("rejected"))
        ).count()

        tamper_actions = [
            "signature_verification_failed",
            "integrity_check_failed",
            "tamper_attempt",
            "decryption_failed",
        ]
        tamper_cutoff = datetime.utcnow() - timedelta(hours=24)
        tamper_alerts = (
            AuditLog.query.filter(AuditLog.timestamp >= tamper_cutoff, AuditLog.status == "failure")
            .filter(AuditLog.action.in_(tamper_actions))
            .count()
        )
        health_series = _build_load_series()

        signed_evidence = Evidence.query.filter(
            and_(_not_deleted_filter(), Evidence.signature.isnot(None))
        ).count()
        sig_algo_set = Evidence.query.filter(
            and_(_not_deleted_filter(), Evidence.signature_algorithm.isnot(None))
        ).count()
        sig_algo_match = Evidence.query.filter(
            and_(
                _not_deleted_filter(),
                Evidence.signature_algorithm.isnot(None),
                Evidence.signature_algorithm == pqc_engine.sig_algorithm,
            )
        ).count()

        sig_algorithms = [
            row[0]
            for row in db.session.query(Evidence.signature_algorithm)
            .filter(and_(_not_deleted_filter(), Evidence.signature_algorithm.isnot(None)))
            .distinct()
            .all()
            if row[0]
        ]

        integrity_cutoff = datetime.utcnow() - timedelta(hours=24)
        integrity_baseline = _resolve_integrity_baseline()
        integrity_window_start = (
            max(integrity_cutoff, integrity_baseline)
            if integrity_baseline
            else integrity_cutoff
        )
        integrity_success = AuditLog.query.filter(
            AuditLog.timestamp >= integrity_window_start,
            AuditLog.action == "evidence_integrity_check",
            AuditLog.status == "success",
        ).count()
        integrity_fail = AuditLog.query.filter(
            AuditLog.timestamp >= integrity_window_start,
            AuditLog.action.in_(["signature_verification_failed", "integrity_check_failed"]),
            AuditLog.status == "failure",
        ).count()
        integrity_total = integrity_success + integrity_fail

        last_integrity_log = (
            AuditLog.query.filter(
                AuditLog.action.in_(
                    ["evidence_integrity_check", "signature_verification_failed", "integrity_check_failed"]
                )
            )
            .order_by(AuditLog.timestamp.desc())
            .first()
        )
        last_integrity_at = (
            last_integrity_log.timestamp.isoformat() if last_integrity_log else None
        )

        last_key_issue_log = (
            AuditLog.query.filter(
                AuditLog.action == "user_registration",
                AuditLog.status == "success",
            )
            .order_by(AuditLog.timestamp.desc())
            .first()
        )
        last_key_issue_at = (
            last_key_issue_log.timestamp.isoformat() if last_key_issue_log else None
        )

        pqc_key_present = or_(
            User.pqc_sig_public_key.isnot(None),
            User.pqc_public_key.isnot(None),
        )
        total_pqc_identities = User.query.filter(pqc_key_present).count()
        active_pqc_identities = User.query.filter(
            User.is_active.is_(True),
            pqc_key_present,
        ).count()

        return jsonify(
            {
                "overview": {
                    "active_investigations": open_cases,
                    "pending_approvals": pending_approvals,
                    "approved_evidence": approved_evidence,
                    "rejected_evidence": rejected_evidence,
                    "tamper_alerts_24h": tamper_alerts,
                },
                "pqc": {
                    "has_oqs": HAS_OQS,
                    "kem_algorithm": pqc_engine.kex_algorithm,
                    "sig_algorithm": pqc_engine.sig_algorithm,
                    "key_health": "healthy" if HAS_OQS else "degraded",
                    "pqc_identities": total_pqc_identities,
                    "active_identities": active_pqc_identities,
                    "evidence_signed": signed_evidence,
                    "evidence_total": total_evidence,
                    "evidence_signed_pct": _pct(signed_evidence, total_evidence),
                    "sig_algorithm_coverage_pct": _pct(sig_algo_set, total_evidence),
                    "sig_algorithm_match": sig_algo_match,
                    "sig_algorithm_match_pct": _pct(sig_algo_match, sig_algo_set or total_evidence),
                    "sig_algorithms_in_use": sig_algorithms,
                    "integrity_checks_24h": {
                        "total": integrity_total,
                        "passed": integrity_success,
                        "failed": integrity_fail,
                        "pass_rate": _pct(integrity_success, integrity_total),
                    },
                    "integrity_baseline_at": (
                        integrity_baseline.isoformat() if integrity_baseline else None
                    ),
                    "last_integrity_check_at": last_integrity_at,
                    "last_key_issue_at": last_key_issue_at,
                },
                "health": health_series,
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/health-history", methods=["GET"])
@require_roles("admin")
def health_history():
    """Return 24-hour hourly activity percentage for a selected local date."""
    date_param = (request.args.get("date") or "").strip()
    tz_offset_minutes = _parse_tz_offset_minutes(request.args.get("tz_offset_minutes"))
    selected_date = _parse_health_date(date_param)
    if selected_date is None:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400
    if tz_offset_minutes is None:
        return jsonify({"error": "Invalid tz_offset_minutes"}), 400

    try:
        load1 = 0.0
        if hasattr(os, "getloadavg"):
            try:
                load1 = float(os.getloadavg()[0])
            except OSError:
                load1 = 0.0
        server_load_pct = max(0, min(100, int((load1 / 4.0) * 100)))

        points, minute_count_map, _ = _build_health_onoff_series(
            selected_date, tz_offset_minutes
        )
        summary = _build_health_summary(
            selected_date, minute_count_map, tz_offset_minutes
        )

        return (
            jsonify(
                {
                    "date": selected_date.isoformat(),
                    "timezone": "local",
                    "tz_offset_minutes": tz_offset_minutes,
                    "interval": "1 hour",
                    "y_axis": {"min": 0, "max": 100},
                    "server_load_pct": server_load_pct,
                    "summary": summary,
                    "points": points,
                }
            ),
            200,
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/health-history/minutes", methods=["GET"])
@require_roles("admin")
def health_history_minutes():
    """Return minute-level server load percentage for a specific local date and hour."""
    date_param = (request.args.get("date") or "").strip()
    hour_param = (request.args.get("hour") or "").strip()
    tz_offset_minutes = _parse_tz_offset_minutes(request.args.get("tz_offset_minutes"))
    selected_date = _parse_health_date(date_param)
    if selected_date is None:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400
    if tz_offset_minutes is None:
        return jsonify({"error": "Invalid tz_offset_minutes"}), 400
    try:
        selected_hour = int(hour_param)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid hour. Use 0-23"}), 400
    if selected_hour < 0 or selected_hour > 23:
        return jsonify({"error": "Invalid hour. Use 0-23"}), 400

    try:
        _, minute_count_map, minute_load_map = _build_health_onoff_series(
            selected_date, tz_offset_minutes
        )
        minute_counts = minute_count_map[selected_hour]
        minute_loads = minute_load_map[selected_hour]

        now_local = datetime.utcnow() - timedelta(minutes=tz_offset_minutes)
        if selected_date == now_local.date():
            if selected_hour < now_local.hour:
                considered_minutes = 60
            elif selected_hour == now_local.hour:
                considered_minutes = now_local.minute + 1
            else:
                considered_minutes = 0
        else:
            considered_minutes = 60

        considered_slice = minute_counts[:considered_minutes]
        total_events = sum(considered_slice)

        points = [
            {
                "minute": minute,
                "label": f"{selected_hour:02d}:{minute:02d}",
                "events": minute_counts[minute] if minute < considered_minutes else 0,
                "has_sample": (
                    minute < considered_minutes and minute_counts[minute] > 0
                ),
                "percentage": (
                    minute_loads[minute]
                    if minute < considered_minutes and minute_counts[minute] > 0
                    else 0
                ),
                "uptime_pct": (
                    100
                    if minute < considered_minutes and minute_counts[minute] > 0
                    else 0
                ),
            }
            for minute in range(60)
        ]
        return jsonify(
            {
                "date": selected_date.isoformat(),
                "timezone": "local",
                "tz_offset_minutes": tz_offset_minutes,
                "hour": selected_hour,
                "interval": "1 minute",
                "y_axis": {"min": 0, "max": 100},
                "considered_minutes": considered_minutes,
                "total_events": total_events,
                "points": points,
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/evidence/pending", methods=["GET"])
@require_roles("admin")
def pending_evidence():
    """Return pending evidence uploads that require admin approval."""
    try:
        pending = (
            Evidence.query
            .filter(and_(_not_deleted_filter(), _approval_status_filter("pending")))
            .order_by(Evidence.uploaded_at.asc())
            .all()
        )
        return jsonify({"count": len(pending), "items": _evidence_with_usernames(pending)}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/evidence/by-status", methods=["GET"])
@require_roles("admin")
def evidence_by_status():
    """Return evidence list by approval status (pending, approved, rejected)."""
    try:
        status = (request.args.get("status") or "pending").strip().lower()
        if status not in ALLOWED_APPROVAL_STATUSES:
            return jsonify({"error": "Invalid status"}), 400

        evidence_items = (
            Evidence.query
            .filter(and_(_not_deleted_filter(), _approval_status_filter(status)))
            .order_by(Evidence.uploaded_at.desc())
            .all()
        )
        return jsonify({"status": status, "count": len(evidence_items), "items": _evidence_with_usernames(evidence_items)}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/evidence/<evidence_id>/approve", methods=["POST"])
@require_roles("admin")
def approve_evidence(evidence_id):
    """Approve evidence and sign approval with admin Dilithium key."""
    admin_user_id = get_jwt_identity()
    try:
        evidence = Evidence.query.get(evidence_id)
        if not evidence or evidence.is_deleted:
            return jsonify({"error": "Evidence not found"}), 404
        current_status = str(evidence.approval_status or "approved").strip().lower()
        if current_status == "approved":
            return jsonify({"error": "Evidence already approved"}), 409

        admin_user = User.query.get(admin_user_id)
        sig_secret_key = admin_user.get_sig_secret_key() if admin_user else None
        admin_sig_algorithm = (admin_user.pqc_sig_algorithm if admin_user else None) or pqc_engine.sig_algorithm
        if not sig_secret_key:
            return jsonify({"error": "Admin signing key missing"}), 500

        approved_at = datetime.utcnow()
        signature_payload = _canonical_json(
            {
                "evidence_id": evidence.id,
                "file_hash": evidence.file_hash,
                "case_id": evidence.case_id,
                "approved_by": admin_user_id,
                "approved_at": approved_at.isoformat(),
            }
        )
        approval_signature = pqc_engine.sign(signature_payload, sig_secret_key, sig_algorithm=admin_sig_algorithm)

        evidence.approval_status = "approved"
        evidence.approved_by = admin_user_id
        evidence.approved_at = approved_at
        evidence.approval_signature = approval_signature
        evidence.access_level = "court"

        custody_signature = pqc_engine.sign(
            _canonical_json({"evidence_id": evidence.id, "action": "approve"}),
            sig_secret_key,
            sig_algorithm=admin_sig_algorithm,
        )
        db.session.add(
            CustodyRecord(
                evidence_id=evidence.id,
                user_id=admin_user_id,
                action="approve",
                ip_address=request.remote_addr,
                signature=custody_signature,
            )
        )

        _create_audit_log(
            admin_user_id,
            "evidence_approve",
            "evidence",
            evidence.id,
            details={"approval_status": "approved"},
        )
        db.session.commit()
        return jsonify({"message": "Evidence approved", "evidence": evidence.to_dict()}), 200
    except Exception as exc:
        db.session.rollback()
        _create_audit_log(
            admin_user_id,
            "evidence_approve",
            "evidence",
            evidence_id,
            status="failure",
            error_message=str(exc),
        )
        db.session.commit()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/evidence/<evidence_id>/deny", methods=["POST"])
@require_roles("admin")
def deny_evidence(evidence_id):
    """Deny evidence from entering official chain of custody."""
    admin_user_id = get_jwt_identity()
    try:
        evidence = Evidence.query.get(evidence_id)
        if not evidence or evidence.is_deleted:
            return jsonify({"error": "Evidence not found"}), 404
        current_status = str(evidence.approval_status or "approved").strip().lower()
        if current_status == "rejected":
            return jsonify({"error": "Evidence already rejected"}), 409

        reason = (request.get_json(silent=True) or {}).get("reason", "")
        evidence.approval_status = "rejected"
        evidence.approved_by = admin_user_id
        evidence.approved_at = datetime.utcnow()
        evidence.approval_signature = None
        evidence.access_level = "restricted"

        admin_user = User.query.get(admin_user_id)
        sig_secret_key = admin_user.get_sig_secret_key() if admin_user else None
        admin_sig_algorithm = (admin_user.pqc_sig_algorithm if admin_user else None) or pqc_engine.sig_algorithm
        custody_signature = None
        if sig_secret_key:
            custody_signature = pqc_engine.sign(
                _canonical_json({"evidence_id": evidence.id, "action": "deny", "reason": reason}),
                sig_secret_key,
                sig_algorithm=admin_sig_algorithm,
            )

        db.session.add(
            CustodyRecord(
                evidence_id=evidence.id,
                user_id=admin_user_id,
                action="deny",
                notes=reason[:500] if reason else None,
                ip_address=request.remote_addr,
                signature=custody_signature,
            )
        )

        _create_audit_log(
            admin_user_id,
            "evidence_deny",
            "evidence",
            evidence.id,
            details={"approval_status": "rejected", "reason": reason},
        )
        db.session.commit()
        return jsonify({"message": "Evidence rejected", "evidence": evidence.to_dict()}), 200
    except Exception as exc:
        db.session.rollback()
        _create_audit_log(
            admin_user_id,
            "evidence_deny",
            "evidence",
            evidence_id,
            status="failure",
            error_message=str(exc),
        )
        db.session.commit()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/cases/approvals", methods=["GET"])
@require_roles("admin")
def list_case_approvals():
    """List case files by approval status for admin review."""
    try:
        status_filter = (request.args.get("status") or "pending").strip().lower()
        if status_filter and status_filter != "all" and status_filter not in ALLOWED_APPROVAL_STATUSES:
            return (
                jsonify({"error": "status must be one of: pending, approved, rejected, all"}),
                400,
            )
        limit = request.args.get("limit", default=200, type=int)
        limit = max(1, min(int(limit or 200), 250))

        query = CaseFile.query
        if status_filter and status_filter != "all":
            query = query.filter(_case_approval_status_filter(status_filter))

        cases = query.order_by(CaseFile.created_at.desc()).limit(limit).all()
        user_ids = {
            user_id for user_id in [case.created_by for case in cases] + [case.approved_by for case in cases]
            if user_id
        }
        user_map = {
            user.id: user.username
            for user in User.query.filter(User.id.in_(user_ids)).all()
        } if user_ids else {}

        payload = []
        for case in cases:
            item = case.to_dict()
            item["created_by_username"] = user_map.get(case.created_by)
            item["approved_by_username"] = user_map.get(case.approved_by)
            payload.append(item)

        return jsonify({"count": len(payload), "cases": payload}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/cases/<case_id>/approve", methods=["POST"])
@require_roles("admin")
def approve_case_file(case_id):
    """Approve a pending case file and assign its creator if applicable."""
    admin_user_id = get_jwt_identity()
    try:
        case_file = CaseFile.query.filter_by(id=str(case_id)).first()
        if not case_file:
            return jsonify({"error": "Case file not found"}), 404

        current_status = str(case_file.approval_status or "approved").strip().lower()
        if current_status != "pending":
            return jsonify({"error": f"Case already {current_status}"}), 409

        payload = request.get_json(silent=True) or {}
        notes = str(payload.get("notes") or "").strip() or None

        case_file.approval_status = "approved"
        case_file.approved_by = admin_user_id
        case_file.approved_at = _utcnow()
        case_file.approval_notes = notes

        if not case_file.assigned_investigator_id:
            creator = User.query.filter_by(id=case_file.created_by).first()
            if creator and creator.role == "investigator" and creator.is_active:
                case_file.assigned_investigator_id = creator.id
                if str(case_file.status or "").strip().lower() in {"", "open"}:
                    case_file.status = "investigation"

        _create_audit_log(
            user_id=admin_user_id,
            action="case_file_approve",
            resource_type="case_file",
            resource_id=case_file.id,
            details={
                "case_number": case_file.case_number,
                "assigned_investigator_id": case_file.assigned_investigator_id,
                "notes": notes,
            },
        )
        db.session.commit()
        return jsonify({"message": "Case approved", "case": case_file.to_dict()}), 200
    except Exception as exc:
        db.session.rollback()
        _create_audit_log(
            user_id=admin_user_id,
            action="case_file_approve",
            resource_type="case_file",
            resource_id=case_id,
            status="failure",
            error_message=str(exc),
        )
        db.session.commit()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/cases/<case_id>/reject", methods=["POST"])
@require_roles("admin")
def reject_case_file(case_id):
    """Reject a pending case file."""
    admin_user_id = get_jwt_identity()
    try:
        case_file = CaseFile.query.filter_by(id=str(case_id)).first()
        if not case_file:
            return jsonify({"error": "Case file not found"}), 404

        current_status = str(case_file.approval_status or "approved").strip().lower()
        if current_status != "pending":
            return jsonify({"error": f"Case already {current_status}"}), 409

        payload = request.get_json(silent=True) or {}
        notes = str(payload.get("notes") or "").strip() or None

        case_file.approval_status = "rejected"
        case_file.approved_by = admin_user_id
        case_file.approved_at = _utcnow()
        case_file.approval_notes = notes
        case_file.assigned_investigator_id = None

        _create_audit_log(
            user_id=admin_user_id,
            action="case_file_reject",
            resource_type="case_file",
            resource_id=case_file.id,
            details={
                "case_number": case_file.case_number,
                "notes": notes,
            },
        )
        db.session.commit()
        return jsonify({"message": "Case rejected", "case": case_file.to_dict()}), 200
    except Exception as exc:
        db.session.rollback()
        _create_audit_log(
            user_id=admin_user_id,
            action="case_file_reject",
            resource_type="case_file",
            resource_id=case_id,
            status="failure",
            error_message=str(exc),
        )
        db.session.commit()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/aadhar-check", methods=["POST"])
@require_roles("admin")
def check_aadhar():
    """Check whether an Aadhar number is already registered."""
    try:
        data = request.get_json() or {}
        raw_value = data.get("aadhar_number", "")
        try:
            normalized = normalize_aadhar_number(raw_value)
        except ValueError:
            return jsonify({"error": "Aadhar number must contain exactly 12 digits"}), 400

        aadhar_hash = hash_aadhar_number(normalized)
        exists = User.query.filter_by(aadhar_hash=aadhar_hash).first() is not None

        if not exists:
            legacy_users = (
                User.query.filter(User.aadhar_hash.is_(None), User.aadhar_number.isnot(None)).all()
            )
            for legacy_user in legacy_users:
                try:
                    if normalize_aadhar_number(legacy_user.aadhar_number) == normalized:
                        exists = True
                        break
                except ValueError:
                    continue

        return jsonify({"exists": exists, "masked": masked_aadhar(normalized)}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/users", methods=["GET"])
@require_roles("admin")
def list_users():
    """List all users."""
    try:
        users = User.query.order_by(User.created_at.desc()).all()

        deleted_ids = set()
        deleted_logs = (
            AuditLog.query.filter(
                AuditLog.action == "user_deleted_permanent",
                AuditLog.resource_type == "user",
                AuditLog.resource_id.isnot(None),
            ).all()
        )
        for log in deleted_logs:
            try:
                deleted_ids.add(int(log.resource_id))
            except (TypeError, ValueError):
                continue

        if deleted_ids:
            users = [user for user in users if user.id not in deleted_ids]

        user_ids = [u.id for u in users]
        latest_activity_rows = (
            db.session.query(AuditLog.user_id, func.max(AuditLog.timestamp).label("last_activity_at"))
            .filter(AuditLog.user_id.in_(user_ids))
            .group_by(AuditLog.user_id)
            .all()
            if user_ids
            else []
        )
        latest_activity_map = {
            row.user_id: row.last_activity_at.isoformat() if row.last_activity_at else None
            for row in latest_activity_rows
        }

        created_by_map = {}
        if user_ids:
            creation_logs = (
                AuditLog.query.filter(
                    AuditLog.action == "user_registration",
                    AuditLog.status == "success",
                )
                .order_by(AuditLog.timestamp.desc())
                .all()
            )
            for log in creation_logs:
                details = _safe_parse_details(log.details)
                created_user_id = details.get("created_user_id")
                if created_user_id is None:
                    continue
                try:
                    created_user_id = int(created_user_id)
                except (TypeError, ValueError):
                    continue
                if created_user_id in user_ids and created_user_id not in created_by_map:
                    created_by_map[created_user_id] = log.user_id

        creator_ids = {actor_id for actor_id in created_by_map.values() if actor_id}
        creator_map = (
            {user.id: user.username for user in User.query.filter(User.id.in_(creator_ids)).all()}
            if creator_ids
            else {}
        )

        def _user_ref(user_id):
            if not user_id:
                return None
            return {"id": user_id, "username": creator_map.get(user_id) or f"user:{user_id}"}

        payload = []
        for user in users:
            item = user.to_dict()
            item["has_pqid"] = bool(user.pqid)
            item["last_activity_at"] = latest_activity_map.get(user.id)
            item["is_physically_verified"] = bool(user.is_physically_verified)
            item["created_by"] = _user_ref(created_by_map.get(user.id))
            item["verified_by"] = (
                _user_ref(created_by_map.get(user.id)) if user.is_physically_verified else None
            )
            payload.append(item)

        return jsonify({"count": len(payload), "users": payload}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/users/<int:user_id>/pqid", methods=["POST"])
@require_roles("admin")
def view_user_pqid(user_id):
    """Return a user's PQID after passkey confirmation."""
    try:
        acting_user_id = get_jwt_identity()
        data = request.get_json() or {}
        password = str(data.get("password", "")).strip()
        if not password:
            return jsonify({"error": "Password is required"}), 400

        admin_user = User.query.get(acting_user_id)
        if not admin_user:
            return jsonify({"error": "Admin user not found"}), 404

        target_user = User.query.get(user_id)
        if not target_user:
            return jsonify({"error": "User not found"}), 404

        if not admin_user.check_password(password):
            return jsonify({"error": "Invalid password"}), 401

        if not target_user.pqid:
            return jsonify({"error": "PQID not available"}), 404

        _create_audit_log(
            user_id=acting_user_id,
            action="pqid_view",
            resource_type="user",
            resource_id=target_user.id,
            details={
                "target_user_id": target_user.id,
                "target_username": target_user.username,
            },
        )
        db.session.commit()

        return jsonify({"pqid": target_user.pqid}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
@require_roles("admin")
def update_user(user_id):
    """Update user profile and role."""
    try:
        acting_user_id = get_jwt_identity()
        data = request.get_json() or {}
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        previous_role = user.role
        previous_email = user.email

        if "email" in data:
            if User.query.filter_by(email=data["email"]).filter(User.id != user_id).first():
                return jsonify({"error": "Email already in use"}), 409
            user.email = data["email"]

        if "role" in data:
            if data["role"] not in ALLOWED_ROLES:
                return jsonify({"error": "Invalid role"}), 400
            user.role = data["role"]

        if "is_active" in data:
            user.is_active = bool(data["is_active"])

        if user.role != previous_role:
            _create_audit_log(
                user_id=acting_user_id,
                action="user_role_change",
                resource_type="user",
                resource_id=user.id,
                details={
                    "username": user.username,
                    "old_role": previous_role,
                    "new_role": user.role,
                },
            )

        if user.email != previous_email:
            _create_audit_log(
                user_id=acting_user_id,
                action="user_email_change",
                resource_type="user",
                resource_id=user.id,
                details={
                    "username": user.username,
                    "old_email": previous_email,
                    "new_email": user.email,
                },
            )

        db.session.commit()
        return jsonify({"message": "User updated successfully", "user": user.to_dict()}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@require_roles("admin")
def delete_user(user_id):
    """Remove user access and revoke active sessions."""
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
        acting_user_id = get_jwt_identity()
        if user.id == acting_user_id:
            return jsonify({"error": "You cannot delete your own access"}), 400

        user.is_active = False
        revoked_count = (
            db.session.query(RefreshToken)
            .filter(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked_at.is_(None),
            )
            .update({"revoked_at": _utcnow()}, synchronize_session=False)
        )

        _create_audit_log(
            user_id=acting_user_id,
            action="user_deactivate",
            resource_type="user",
            resource_id=user.id,
            details={
                "username": user.username,
                "role": user.role,
                "revoked_sessions": revoked_count,
            },
        )
        db.session.commit()
        return jsonify({"message": "User deactivated successfully"}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/users/<int:user_id>/purge", methods=["DELETE"])
@require_roles("admin")
def purge_user(user_id):
    """Permanently remove a deactivated user from active rosters."""
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
        acting_user_id = get_jwt_identity()
        if user.id == acting_user_id:
            return jsonify({"error": "You cannot delete your own account"}), 400
        if user.is_active:
            return jsonify({"error": "Deactivate the user before permanent deletion"}), 409

        revoked_count = (
            db.session.query(RefreshToken)
            .filter(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked_at.is_(None),
            )
            .update({"revoked_at": _utcnow()}, synchronize_session=False)
        )

        WebAuthnCredential.query.filter_by(user_id=user.id).delete(synchronize_session=False)

        original_details = {
            "username": user.username,
            "email": user.email,
            "role": user.role,
        }
        if user.aadhar_number:
            try:
                original_details["aadhar_ref"] = masked_aadhar(normalize_aadhar_number(user.aadhar_number))
            except ValueError:
                original_details["aadhar_ref"] = None

        tombstone = f"deleted-{user.id}-{int(_utcnow().timestamp())}"
        user.username = f"deleted_user_{tombstone}"
        user.email = f"deleted_{tombstone}@example.invalid"
        user.pqid = None
        user.aadhar_number = None
        user.aadhar_hash = None
        user.address = None
        user.phone_number = None
        user.designation = None
        user.court_details = None
        user.station_name = None
        user.is_physically_verified = False
        user.webauthn_required = False
        user.webauthn_user_handle = None
        user.webauthn_enrolled_at = None
        user.is_active = False

        _create_audit_log(
            user_id=acting_user_id,
            action="user_deleted_permanent",
            resource_type="user",
            resource_id=user.id,
            details={
                **original_details,
                "revoked_sessions": revoked_count,
            },
        )
        db.session.commit()
        return jsonify({"message": "User deleted permanently"}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/audit-logs", methods=["GET"])
@require_roles("admin")
def get_audit_logs():
    """Get audit logs with filters and integrity metadata."""
    try:
        action = request.args.get("action")
        user_id = request.args.get("user_id", type=int)
        resource_type = request.args.get("resource_type")
        limit = request.args.get("limit", default=1000, type=int)

        date_param = (request.args.get("date") or "").strip()
        tz_offset_minutes = _parse_tz_offset_minutes(request.args.get("tz_offset_minutes"))

        query = AuditLog.query

        if date_param:
            selected_date = _parse_health_date(date_param)
            if selected_date:
                # Filter by 24h period in user's timezone
                offset = tz_offset_minutes or 0
                local_day_start = datetime.combine(selected_date, time.min)
                utc_day_start = local_day_start + timedelta(minutes=offset)
                utc_day_end = utc_day_start + timedelta(days=1)
                query = query.filter(
                    AuditLog.timestamp >= utc_day_start,
                    AuditLog.timestamp < utc_day_end
                )

        if action:
            query = query.filter_by(action=action)
        if user_id:
            query = query.filter_by(user_id=user_id)
        if resource_type:
            query = query.filter_by(resource_type=resource_type)

        logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
        logs = [log for log in logs if not _is_known_false_positive_tamper(log)]
        user_ids = {log.user_id for log in logs if log.user_id}
        usernames = {
            user.id: user.username for user in User.query.filter(User.id.in_(user_ids)).all()
        }

        enriched_logs = []
        for log in logs:
            base = log.to_dict()
            fallback_username = _attempted_username_from_log_details(base.get("details"))
            base["user"] = (
                {"id": log.user_id, "username": usernames.get(log.user_id)}
                if log.user_id
                else {"id": None, "username": fallback_username or "System"}
            )
            base["integrity_badge"] = _audit_integrity_badge(log.action)
            base["sha3_hash"] = _log_entry_hash(base)
            base["chain_status"] = "verified" if _is_chain_valid(log) else "tampered"
            enriched_logs.append(base)

        return jsonify({"count": len(enriched_logs), "logs": enriched_logs}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/audit-logs/export", methods=["GET"])
@require_roles("admin")
def export_audit_logs():
    """Export audit logs as PDF."""
    try:
        start_param = request.args.get("from")
        end_param = request.args.get("to")
        start_dt = _parse_iso_datetime(start_param)
        end_dt = _parse_iso_datetime(end_param)

        query = AuditLog.query
        if start_dt:
            query = query.filter(AuditLog.timestamp >= start_dt)
        if end_dt:
            query = query.filter(AuditLog.timestamp <= end_dt)

        logs = query.order_by(AuditLog.timestamp.asc()).all()
        user_ids = {log.user_id for log in logs if log.user_id}
        usernames = {
            user.id: user.username for user in User.query.filter(User.id.in_(user_ids)).all()
        } if user_ids else {}

        critical_tokens = [
            "signature_verification_failed",
            "integrity_check_failed",
            "tamper_attempt",
            "decryption_failed",
        ]
        repeat_tokens = [
            "login_attempt",
            "token_refresh",
            "evidence_view",
            "custody_chain_view",
        ]

        def is_alert_log(action, status, chain_status):
            action_text = str(action or "").lower()
            if chain_status == "tampered":
                return True
            if any(token in action_text for token in critical_tokens):
                return True
            if str(status or "").lower() == "failure" and any(token in action_text for token in repeat_tokens):
                return True
            return False

        styles = getSampleStyleSheet()
        title_style = styles["Heading2"]
        meta_style = styles["BodyText"]
        meta_style.fontSize = 9
        meta_style.leading = 11
        cell_style = styles["BodyText"]
        cell_style.fontSize = 8
        cell_style.leading = 10

        def cell(value):
            return Paragraph(escape(str(value or "")), cell_style)

        data = [
            [
                "Timestamp (UTC)",
                "Actor",
                "Action",
                "Status",
                "Resource",
                "Chain",
                "IP Address",
            ]
        ]
        alert_rows = []

        for log in logs:
            chain_status = "verified" if _is_chain_valid(log) else "tampered"
            fallback_username = _attempted_username_from_log_details(log.details)
            actor = usernames.get(log.user_id) or fallback_username or "System"
            resource = log.resource_type or "N/A"
            if log.resource_id:
                resource = f"{resource}:{log.resource_id}"
            row = [
                cell(_format_pdf_timestamp(log.timestamp)),
                cell(actor),
                cell(_audit_action_label(log.action)),
                cell(str(log.status or "")),
                cell(resource),
                cell(chain_status),
                cell(str(log.ip_address or "")),
            ]
            data.append(row)
            alert_rows.append(is_alert_log(log.action, log.status, chain_status))

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(letter),
            leftMargin=24,
            rightMargin=24,
            topMargin=24,
            bottomMargin=24,
        )

        export_range = "All available logs"
        if start_dt and end_dt:
            export_range = f"{_format_pdf_timestamp(start_dt)} to {_format_pdf_timestamp(end_dt)}"
        elif start_dt:
            export_range = f"From {_format_pdf_timestamp(start_dt)}"
        elif end_dt:
            export_range = f"Up to {_format_pdf_timestamp(end_dt)}"

        elements = [
            Paragraph("Audit Log Export", title_style),
            Spacer(1, 6),
            Paragraph(f"Range: {escape(export_range)}", meta_style),
            Paragraph(f"Generated: {_format_pdf_timestamp(datetime.utcnow())}", meta_style),
            Spacer(1, 12),
        ]

        col_widths = [120, 90, 170, 65, 155, 70, 100]
        table = Table(data, colWidths=col_widths, repeatRows=1)
        table_style = TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6e6e6")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#9aa3ad")),
            ]
        )
        for idx, is_alert in enumerate(alert_rows, start=1):
            if is_alert:
                table_style.add("TEXTCOLOR", (0, idx), (-1, idx), colors.red)
            else:
                table_style.add("TEXTCOLOR", (0, idx), (-1, idx), colors.black)

        table.setStyle(table_style)
        elements.append(table)
        doc.build(elements)

        buffer.seek(0)
        filename = "audit-logs.pdf"
        return (
            buffer.getvalue(),
            200,
            {
                "Content-Type": "application/pdf",
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/system-status", methods=["GET"])
@require_roles("admin")
def system_status():
    """Get system status and statistics."""
    try:
        total_users = User.query.count()
        active_users = User.query.filter_by(is_active=True).count()
        total_audit_logs = AuditLog.query.count()
        total_evidence = Evidence.query.filter_by(is_deleted=False).count()
        recent_logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(10).all()

        return jsonify(
            {
                "system": "PQC Evidence Management System",
                "status": "operational",
                "statistics": {
                    "total_users": total_users,
                    "active_users": active_users,
                    "total_audit_logs": total_audit_logs,
                    "total_evidence": total_evidence,
                },
                # Compatibility keys for existing dashboard component
                "users_count": total_users,
                "evidence_count": total_evidence,
                "audit_logs_count": total_audit_logs,
                "recent_activity": [log.to_dict() for log in recent_logs],
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/backups", methods=["GET"])
@require_roles("admin")
def list_backups():
    """List available database backups."""
    try:
        backup_dir = _backup_dir()
        if not os.path.isdir(backup_dir):
            return jsonify({"backups": []}), 200
        backups = []
        for name in sorted(os.listdir(backup_dir)):
            if not name.endswith(".db"):
                continue
            path = os.path.join(backup_dir, name)
            if not os.path.isfile(path):
                continue
            backups.append(
                {
                    "filename": name,
                    "size_bytes": os.path.getsize(path),
                    "modified_at": datetime.utcfromtimestamp(os.path.getmtime(path)).isoformat() + "Z",
                }
            )
        return jsonify({"backups": backups}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/backups", methods=["POST"])
@require_roles("admin")
def create_backup():
    """Check for log manipulation, backup if necessary, and return status."""
    try:
        logs = AuditLog.query.order_by(AuditLog.id.asc()).all()
        analysis = _analyze_audit_backup_issues(logs)
        issues = analysis["issues"]
        summary = _summarize_audit_issues(issues)

        if issues:
            backup_dir = _backup_dir()
            os.makedirs(backup_dir, exist_ok=True)
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = f"manipulated_audit_logs_{timestamp}.json"
            backup_path = os.path.join(backup_dir, filename)
            payload = {
                "generated_at": _isoformat_z(_utcnow()),
                "summary": summary,
                "source": "baseline" if analysis["has_baseline"] else "structural",
                "logs": issues,
            }
            with open(backup_path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)

            message = "Manipulation detected. A backup of the affected audit logs was created."
            if not analysis["has_baseline"]:
                message = (
                    "Audit anomalies were detected before a clean baseline could be confirmed. "
                    "A backup of the affected audit logs was created."
                )

            return jsonify(
                {
                    "manipulated": True,
                    "message": message,
                    "backup_filename": filename,
                    "baseline_created": False,
                    "summary": summary,
                    "logs": issues,
                }
            ), 200

        _write_audit_integrity_baseline(analysis["current_records"])
        baseline_created = not analysis["has_baseline"]
        message = "No manipulation happened."
        if baseline_created:
            message = "No manipulation happened. Audit integrity baseline created for future checks."

        return jsonify(
            {
                "manipulated": False,
                "message": message,
                "backup_filename": None,
                "baseline_created": baseline_created,
                "summary": summary,
                "logs": [],
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/backups/download/<path:filename>", methods=["GET"])
@require_roles("admin")
def download_backup(filename):
    """Download a database backup file."""
    try:
        backup_dir = _backup_dir()
        backup_path = _safe_backup_path(backup_dir, filename)
        if not backup_path or not os.path.exists(backup_path):
            return jsonify({"error": "Backup file not found"}), 404
        return send_file(backup_path, as_attachment=True, download_name=os.path.basename(backup_path))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@admin_bp.route("/backups/restore", methods=["POST"])
@require_roles("admin")
def restore_backup():
    """Restore the database from a backup file (latest if not specified)."""
    try:
        payload = request.get_json(silent=True) or {}
        filename = str(payload.get("filename") or "").strip()
        backup_dir = _backup_dir()
        if not os.path.isdir(backup_dir):
            return jsonify({"error": "No backups directory found"}), 404

        backup_path = None
        if filename:
            candidate = _safe_backup_path(backup_dir, filename)
            if candidate and os.path.exists(candidate):
                backup_path = candidate
        else:
            candidates = [
                os.path.join(backup_dir, name)
                for name in os.listdir(backup_dir)
                if name.endswith(".db")
            ]
            if candidates:
                backup_path = max(candidates, key=os.path.getmtime)

        if not backup_path or not os.path.exists(backup_path):
            return jsonify({"error": "Backup file not found"}), 404

        db_path = _resolve_db_path()
        if not db_path or not os.path.exists(db_path):
            return jsonify({"error": "Database file not found"}), 404

        os.makedirs(backup_dir, exist_ok=True)
        safety_name = f"pre_restore_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.db"
        safety_path = os.path.join(backup_dir, safety_name)
        shutil.copy2(db_path, safety_path)

        db.session.remove()
        db.engine.dispose()
        shutil.copy2(backup_path, db_path)

        return jsonify(
            {
                "restored": os.path.basename(backup_path),
                "safety_backup": safety_name,
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
