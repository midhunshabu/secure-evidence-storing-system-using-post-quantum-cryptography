"""Evidence Management Routes"""
from flask import Blueprint, request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app import db, limiter
from app.models.user import User
from app.models.case_file import CaseFile
from app.models.case_book_page import CaseBookPage
from app.models.court_access import CaseAccessGrant, CaseAccessRequest
from app.models.evidence import Evidence, CustodyRecord
from app.models.audit_log import AuditLog
from app.modules.pqc_engine import pqc_engine
from app.utils.pqid import verify_pqid
from datetime import datetime, timedelta
import mimetypes
import os
import hashlib
import json
import re
import uuid
from werkzeug.utils import secure_filename
from io import BytesIO
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_

evidence_bp = Blueprint('evidence', __name__)

ALLOWED_EXTENSIONS = None
COURT_ACCESS_STATUSES = {'pending', 'approved', 'denied'}
COURT_ACCESS_MIN_DURATION_MINUTES = 1
COURT_ACCESS_MAX_DURATION_MINUTES = 43200  # 30 days
CASE_BOOK_BLOCKED_EXTENSIONS = {
    'app',
    'bat',
    'bin',
    'cmd',
    'com',
    'cpl',
    'dll',
    'dmg',
    'exe',
    'gadget',
    'jar',
    'js',
    'lnk',
    'msi',
    'msp',
    'pif',
    'ps1',
    'reg',
    'scr',
    'sh',
    'vb',
    'vbe',
    'vbs',
    'ws',
    'wsf',
}

def allowed_file(filename):
    return bool(filename and str(filename).strip())


def allowed_case_book_file(filename):
    if '.' not in filename:
        return False
    extension = filename.rsplit('.', 1)[1].lower()
    return extension not in CASE_BOOK_BLOCKED_EXTENSIONS


def log_event(user_id, action, resource_type, resource_id, details=None, status='success'):
    """Log evidence operations"""
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        # Ensure resource_id type is stable for hash-chain integrity.
        resource_id=str(resource_id) if resource_id is not None else None,
        details=json.dumps(details) if details else None,
        status=status,
        ip_address=request.remote_addr,
        user_agent=request.headers.get('User-Agent', '')
    )
    db.session.add(log)
    db.session.commit()

def build_evidence_signature_payload(evidence_data):
    """Create canonical payload for evidence signatures."""
    return json.dumps(evidence_data, sort_keys=True, separators=(',', ':'))


def _looks_encrypted(value):
    return isinstance(value, str) and value.startswith("enc::")


def _utcnow():
    return datetime.utcnow()


def _normalize_case_number(case_number):
    return str(case_number or '').strip().upper()


def _parse_incident_date(raw_value):
    if raw_value in (None, ''):
        return None
    return datetime.strptime(str(raw_value), '%Y-%m-%d').date()


def _normalize_two_letter_code(raw_value, label):
    code = ''.join(ch for ch in str(raw_value or '').strip().upper() if ch.isalpha())
    if len(code) != 2:
        raise ValueError(f'{label} must be a 2-letter alphabetic code')
    return code


def _normalize_optional_quantum_ledger_number(raw_value):
    value = str(raw_value or '').strip().upper()
    if not value:
        return ''
    if not re.fullmatch(r'QL\d{2}[A-Z]{4}\d{4}', value):
        raise ValueError(
            'quantum_ledger_number must be in format QLYY + state(2 letters) + district(2 letters) + sequence(4 digits)'
        )
    return value


def _normalize_optional_text(raw_value, max_length=1000):
    text = str(raw_value or '').strip()
    if not text:
        return None
    return text[:max_length]


def _normalize_intake_metadata(raw_value):
    if not isinstance(raw_value, dict):
        return {}
    metadata = {}
    gps_location = _normalize_optional_text(raw_value.get('gps_location'), max_length=180)
    device_type = _normalize_optional_text(raw_value.get('device_type'), max_length=120)
    case_category = _normalize_optional_text(raw_value.get('case_category'), max_length=80)
    intake_timestamp = _normalize_optional_text(raw_value.get('intake_timestamp'), max_length=80)
    client_sha3_512 = _normalize_optional_text(raw_value.get('client_sha3_512'), max_length=160)
    seal_for_transport = raw_value.get('seal_for_transport')

    if gps_location:
        metadata['gps_location'] = gps_location
    if device_type:
        metadata['device_type'] = device_type
    if case_category:
        metadata['case_category'] = case_category
    if intake_timestamp:
        metadata['intake_timestamp'] = intake_timestamp
    if client_sha3_512:
        metadata['client_sha3_512'] = client_sha3_512
    if seal_for_transport is not None:
        if isinstance(seal_for_transport, bool):
            metadata['seal_for_transport'] = seal_for_transport
        else:
            metadata['seal_for_transport'] = str(seal_for_transport).strip().lower() in {'1', 'true', 'yes', 'on'}

    return metadata


def _parse_duration_minutes(raw_value, field_name='duration_minutes'):
    try:
        value = int(str(raw_value).strip())
    except (TypeError, ValueError, AttributeError):
        raise ValueError(f'{field_name} must be a valid integer')
    if value < COURT_ACCESS_MIN_DURATION_MINUTES or value > COURT_ACCESS_MAX_DURATION_MINUTES:
        raise ValueError(
            f'{field_name} must be between {COURT_ACCESS_MIN_DURATION_MINUTES} and {COURT_ACCESS_MAX_DURATION_MINUTES} minutes'
        )
    return value


def _normalize_optional_investigator_id(raw_value):
    if raw_value in (None, ''):
        return None
    try:
        user_id = int(str(raw_value).strip())
    except (TypeError, ValueError):
        raise ValueError('assigned_investigator_id must be a valid user id')
    if user_id <= 0:
        raise ValueError('assigned_investigator_id must be a valid user id')
    return user_id


def _get_active_investigator(user_id):
    if user_id is None:
        return None
    return User.query.filter_by(id=user_id, role='investigator', is_active=True).first()


def _next_quantum_ledger_sequence(year_two_digits):
    prefix = f'QL{year_two_digits}'
    max_seen = 1817
    existing = (
        db.session.query(CaseFile.quantum_ledger_number)
        .filter(CaseFile.quantum_ledger_number.like(f'{prefix}%'))
        .all()
    )
    for row in existing:
        ledger_number = str(row[0] or '')
        tail = ledger_number[-4:]
        if tail.isdigit():
            value = int(tail)
            if value > max_seen:
                max_seen = value
    next_value = max(1818, max_seen + 1)
    if next_value > 9999:
        raise ValueError('Quantum ledger sequence exceeded yearly capacity')
    return next_value


def _build_quantum_ledger_number(state_code, district_code):
    year_two_digits = f'{datetime.utcnow().year % 100:02d}'
    sequence = _next_quantum_ledger_sequence(year_two_digits)
    return f'QL{year_two_digits}{state_code}{district_code}{sequence:04d}'


def _case_approval_status(case_file):
    if not case_file:
        return "approved"
    return str(case_file.approval_status or "approved").strip().lower()


def _is_case_approved(case_file):
    return _case_approval_status(case_file) == "approved"


def _evidence_approval_status(evidence):
    if not evidence:
        return "approved"
    return str(evidence.approval_status or "approved").strip().lower()


def _is_evidence_approved(evidence):
    return _evidence_approval_status(evidence) == "approved"


def _is_case_assigned_and_approved(case_file, user_id):
    if not case_file:
        return False
    if case_file.assigned_investigator_id != user_id:
        return False
    return _is_case_approved(case_file)


def _active_court_grant(case_file_id, court_user_id, now_utc=None):
    if not case_file_id or not court_user_id:
        return None
    reference_time = now_utc or _utcnow()
    return (
        CaseAccessGrant.query
        .filter(
            CaseAccessGrant.case_file_id == case_file_id,
            CaseAccessGrant.court_user_id == court_user_id,
            CaseAccessGrant.revoked_at.is_(None),
            CaseAccessGrant.expires_at > reference_time,
        )
        .order_by(CaseAccessGrant.expires_at.desc(), CaseAccessGrant.id.desc())
        .first()
    )


def _active_court_grant_map(court_user_id, now_utc=None):
    if not court_user_id:
        return {}
    reference_time = now_utc or _utcnow()
    rows = (
        CaseAccessGrant.query
        .filter(
            CaseAccessGrant.court_user_id == court_user_id,
            CaseAccessGrant.revoked_at.is_(None),
            CaseAccessGrant.expires_at > reference_time,
        )
        .order_by(CaseAccessGrant.expires_at.desc(), CaseAccessGrant.id.desc())
        .all()
    )
    result = {}
    for row in rows:
        if row.case_file_id and row.case_file_id not in result:
            result[row.case_file_id] = row
    return result


def _court_can_view_case(case_file_id, court_user_id, now_utc=None):
    return _active_court_grant(case_file_id, court_user_id, now_utc=now_utc) is not None


def _court_can_view_evidence(evidence, court_user_id, now_utc=None):
    if not evidence or evidence.is_deleted or not _is_evidence_approved(evidence):
        return False
    return bool(evidence.case_file_id and _court_can_view_case(evidence.case_file_id, court_user_id, now_utc=now_utc))


def _find_case_by_reference(case_number=None, quantum_ledger_number=None):
    normalized_case_number = _normalize_case_number(case_number)
    normalized_ledger_number = _normalize_optional_quantum_ledger_number(quantum_ledger_number)

    case_by_number = (
        CaseFile.query.filter_by(case_number=normalized_case_number).first()
        if normalized_case_number
        else None
    )
    case_by_ledger = (
        CaseFile.query.filter_by(quantum_ledger_number=normalized_ledger_number).first()
        if normalized_ledger_number
        else None
    )

    if case_by_number and case_by_ledger and case_by_number.id != case_by_ledger.id:
        raise ValueError('case_number and quantum_ledger_number refer to different cases')

    return case_by_number or case_by_ledger


def _can_view_case_file(case_file, role, user_id):
    if role == 'admin':
        return True
    if role == 'investigator':
        return _is_case_assigned_and_approved(case_file, user_id)
    if role == 'court_user':
        return _court_can_view_case(case_file.id, user_id)
    return False


def _detect_case_book_mime(file_content):
    if file_content.startswith(b'%PDF-'):
        return 'application/pdf'
    if file_content.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if file_content.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    return None


def _validate_case_book_file(file, file_content):
    filename = secure_filename(file.filename or '')
    if not filename:
        raise ValueError('Invalid filename')
    if not allowed_case_book_file(filename):
        raise ValueError('This file type is blocked for security reasons')

    detected_mime = _detect_case_book_mime(file_content)
    if detected_mime:
        return filename, detected_mime

    guessed_mime = mimetypes.guess_type(filename)[0]
    uploaded_mime = str(getattr(file, 'mimetype', '') or '').strip().lower()
    if uploaded_mime in {'', 'application/octet-stream'}:
        uploaded_mime = ''

    return filename, guessed_mime or uploaded_mime or 'application/octet-stream'


def _resolve_storage_path(stored_path, base_dir=None):
    if not stored_path:
        return stored_path
    if os.path.isabs(stored_path):
        return stored_path
    base = base_dir or os.path.abspath(os.path.join(current_app.root_path, ".."))
    candidate = os.path.abspath(os.path.join(base, stored_path))
    if os.path.exists(candidate):
        return candidate
    return stored_path


def _guess_evidence_mime(filename):
    guessed = mimetypes.guess_type(filename or '')[0]
    return guessed or 'application/octet-stream'


@evidence_bp.route('/investigators', methods=['GET'])
@jwt_required()
def list_investigators():
    """List active investigator users for case assignment."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role')
        if role not in ['admin', 'investigator']:
            return jsonify({'error': 'Insufficient permissions'}), 403

        investigators = (
            User.query
            .filter_by(role='investigator', is_active=True)
            .order_by(User.username.asc())
            .all()
        )

        payload = [
            {
                'id': investigator.id,
                'username': investigator.username,
                'station_name': investigator.station_name,
            }
            for investigator in investigators
        ]

        return jsonify({
            'count': len(payload),
            'investigators': payload,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/court-users', methods=['GET'])
@jwt_required()
def list_court_users():
    """List active court users for access-grant assignment."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'error': 'Only admin can view court users'}), 403

        court_users = (
            User.query
            .filter_by(role='court_user', is_active=True)
            .order_by(User.username.asc())
            .all()
        )
        payload = [
            {
                'id': entry.id,
                'username': entry.username,
                'designation': entry.designation,
                'court_details': entry.court_details,
            }
            for entry in court_users
        ]
        return jsonify({'count': len(payload), 'court_users': payload}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/court-access-requests', methods=['GET'])
@jwt_required()
def list_court_access_requests():
    """List court access requests for admin review or court-user self tracking."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role')
        if role not in ['admin', 'court_user']:
            return jsonify({'error': 'Insufficient permissions'}), 403

        status_filter = str(request.args.get('status', '')).strip().lower()
        if status_filter and status_filter != 'all' and status_filter not in COURT_ACCESS_STATUSES:
            return jsonify({'error': 'status must be one of: pending, approved, denied, all'}), 400

        limit_value = request.args.get('limit', default=100, type=int)
        limit_value = max(1, min(int(limit_value or 100), 250))

        case_file_id = str(request.args.get('case_file_id', '') or '').strip()

        query = CaseAccessRequest.query
        if role == 'court_user':
            query = query.filter(CaseAccessRequest.requested_by == user_id)
        if case_file_id:
            query = query.filter(CaseAccessRequest.case_file_id == case_file_id)
        if status_filter and status_filter != 'all':
            query = query.filter(CaseAccessRequest.status == status_filter)
        elif role == 'admin' and not status_filter:
            query = query.filter(CaseAccessRequest.status == 'pending')

        rows = query.order_by(CaseAccessRequest.created_at.desc()).limit(limit_value).all()
        return jsonify({'count': len(rows), 'requests': [row.to_dict() for row in rows]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/court-access-requests', methods=['POST'])
@jwt_required()
def create_court_access_request():
    """Allow court users to request time-bound case access by case number or ledger number."""
    requestor_id = None
    try:
        requestor_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'court_user':
            return jsonify({'error': 'Only court users can request case access'}), 403

        payload = request.get_json(silent=True) or {}
        requestor = User.query.get(requestor_id)
        if not requestor:
            return jsonify({'error': 'User not found'}), 404
        pqid_value = str(payload.get('pqid', '')).strip()
        pqid_ok, pqid_error = verify_pqid(
            requestor,
            pqid_value,
            required_message="PQID is required to request court access",
        )
        if not pqid_ok:
            return pqid_error

        case_number = _normalize_case_number(payload.get('case_number'))
        try:
            quantum_ledger_number = _normalize_optional_quantum_ledger_number(payload.get('quantum_ledger_number'))
        except ValueError as ledger_error:
            return jsonify({'error': str(ledger_error)}), 400
        if not case_number and not quantum_ledger_number:
            return jsonify({'error': 'Provide case_number or quantum_ledger_number'}), 400

        try:
            requested_duration_minutes = _parse_duration_minutes(
                payload.get('requested_duration_minutes'),
                field_name='requested_duration_minutes',
            )
        except ValueError as duration_error:
            return jsonify({'error': str(duration_error)}), 400

        reason = _normalize_optional_text(payload.get('reason'), max_length=1000)

        try:
            case_file = _find_case_by_reference(case_number=case_number, quantum_ledger_number=quantum_ledger_number)
        except ValueError as reference_error:
            return jsonify({'error': str(reference_error)}), 400

        if not case_file:
            return jsonify({'error': 'Case file not found for provided reference'}), 404

        now_utc = _utcnow()
        existing_pending = (
            CaseAccessRequest.query
            .filter(
                CaseAccessRequest.requested_by == requestor_id,
                CaseAccessRequest.case_file_id == case_file.id,
                CaseAccessRequest.status == 'pending',
            )
            .order_by(CaseAccessRequest.created_at.desc())
            .first()
        )
        if existing_pending:
            existing_pending.requested_duration_minutes = requested_duration_minutes
            existing_pending.reason = reason
            existing_pending.requested_case_number = case_file.case_number
            existing_pending.requested_quantum_ledger_number = case_file.quantum_ledger_number
            existing_pending.created_at = now_utc
            db.session.commit()

            log_event(
                requestor_id,
                'court_access_request_update',
                'case_access_request',
                existing_pending.id,
                details={
                    'case_file_id': case_file.id,
                    'requested_duration_minutes': requested_duration_minutes,
                },
            )
            return jsonify({
                'message': 'Court access request updated',
                'request': existing_pending.to_dict(),
                'updated': True,
            }), 200

        access_request = CaseAccessRequest(
            requested_by=requestor_id,
            case_file_id=case_file.id,
            requested_case_number=case_file.case_number,
            requested_quantum_ledger_number=case_file.quantum_ledger_number,
            requested_duration_minutes=requested_duration_minutes,
            reason=reason,
            status='pending',
        )
        db.session.add(access_request)
        db.session.commit()

        log_event(
            requestor_id,
            'court_access_request_create',
            'case_access_request',
            access_request.id,
            details={
                'case_file_id': case_file.id,
                'requested_duration_minutes': requested_duration_minutes,
            },
        )
        return jsonify({
            'message': 'Court access request submitted to admin',
            'request': access_request.to_dict(),
        }), 201
    except Exception as e:
        db.session.rollback()
        if requestor_id:
            log_event(requestor_id, 'court_access_request_create', 'case_access_request', 'unknown', status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/court-access-requests/<int:request_id>/approve', methods=['POST'])
@jwt_required()
def approve_court_access_request(request_id):
    """Approve a pending request and issue a time-limited court access grant."""
    admin_user_id = None
    try:
        admin_user_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'error': 'Only admin can approve court access requests'}), 403

        access_request = CaseAccessRequest.query.get(request_id)
        if not access_request:
            return jsonify({'error': 'Court access request not found'}), 404
        if access_request.status != 'pending':
            return jsonify({'error': f'Request already {access_request.status}'}), 409
        if not access_request.case_file_id:
            return jsonify({'error': 'Case reference is missing on this request'}), 409

        case_file = CaseFile.query.filter_by(id=access_request.case_file_id).first()
        if not case_file:
            return jsonify({'error': 'Case file no longer exists'}), 404

        court_user = User.query.filter_by(id=access_request.requested_by, role='court_user', is_active=True).first()
        if not court_user:
            return jsonify({'error': 'Requesting court user is not active'}), 409

        payload = request.get_json(silent=True) or {}
        raw_duration = payload.get('grant_duration_minutes', access_request.requested_duration_minutes)
        try:
            grant_duration_minutes = _parse_duration_minutes(
                raw_duration,
                field_name='grant_duration_minutes',
            )
        except ValueError as duration_error:
            return jsonify({'error': str(duration_error)}), 400

        notes = _normalize_optional_text(payload.get('notes'), max_length=1000)
        now_utc = _utcnow()
        expires_at = now_utc + timedelta(minutes=grant_duration_minutes)

        active_grants = (
            CaseAccessGrant.query
            .filter(
                CaseAccessGrant.case_file_id == case_file.id,
                CaseAccessGrant.court_user_id == court_user.id,
                CaseAccessGrant.revoked_at.is_(None),
                CaseAccessGrant.expires_at > now_utc,
            )
            .all()
        )
        for grant in active_grants:
            grant.revoked_at = now_utc
            grant.revoked_by = admin_user_id
            grant.revoke_reason = 'Replaced by approved access request'

        grant = CaseAccessGrant(
            case_file_id=case_file.id,
            court_user_id=court_user.id,
            granted_by=admin_user_id,
            granted_at=now_utc,
            expires_at=expires_at,
            source_request_id=access_request.id,
            notes=notes,
        )
        db.session.add(grant)

        access_request.status = 'approved'
        access_request.decided_at = now_utc
        access_request.decided_by = admin_user_id
        access_request.decision_notes = notes
        access_request.granted_expires_at = expires_at
        db.session.commit()

        log_event(
            admin_user_id,
            'court_access_request_approve',
            'case_access_request',
            access_request.id,
            details={
                'grant_id': grant.id,
                'case_file_id': case_file.id,
                'court_user_id': court_user.id,
                'grant_duration_minutes': grant_duration_minutes,
            },
        )
        return jsonify({
            'message': 'Court access request approved',
            'request': access_request.to_dict(),
            'grant': grant.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        if admin_user_id:
            log_event(admin_user_id, 'court_access_request_approve', 'case_access_request', request_id, status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/court-access-requests/<int:request_id>/deny', methods=['POST'])
@jwt_required()
def deny_court_access_request(request_id):
    """Deny a pending court access request."""
    admin_user_id = None
    try:
        admin_user_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'error': 'Only admin can deny court access requests'}), 403

        access_request = CaseAccessRequest.query.get(request_id)
        if not access_request:
            return jsonify({'error': 'Court access request not found'}), 404
        if access_request.status != 'pending':
            return jsonify({'error': f'Request already {access_request.status}'}), 409

        payload = request.get_json(silent=True) or {}
        notes = _normalize_optional_text(payload.get('notes'), max_length=1000)
        now_utc = _utcnow()

        access_request.status = 'denied'
        access_request.decided_at = now_utc
        access_request.decided_by = admin_user_id
        access_request.decision_notes = notes
        db.session.commit()

        log_event(
            admin_user_id,
            'court_access_request_deny',
            'case_access_request',
            access_request.id,
            details={'notes': notes},
        )
        return jsonify({
            'message': 'Court access request denied',
            'request': access_request.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        if admin_user_id:
            log_event(admin_user_id, 'court_access_request_deny', 'case_access_request', request_id, status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases/<case_file_id>/court-access-grants', methods=['GET'])
@jwt_required()
def list_case_court_access_grants(case_file_id):
    """List active or all court access grants for a specific case (admin only)."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'error': 'Only admin can view court access grants'}), 403

        case_file = CaseFile.query.filter_by(id=str(case_file_id)).first()
        if not case_file:
            return jsonify({'error': 'Case file not found'}), 404

        include_history = str(request.args.get('include_history', '')).strip().lower() == 'true'
        now_utc = _utcnow()
        query = CaseAccessGrant.query.filter(CaseAccessGrant.case_file_id == case_file.id)
        if not include_history:
            query = query.filter(
                CaseAccessGrant.revoked_at.is_(None),
                CaseAccessGrant.expires_at > now_utc,
            )

        grants = query.order_by(CaseAccessGrant.expires_at.desc(), CaseAccessGrant.id.desc()).all()
        return jsonify({'count': len(grants), 'grants': [entry.to_dict() for entry in grants]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases/<case_file_id>/court-access-grants', methods=['POST'])
@jwt_required()
def create_case_court_access_grant(case_file_id):
    """Create a direct admin grant for court access with explicit expiry window."""
    admin_user_id = None
    try:
        admin_user_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'error': 'Only admin can grant case access to court users'}), 403

        case_file = CaseFile.query.filter_by(id=str(case_file_id)).first()
        if not case_file:
            return jsonify({'error': 'Case file not found'}), 404

        payload = request.get_json(silent=True) or {}
        admin_user = User.query.get(admin_user_id)
        if not admin_user:
            return jsonify({'error': 'User not found'}), 404
        pqid_value = str(payload.get('pqid', '')).strip()
        pqid_ok, pqid_error = verify_pqid(
            admin_user,
            pqid_value,
            required_message="PQID is required to grant court access",
        )
        if not pqid_ok:
            return pqid_error
        try:
            court_user_id = int(str(payload.get('court_user_id')).strip())
        except (TypeError, ValueError, AttributeError):
            return jsonify({'error': 'court_user_id must be a valid user id'}), 400

        try:
            duration_minutes = _parse_duration_minutes(payload.get('duration_minutes'))
        except ValueError as duration_error:
            return jsonify({'error': str(duration_error)}), 400

        notes = _normalize_optional_text(payload.get('notes'), max_length=1000)

        court_user = User.query.filter_by(id=court_user_id, role='court_user', is_active=True).first()
        if not court_user:
            return jsonify({'error': 'Selected court user is not active'}), 404

        now_utc = _utcnow()
        expires_at = now_utc + timedelta(minutes=duration_minutes)
        active_grants = (
            CaseAccessGrant.query
            .filter(
                CaseAccessGrant.case_file_id == case_file.id,
                CaseAccessGrant.court_user_id == court_user_id,
                CaseAccessGrant.revoked_at.is_(None),
                CaseAccessGrant.expires_at > now_utc,
            )
            .all()
        )
        for grant in active_grants:
            grant.revoked_at = now_utc
            grant.revoked_by = admin_user_id
            grant.revoke_reason = 'Replaced by direct admin grant'

        grant = CaseAccessGrant(
            case_file_id=case_file.id,
            court_user_id=court_user_id,
            granted_by=admin_user_id,
            granted_at=now_utc,
            expires_at=expires_at,
            notes=notes,
        )
        db.session.add(grant)
        db.session.commit()

        log_event(
            admin_user_id,
            'court_access_grant_create',
            'case_access_grant',
            grant.id,
            details={
                'case_file_id': case_file.id,
                'court_user_id': court_user_id,
                'duration_minutes': duration_minutes,
            },
        )
        return jsonify({
            'message': 'Court case access granted successfully',
            'grant': grant.to_dict(),
        }), 201
    except Exception as e:
        db.session.rollback()
        if admin_user_id:
            log_event(admin_user_id, 'court_access_grant_create', 'case_access_grant', str(case_file_id), status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases/preview-ledger', methods=['POST'])
@jwt_required()
def preview_case_ledger_number():
    """Generate a preview Quantum Ledger Number without creating a case file."""
    user_id = None
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role')
        if role not in ['admin', 'investigator']:
            return jsonify({'error': 'Insufficient permissions'}), 403

        payload = request.get_json(silent=True) or {}
        case_number = _normalize_case_number(payload.get('case_number'))
        case_title = str(payload.get('case_title', '')).strip()
        incident_state = str(payload.get('incident_state', '')).strip()
        incident_district = str(payload.get('incident_district', '')).strip()
        incident_location = str(payload.get('incident_location', '')).strip()

        if not case_number or not case_title:
            return jsonify({'error': 'case_number and case_title are required'}), 400
        if not incident_state or not incident_district or not incident_location:
            return jsonify({'error': 'incident_state, incident_district, and incident_location are required'}), 400

        assigned_investigator_id = None
        status = str(payload.get('status', '')).strip().lower()
        allowed_statuses = {'open', 'investigation', 'closed'}

        if role == 'investigator':
            status = 'open'
        else:
            if not status:
                return jsonify({'error': 'status is required'}), 400
            if status not in allowed_statuses:
                return jsonify({'error': 'status must be one of: open, investigation, closed'}), 400

            try:
                assigned_investigator_id = _normalize_optional_investigator_id(payload.get('assigned_investigator_id'))
            except ValueError as investigator_error:
                return jsonify({'error': str(investigator_error)}), 400
            if status == 'investigation':
                if not assigned_investigator_id:
                    return jsonify({'error': 'assigned_investigator_id is required when status is investigation'}), 400
                if not _get_active_investigator(assigned_investigator_id):
                    return jsonify({
                        'error': (
                            'Selected investigator is not available in users list. '
                            'Add the investigator to the system by creating the user first.'
                        )
                    }), 400
            else:
                assigned_investigator_id = None

        try:
            state_code = _normalize_two_letter_code(payload.get('state_code'), 'state_code')
            district_code = _normalize_two_letter_code(payload.get('district_code'), 'district_code')
        except ValueError as code_error:
            return jsonify({'error': str(code_error)}), 400

        existing = CaseFile.query.filter_by(case_number=case_number).first()
        if existing:
            return jsonify({'error': 'Case number already exists'}), 409

        quantum_ledger_number = _build_quantum_ledger_number(state_code, district_code)
        return jsonify({
            'message': 'Quantum ledger number preview generated',
            'quantum_ledger_number': quantum_ledger_number,
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases', methods=['POST'])
@jwt_required()
def create_case_file():
    """Create a structured case file."""
    user_id = None
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role')
        if role not in ['admin', 'investigator']:
            return jsonify({'error': 'Insufficient permissions'}), 403

        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        payload = request.get_json(silent=True) or {}
        pqid_value = str(payload.get('pqid', '')).strip()
        pqid_ok, pqid_error = verify_pqid(
            user,
            pqid_value,
            required_message="PQID is required to create case files",
        )
        if not pqid_ok:
            return pqid_error
        case_number = _normalize_case_number(payload.get('case_number'))
        case_title = str(payload.get('case_title', '')).strip()
        incident_state = str(payload.get('incident_state', '')).strip()
        incident_district = str(payload.get('incident_district', '')).strip()
        incident_location = str(payload.get('incident_location', '')).strip()

        if not case_number or not case_title:
            return jsonify({'error': 'case_number and case_title are required'}), 400
        if not incident_state or not incident_district or not incident_location:
            return jsonify({'error': 'incident_state, incident_district, and incident_location are required'}), 400

        existing = CaseFile.query.filter_by(case_number=case_number).first()
        if existing:
            return jsonify({'error': 'Case number already exists'}), 409

        try:
            incident_date = _parse_incident_date(payload.get('incident_date'))
        except ValueError:
            return jsonify({'error': 'incident_date must be in YYYY-MM-DD format'}), 400

        status = str(payload.get('status', '')).strip().lower()
        allowed_statuses = {'open', 'investigation', 'closed'}
        assigned_investigator_id = None

        if role == 'investigator':
            status = 'open'
        else:
            if not status:
                return jsonify({'error': 'status is required'}), 400
            if status not in allowed_statuses:
                return jsonify({'error': 'status must be one of: open, investigation, closed'}), 400

            try:
                assigned_investigator_id = _normalize_optional_investigator_id(payload.get('assigned_investigator_id'))
            except ValueError as investigator_error:
                return jsonify({'error': str(investigator_error)}), 400
            if status == 'investigation':
                if not assigned_investigator_id:
                    return jsonify({'error': 'assigned_investigator_id is required when status is investigation'}), 400
                if not _get_active_investigator(assigned_investigator_id):
                    return jsonify({
                        'error': (
                            'Selected investigator is not available in users list. '
                            'Add the investigator to the system by creating the user first.'
                        )
                    }), 400
            else:
                assigned_investigator_id = None

        try:
            state_code = _normalize_two_letter_code(payload.get('state_code'), 'state_code')
            district_code = _normalize_two_letter_code(payload.get('district_code'), 'district_code')
        except ValueError as code_error:
            return jsonify({'error': str(code_error)}), 400

        try:
            requested_quantum_ledger_number = _normalize_optional_quantum_ledger_number(payload.get('quantum_ledger_number'))
        except ValueError as ledger_error:
            return jsonify({'error': str(ledger_error)}), 400

        if requested_quantum_ledger_number:
            current_year = f'{datetime.utcnow().year % 100:02d}'
            expected_prefix = f'QL{current_year}{state_code}{district_code}'
            if not requested_quantum_ledger_number.startswith(expected_prefix):
                return jsonify({
                    'error': 'quantum_ledger_number does not match selected year/state/district',
                }), 400

        create_attempts = 0
        approval_status = 'approved' if role == 'admin' else 'pending'
        approved_by = user_id if role == 'admin' else None
        approved_at = _utcnow() if role == 'admin' else None

        while True:
            create_attempts += 1
            if requested_quantum_ledger_number and create_attempts == 1:
                quantum_ledger_number = requested_quantum_ledger_number
            else:
                quantum_ledger_number = _build_quantum_ledger_number(state_code, district_code)
            case_file = CaseFile(
                case_number=case_number,
                quantum_ledger_number=quantum_ledger_number,
                case_title=case_title,
                complainant_name=str(payload.get('complainant_name', '')).strip() or None,
                suspect_name=str(payload.get('suspect_name', '')).strip() or None,
                incident_date=incident_date,
                incident_state=incident_state,
                incident_district=incident_district,
                incident_location=incident_location,
                case_summary=str(payload.get('case_summary', '')).strip() or None,
                status=status,
                assigned_investigator_id=assigned_investigator_id,
                approval_status=approval_status,
                approved_by=approved_by,
                approved_at=approved_at,
                created_by=user_id,
            )
            db.session.add(case_file)
            try:
                db.session.commit()
                break
            except IntegrityError as integrity_error:
                db.session.rollback()
                error_text = str(getattr(integrity_error, "orig", integrity_error)).lower()
                if 'case_number' in error_text:
                    return jsonify({'error': 'Case number already exists'}), 409
                if 'quantum_ledger_number' not in error_text:
                    raise
                if requested_quantum_ledger_number:
                    return jsonify({
                        'error': 'Quantum Ledger Number changed. Click Submit again to generate a fresh number.',
                    }), 409
                if create_attempts >= 5:
                    raise
                # Retry if sequence collided due to concurrent case creation.
                continue

        log_event(
            user_id,
            'case_file_create',
            'case_file',
            case_file.id,
            details={
                'case_number': case_file.case_number,
                'quantum_ledger_number': case_file.quantum_ledger_number,
                'assigned_investigator_id': case_file.assigned_investigator_id,
                'approval_status': case_file.approval_status,
            },
        )

        message = (
            'Case file submitted for admin approval'
            if role == 'investigator'
            else 'Case file created successfully'
        )
        return jsonify({
            'message': message,
            'case': case_file.to_dict(),
        }), 201
    except Exception as e:
        db.session.rollback()
        if user_id:
            log_event(user_id, 'case_file_create', 'case_file', 'unknown', status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases', methods=['GET'])
@jwt_required()
def list_case_files():
    """List created case files based on role permissions."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role')
        court_grant_map = {}

        if role == 'admin':
            cases = CaseFile.query.order_by(CaseFile.created_at.desc()).all()
        elif role == 'investigator':
            cases = (
                CaseFile.query
                .filter(
                    CaseFile.assigned_investigator_id == user_id,
                    func.lower(func.trim(func.coalesce(CaseFile.approval_status, 'approved'))) == 'approved',
                )
                .order_by(CaseFile.created_at.desc())
                .all()
            )
        elif role == 'court_user':
            court_grant_map = _active_court_grant_map(user_id)
            visible_case_ids = list(court_grant_map.keys())
            if not visible_case_ids:
                cases = []
            else:
                cases = (
                    CaseFile.query
                    .filter(CaseFile.id.in_(visible_case_ids))
                    .order_by(CaseFile.created_at.desc())
                    .all()
                )
        else:
            return jsonify({'error': 'Invalid role'}), 403

        case_ids = [case.id for case in cases if case.id]
        case_book_counts = {}
        if case_ids:
            rows = (
                db.session.query(CaseBookPage.case_file_id, func.count(CaseBookPage.id))
                .filter(CaseBookPage.case_file_id.in_(case_ids))
                .group_by(CaseBookPage.case_file_id)
                .all()
            )
            case_book_counts = {case_file_id: int(count) for case_file_id, count in rows}

        return jsonify({
            'count': len(cases),
            'cases': [
                {
                    **case.to_dict(),
                    'case_book_page_count': case_book_counts.get(case.id, 0),
                    'court_access_grant_id': (
                        court_grant_map.get(case.id).id
                        if role == 'court_user' and case.id in court_grant_map
                        else None
                    ),
                    'court_access_expires_at': (
                        court_grant_map.get(case.id).expires_at.isoformat()
                        if role == 'court_user' and case.id in court_grant_map and court_grant_map.get(case.id).expires_at
                        else None
                    ),
                }
                for case in cases
            ],
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases/<case_file_id>/assign-investigator', methods=['PATCH'])
@jwt_required()
def assign_case_investigator(case_file_id):
    """Assign or reassign an investigator and move case to investigation."""
    user_id = None
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'error': 'Only admin can assign investigators to cases'}), 403

        payload = request.get_json(silent=True) or {}
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        pqid_value = str(payload.get('pqid', '')).strip()
        pqid_ok, pqid_error = verify_pqid(
            user,
            pqid_value,
            required_message="PQID is required to reassign investigators",
        )
        if not pqid_ok:
            return pqid_error
        try:
            assigned_investigator_id = _normalize_optional_investigator_id(payload.get('assigned_investigator_id'))
        except ValueError as investigator_error:
            return jsonify({'error': str(investigator_error)}), 400

        if not assigned_investigator_id:
            return jsonify({'error': 'assigned_investigator_id is required'}), 400

        investigator = _get_active_investigator(assigned_investigator_id)
        if not investigator:
            return jsonify({
                'error': (
                    'Selected investigator is not available in users list. '
                    'Add the investigator to the system by creating the user first.'
                )
            }), 400

        case_file = CaseFile.query.filter_by(id=str(case_file_id)).first()
        if not case_file:
            return jsonify({'error': 'Case file not found'}), 404

        normalized_status = str(case_file.status or '').strip().lower()
        if normalized_status not in {'open', 'investigation'}:
            return jsonify({
                'error': 'Investigator can only be assigned or reassigned while case status is Open or Under Investigation'
            }), 409

        previous_investigator_id = case_file.assigned_investigator_id

        case_file.assigned_investigator_id = assigned_investigator_id
        case_file.status = 'investigation'
        db.session.commit()

        log_event(
            user_id,
            'case_file_assign_investigator',
            'case_file',
            case_file.id,
            details={
                'case_number': case_file.case_number,
                'previous_assigned_investigator_id': previous_investigator_id,
                'assigned_investigator_id': assigned_investigator_id,
                'status': case_file.status,
            },
        )
        was_reassignment = normalized_status == 'investigation' and previous_investigator_id is not None
        success_message = (
            'Investigator reassigned successfully'
            if was_reassignment else
            'Investigator assigned and case moved to Under Investigation'
        )
        return jsonify({
            'message': success_message,
            'case': case_file.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        if user_id:
            log_event(user_id, 'case_file_assign_investigator', 'case_file', str(case_file_id), status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases/<case_file_id>/close', methods=['PATCH'])
@jwt_required()
def close_case_file(case_file_id):
    """Mark a case file as closed."""
    user_id = None
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'error': 'Only admin can close cases'}), 403

        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        payload = request.get_json(silent=True) or {}
        pqid_value = str(payload.get('pqid', '')).strip()
        pqid_ok, pqid_error = verify_pqid(
            user,
            pqid_value,
            required_message="PQID is required to close cases",
        )
        if not pqid_ok:
            return pqid_error

        case_file = CaseFile.query.filter_by(id=str(case_file_id)).first()
        if not case_file:
            return jsonify({'error': 'Case file not found'}), 404

        if str(case_file.status or '').strip().lower() == 'closed':
            return jsonify({'message': 'Case is already closed', 'case': case_file.to_dict()}), 200

        case_file.status = 'closed'
        db.session.commit()

        log_event(
            user_id,
            'case_file_close',
            'case_file',
            case_file.id,
            details={
                'case_number': case_file.case_number,
                'status': case_file.status,
            },
        )
        return jsonify({
            'message': 'Case marked as closed',
            'case': case_file.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        if user_id:
            log_event(user_id, 'case_file_close', 'case_file', str(case_file_id), status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases/<case_file_id>/reopen', methods=['PATCH'])
@jwt_required()
def reopen_case_file(case_file_id):
    """Reopen a closed case file by moving it back to open status."""
    user_id = None
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'error': 'Only admin can reopen cases'}), 403

        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        payload = request.get_json(silent=True) or {}
        pqid_value = str(payload.get('pqid', '')).strip()
        pqid_ok, pqid_error = verify_pqid(
            user,
            pqid_value,
            required_message="PQID is required to reopen cases",
        )
        if not pqid_ok:
            return pqid_error

        case_file = CaseFile.query.filter_by(id=str(case_file_id)).first()
        if not case_file:
            return jsonify({'error': 'Case file not found'}), 404

        if str(case_file.status or '').strip().lower() != 'closed':
            return jsonify({'message': 'Case is not closed', 'case': case_file.to_dict()}), 200

        case_file.status = 'open'
        db.session.commit()

        log_event(
            user_id,
            'case_file_reopen',
            'case_file',
            case_file.id,
            details={
                'case_number': case_file.case_number,
                'status': case_file.status,
            },
        )
        return jsonify({
            'message': 'Case reopened successfully',
            'case': case_file.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        if user_id:
            log_event(user_id, 'case_file_reopen', 'case_file', str(case_file_id), status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases/<case_file_id>/case-book/pages', methods=['POST'])
@jwt_required()
@limiter.limit(lambda: current_app.config.get("RATELIMIT_CASE_BOOK_UPLOAD", "60 per hour"))
def upload_case_book_page(case_file_id):
    """Append a case-book page (PDF/image only) to a case."""
    user_id = None
    stored_path = None
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role')
        if role not in ['admin', 'investigator']:
            return jsonify({'error': 'Only admin or investigator can upload case-book pages'}), 403

        case_file = CaseFile.query.filter_by(id=str(case_file_id)).first()
        if not case_file:
            return jsonify({'error': 'Case file not found'}), 404
        if role == 'investigator' and not _is_case_assigned_and_approved(case_file, user_id):
            return jsonify({'error': 'You can upload case-book pages only for assigned, approved cases'}), 403
        if str(case_file.status or '').strip().lower() == 'closed':
            return jsonify({'error': 'Cannot upload case-book pages to a closed case'}), 409

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'error': 'Invalid file'}), 400

        file_content = file.read()
        if not file_content:
            return jsonify({'error': 'Uploaded file is empty'}), 400

        filename, mime_type = _validate_case_book_file(file, file_content)
        file_hash = hashlib.sha256(file_content).hexdigest()
        file_size = len(file_content)
        extension = filename.rsplit('.', 1)[1].lower()

        # Keep page order append-only. Retry when concurrent uploads race on page number.
        attempts = 0
        case_book_page = None
        while attempts < 5:
            attempts += 1
            next_page_number = (
                db.session.query(func.max(CaseBookPage.page_number))
                .filter_by(case_file_id=case_file.id)
                .scalar()
                or 0
            ) + 1

            case_folder = os.path.join(
                current_app.config.get("CASE_BOOK_UPLOAD_FOLDER", "storage/case_books"),
                str(case_file.id),
            )
            os.makedirs(case_folder, exist_ok=True)
            stored_filename = f"page-{int(next_page_number):04d}-{uuid.uuid4().hex}.{extension}"
            stored_path = os.path.join(case_folder, stored_filename)
            with open(stored_path, 'wb') as destination:
                destination.write(file_content)

            case_book_page = CaseBookPage(
                case_file_id=case_file.id,
                page_number=int(next_page_number),
                filename=filename,
                summary=None,
                mime_type=mime_type,
                file_hash=file_hash,
                file_size=file_size,
                stored_path=stored_path,
                uploaded_by=user_id,
            )
            db.session.add(case_book_page)
            try:
                db.session.commit()
                break
            except IntegrityError as integrity_error:
                db.session.rollback()
                if stored_path and os.path.exists(stored_path):
                    os.remove(stored_path)
                error_text = str(getattr(integrity_error, 'orig', integrity_error)).lower()
                if 'case_book_pages.case_file_id' in error_text and 'case_book_pages.page_number' in error_text:
                    continue
                raise

        if not case_book_page or not case_book_page.id:
            return jsonify({'error': 'Unable to append case-book page due to concurrent updates'}), 409

        total_pages = (
            db.session.query(func.count(CaseBookPage.id))
            .filter_by(case_file_id=case_file.id)
            .scalar()
            or 0
        )

        log_event(
            user_id,
            'case_book_page_upload',
            'case_book_page',
            case_book_page.id,
            details={
                'case_file_id': case_file.id,
                'case_number': case_file.case_number,
                'page_number': case_book_page.page_number,
                'mime_type': case_book_page.mime_type,
            },
        )
        return jsonify({
            'message': 'Case-book page uploaded successfully',
            'page': case_book_page.to_dict(),
            'total_pages': int(total_pages),
        }), 201
    except ValueError as validation_error:
        db.session.rollback()
        if stored_path and os.path.exists(stored_path):
            os.remove(stored_path)
        return jsonify({'error': str(validation_error)}), 400
    except Exception as e:
        db.session.rollback()
        if stored_path and os.path.exists(stored_path):
            os.remove(stored_path)
        if user_id:
            log_event(user_id, 'case_book_page_upload', 'case_book_page', str(case_file_id), status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/cases/<case_file_id>/case-book', methods=['GET'])
@jwt_required()
def get_case_book(case_file_id):
    """Get case-book cover details and ordered pages for the requested case."""
    user_id = None
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role')
        if role not in ['admin', 'investigator', 'court_user']:
            return jsonify({'error': 'Invalid role'}), 403

        case_file = CaseFile.query.filter_by(id=str(case_file_id)).first()
        if not case_file:
            return jsonify({'error': 'Case file not found'}), 404
        if not _can_view_case_file(case_file, role, user_id):
            return jsonify({'error': 'Unauthorized'}), 403

        pages = (
            CaseBookPage.query
            .filter_by(case_file_id=case_file.id)
            .order_by(CaseBookPage.page_number.asc(), CaseBookPage.created_at.asc())
            .all()
        )

        cover = {
            'case_id': case_file.id,
            'case_number': case_file.case_number,
            'quantum_ledger_number': case_file.quantum_ledger_number,
            'case_title': case_file.case_title,
            'status': case_file.status,
            'incident_location': case_file.incident_location,
            'incident_state': case_file.incident_state,
            'incident_district': case_file.incident_district,
            'assigned_investigator_username': case_file.assigned_investigator_user.username if case_file.assigned_investigator_user else None,
            'created_at': case_file.created_at.isoformat() if case_file.created_at else None,
            'updated_at': case_file.updated_at.isoformat() if case_file.updated_at else None,
            'page_count': len(pages),
        }

        return jsonify({
            'case': case_file.to_dict(),
            'cover': cover,
            'page_count': len(pages),
            'pages': [page.to_dict() for page in pages],
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/case-book/pages/<page_id>/content', methods=['GET'])
@jwt_required()
@limiter.limit(lambda: current_app.config.get("RATELIMIT_EVIDENCE_GET", "300 per hour"))
def get_case_book_page_content(page_id):
    """Stream case-book page content for in-app viewer rendering."""
    user_id = None
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims.get('role')
        if role not in ['admin', 'investigator', 'court_user']:
            return jsonify({'error': 'Invalid role'}), 403

        page = CaseBookPage.query.filter_by(id=str(page_id)).first()
        if not page:
            return jsonify({'error': 'Case-book page not found'}), 404

        case_file = CaseFile.query.filter_by(id=page.case_file_id).first()
        if not case_file:
            return jsonify({'error': 'Case file not found'}), 404
        if not _can_view_case_file(case_file, role, user_id):
            return jsonify({'error': 'Unauthorized'}), 403

        resolved_path = _resolve_storage_path(page.stored_path)
        if resolved_path != page.stored_path and os.path.exists(resolved_path):
            page.stored_path = resolved_path
            db.session.commit()

        if not os.path.exists(resolved_path):
            return jsonify({'error': 'Case-book page file missing from storage'}), 404

        inline_name = secure_filename(page.filename or f'case-book-page-{page.page_number}')
        response = send_file(
            resolved_path,
            mimetype=page.mime_type,
            as_attachment=False,
            download_name=inline_name,
            conditional=False,
            etag=False,
            max_age=0,
        )
        response.headers['Content-Disposition'] = f'inline; filename="{inline_name}"'
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'

        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/upload', methods=['POST'])
@jwt_required()
@limiter.limit(lambda: current_app.config.get("RATELIMIT_EVIDENCE_UPLOAD", "60 per hour"))
def upload_evidence():
    """Upload evidence with PQC encryption"""
    user_id = None
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        claims = get_jwt()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if claims['role'] not in ['admin', 'investigator']:
            return jsonify({'error': 'Insufficient permissions'}), 403
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        pqid_value = str(request.form.get('pqid', '')).strip()
        pqid_ok, pqid_error = verify_pqid(
            user,
            pqid_value,
            required_message="PQID is required to approve evidence upload",
        )
        if not pqid_ok:
            return pqid_error
        
        file = request.files['file']
        case_id = _normalize_case_number(request.form.get('case_id'))
        description = request.form.get('description', '')
        intake_metadata = {}
        intake_metadata_raw = request.form.get('intake_metadata')
        if intake_metadata_raw:
            try:
                parsed_metadata = json.loads(intake_metadata_raw)
                intake_metadata = _normalize_intake_metadata(parsed_metadata)
            except (TypeError, ValueError):
                raw_text = _normalize_optional_text(intake_metadata_raw, max_length=1000)
                if raw_text:
                    intake_metadata = {'raw_metadata': raw_text}
        if intake_metadata:
            intake_metadata['received_at'] = _utcnow().isoformat()
        
        if not file or not case_id:
            return jsonify({'error': 'Missing required fields'}), 400

        case_file = CaseFile.query.filter_by(case_number=case_id).first()
        if not case_file:
            return jsonify({'error': 'Case file not found. Create the case file first.'}), 404

        if claims.get('role') == 'investigator' and not _is_case_assigned_and_approved(case_file, user_id):
            if not _is_case_approved(case_file):
                return jsonify({'error': 'Case is pending admin approval'}), 403
            return jsonify({'error': 'You can only upload files for assigned case files'}), 403
        if str(case_file.status or '').strip().lower() == 'closed':
            return jsonify({'error': 'Cannot upload evidence to a closed case'}), 409

        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid filename'}), 400
        
        # Read file content
        file_content = file.read()
        file_hash = hashlib.sha256(file_content).hexdigest()

        kem_public_key = user.get_kem_public_key()
        sig_secret_key = user.get_sig_secret_key()
        sig_public_key = user.get_sig_public_key()
        if not kem_public_key or not sig_secret_key:
            return jsonify({'error': 'User PQC keys are missing. Re-register or re-seed users.'}), 400

        # Resolve KEM algorithm by trying known candidates when legacy users lack metadata.
        kem_candidates = [
            user.pqc_kem_algorithm,
            pqc_engine.kex_algorithm,
            "ML-KEM-768",
            "Kyber768",
            "ML-KEM-512",
            "Kyber512",
        ]
        seen_kem = set()
        encap_result = None
        kex_algorithm = None
        last_kem_error = None
        for candidate in kem_candidates:
            if not candidate or candidate in seen_kem:
                continue
            seen_kem.add(candidate)
            try:
                encap_result = pqc_engine.encapsulate(kem_public_key, kex_algorithm=candidate)
                kex_algorithm = candidate
                break
            except Exception as exc:
                last_kem_error = exc
        if not encap_result or not kex_algorithm:
            raise Exception(f"Encapsulation failed: {last_kem_error or 'Unknown error'}")

        if user.pqc_kem_algorithm != kex_algorithm:
            user.pqc_kem_algorithm = kex_algorithm

        # Encapsulate a per-evidence shared secret to the uploader's KEM public key.
        shared_secret = encap_result['shared_secret']

        # Derive AES key from shared secret
        key_result = pqc_engine.derive_aes_key(shared_secret)
        encryption_key = key_result['key']

        # Encrypt file content
        encrypt_result = pqc_engine.encrypt_evidence(file_content, encryption_key)

        ciphertext_hash = hashlib.sha256(
            encrypt_result['ciphertext'].encode('utf-8')
        ).hexdigest()
        signature_payload = build_evidence_signature_payload({
            'file_hash': file_hash,
            'ciphertext_hash': ciphertext_hash,
            'case_id': case_id,
            'filename': secure_filename(file.filename),
            'file_size': len(file_content)
        })
        sig_candidates = [
            user.pqc_sig_algorithm,
            pqc_engine.sig_algorithm,
            "ML-DSA-65",
            "Dilithium3",
            "ML-DSA-44",
            "Dilithium2",
        ]
        seen_sig = set()
        signature = None
        sig_algorithm = None
        last_sig_error = None
        for candidate in sig_candidates:
            if not candidate or candidate in seen_sig:
                continue
            seen_sig.add(candidate)
            try:
                signature = pqc_engine.sign(signature_payload, sig_secret_key, sig_algorithm=candidate)
                sig_algorithm = candidate
                break
            except Exception as exc:
                last_sig_error = exc
        if not signature or not sig_algorithm:
            raise Exception(f"Signature generation failed: {last_sig_error or 'Unknown error'}")

        if user.pqc_sig_algorithm != sig_algorithm:
            user.pqc_sig_algorithm = sig_algorithm
        
        # Save encrypted file
        upload_folder = current_app.config.get("UPLOAD_FOLDER", "storage/evidence")
        os.makedirs(upload_folder, exist_ok=True)
        encrypted_filename = f"{file_hash}.enc"
        encrypted_filepath = os.path.join(upload_folder, encrypted_filename)

        encrypted_payload = {
            'ciphertext': encrypt_result['ciphertext'],
            'iv': encrypt_result['iv'],
            'tag': encrypt_result['tag'],
            'salt': key_result['salt'],
            'kem_ciphertext': encap_result['ciphertext'],
            'kex_algorithm': kex_algorithm,
        }
        with open(encrypted_filepath, 'w') as f:
            json.dump(encrypted_payload, f)
        
        # Create evidence record
        safe_filename = secure_filename(file.filename)
        evidence_ext = safe_filename.rsplit('.', 1)[1].lower() if '.' in safe_filename else 'unknown'
        evidence = Evidence(
            case_id=case_id,
            case_file_id=case_file.id,
            filename=safe_filename,
            file_hash=file_hash,
            file_size=len(file_content),
            encrypted_data_path=encrypted_filepath,
            encryption_key=encap_result['ciphertext'],
            encryption_iv=encrypt_result['iv'],
            encryption_tag=encrypt_result['tag'],
            signature=signature,
            signature_public_key=sig_public_key,
            signature_algorithm=sig_algorithm,
            description=description,
            evidence_type=evidence_ext,
            uploaded_by=user_id,
            access_level='investigator',
            approval_status='approved',
            approved_by=user_id,
            approved_at=_utcnow(),
        )
        
        db.session.add(evidence)
        db.session.commit()

        custody_notes = json.dumps(intake_metadata, sort_keys=True) if intake_metadata else None

        # Log custody record
        custody = CustodyRecord(
            evidence_id=evidence.id,
            user_id=user_id,
            action='upload',
            ip_address=request.remote_addr,
            notes=custody_notes,
            signature=pqc_engine.sign(
                build_evidence_signature_payload({'evidence_id': evidence.id, 'action': 'upload'}),
                sig_secret_key,
                sig_algorithm=sig_algorithm,
            )
        )
        db.session.add(custody)
        db.session.commit()
        
        log_details = {'filename': file.filename, 'file_hash': file_hash}
        if intake_metadata.get('client_sha3_512'):
            log_details['client_sha3_512'] = intake_metadata.get('client_sha3_512')
        if intake_metadata.get('intake_timestamp'):
            log_details['intake_timestamp'] = intake_metadata.get('intake_timestamp')
        log_event(user_id, 'evidence_upload', 'evidence', evidence.id, log_details)
        
        return jsonify({
            'message': 'Evidence uploaded and approved successfully',
            'evidence': evidence.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        if user_id:
            log_event(user_id, 'evidence_upload', 'evidence', 'unknown', status='failure')
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/list', methods=['GET'])
@jwt_required()
def list_evidence():
    """List evidence based on user role and permissions"""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        role = claims['role']
        
        # Role-based filtering
        if role == 'admin':
            evidence_list = Evidence.query.filter_by(is_deleted=False).all()
        elif role == 'investigator':
            evidence_list = (
                Evidence.query
                .join(CaseFile, Evidence.case_file_id == CaseFile.id)
                .filter(
                    Evidence.is_deleted == False,
                    CaseFile.assigned_investigator_id == user_id,
                    func.lower(func.trim(func.coalesce(CaseFile.approval_status, 'approved'))) == 'approved',
                )
                .all()
            )
        elif role == 'court_user':
            active_case_ids = list(_active_court_grant_map(user_id).keys())
            if not active_case_ids:
                evidence_list = []
            else:
                evidence_list = (
                    Evidence.query
                    .filter(
                        Evidence.is_deleted == False,
                        func.lower(func.trim(func.coalesce(Evidence.approval_status, 'approved'))) == 'approved',
                        Evidence.case_file_id.in_(active_case_ids),
                    )
                    .all()
                )
        else:
            return jsonify({'error': 'Invalid role'}), 403
        
        return jsonify({
            'count': len(evidence_list),
            'evidence': [e.to_dict() for e in evidence_list]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/<evidence_id>', methods=['GET'])
@jwt_required()
@limiter.limit(lambda: current_app.config.get("RATELIMIT_EVIDENCE_GET", "300 per hour"))
def get_evidence(evidence_id):
    """Get evidence details and decrypt if authorized"""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        evidence = Evidence.query.get(evidence_id)
        if not evidence:
            return jsonify({'error': 'Evidence not found'}), 404
        
        # Check access permissions: only assigned investigator or active court user can preview
        role = claims.get('role')
        if role == 'investigator':
            case_file = CaseFile.query.filter_by(id=evidence.case_file_id).first() if evidence.case_file_id else None
            if not _is_case_assigned_and_approved(case_file, user_id):
                if case_file and not _is_case_approved(case_file):
                    log_event(
                        user_id,
                        'evidence_view_denied',
                        'evidence',
                        evidence.id,
                        details={'reason': 'case_pending_approval', 'case_file_id': evidence.case_file_id},
                        status='failure',
                    )
                    return jsonify({'error': 'Case is pending admin approval'}), 403
                log_event(
                    user_id,
                    'evidence_view_denied',
                    'evidence',
                    evidence.id,
                    details={'reason': 'unauthorized', 'case_file_id': evidence.case_file_id},
                    status='failure',
                )
                return jsonify({'error': 'Unauthorized'}), 403
        elif role == 'court_user':
            if not _court_can_view_evidence(evidence, user_id):
                reason = (
                    'court_access_inactive'
                    if evidence.case_file_id and _is_evidence_approved(evidence) and not evidence.is_deleted
                    else 'evidence_not_available'
                )
                log_event(
                    user_id,
                    'evidence_view_denied',
                    'evidence',
                    evidence.id,
                    details={
                        'reason': reason,
                        'case_file_id': evidence.case_file_id,
                        'approval_status': evidence.approval_status,
                        'is_deleted': evidence.is_deleted,
                    },
                    status='failure',
                )
                if reason == 'court_access_inactive':
                    return jsonify({'error': 'Court access window not active for this case'}), 403
                return jsonify({'error': 'Unauthorized'}), 403
        elif role == 'admin':
            # Admins can verify evidence integrity across cases.
            pass
        else:
            log_event(
                user_id,
                'evidence_view_denied',
                'evidence',
                evidence.id,
                details={'reason': 'unauthorized_role', 'role': role},
                status='failure',
            )
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Read encrypted evidence payload
        try:
            with open(evidence.encrypted_data_path, 'r') as f:
                encrypted_data = json.load(f)
            uploader = User.query.get(evidence.uploaded_by)
            signature_public_key = evidence.signature_public_key or (uploader.get_sig_public_key() if uploader else None)
            signature_algorithm = (
                evidence.signature_algorithm
                or (uploader.pqc_sig_algorithm if uploader else None)
                or pqc_engine.sig_algorithm
            )
            if not signature_public_key:
                return jsonify({'error': 'Uploader signature key missing'}), 500

            if _looks_encrypted(evidence.case_id) or _looks_encrypted(evidence.filename):
                return jsonify({
                    'error': (
                        'Evidence metadata could not be decrypted. '
                        'Check APP_DATA_ENCRYPTION_KEY/SECRET_KEY consistency.'
                    )
                }), 500

            ciphertext_hash = hashlib.sha256(
                encrypted_data['ciphertext'].encode('utf-8')
            ).hexdigest()
            signature_payload = build_evidence_signature_payload({
                'file_hash': evidence.file_hash,
                'ciphertext_hash': ciphertext_hash,
                'case_id': evidence.case_id,
                'filename': evidence.filename,
                'file_size': evidence.file_size
            })
            sig_candidates = [signature_algorithm]
            if not evidence.signature_algorithm:
                sig_candidates.extend([
                    pqc_engine.sig_algorithm,
                    "ML-DSA-65",
                    "Dilithium3",
                    "ML-DSA-44",
                    "Dilithium2",
                ])
            signature_valid = False
            resolved_sig_algorithm = None
            seen_sig = set()
            for candidate in sig_candidates:
                if not candidate or candidate in seen_sig:
                    continue
                seen_sig.add(candidate)
                if pqc_engine.verify(
                    signature_payload,
                    evidence.signature,
                    signature_public_key,
                    sig_algorithm=candidate,
                ):
                    signature_valid = True
                    resolved_sig_algorithm = candidate
                    break
            if not signature_valid:
                log_event(
                    user_id,
                    'signature_verification_failed',
                    'evidence',
                    evidence.id,
                    details={
                        'reason': 'signature_invalid',
                        'case_id': evidence.case_id,
                        'filename': evidence.filename,
                        'file_hash': evidence.file_hash,
                        'sig_algorithm': signature_algorithm,
                        'sig_candidates': [candidate for candidate in sig_candidates if candidate],
                    },
                    status='failure',
                )
                return jsonify({'error': 'Signature verification failed'}), 409

            if resolved_sig_algorithm and not evidence.signature_algorithm:
                evidence.signature_algorithm = resolved_sig_algorithm
            if signature_public_key and not evidence.signature_public_key:
                evidence.signature_public_key = signature_public_key
            if uploader and resolved_sig_algorithm and not uploader.pqc_sig_algorithm:
                uploader.pqc_sig_algorithm = resolved_sig_algorithm

            decrypt_owner = uploader or user
            kex_algorithm = (
                encrypted_data.get('kex_algorithm')
                or decrypt_owner.pqc_kem_algorithm
                or pqc_engine.kex_algorithm
            )
            sig_algorithm = resolved_sig_algorithm or signature_algorithm

            kem_secret_key = decrypt_owner.get_kem_secret_key()
            if not kem_secret_key:
                log_event(
                    user_id,
                    'decryption_unavailable',
                    'evidence',
                    evidence.id,
                    details={'reason': 'missing_kem_key'},
                    status='failure',
                )
                return jsonify({
                    'evidence': evidence.to_dict(),
                    'encrypted_content': encrypted_data['ciphertext'][:100] + '...',  # Preview
                    'signature_valid': True,
                    'integrity_valid': True,
                    'is_accessible': False,
                    'kex_algorithm': kex_algorithm,
                    'sig_algorithm': sig_algorithm,
                    'hash_algorithm': 'SHA-256',
                    'decryption_status': 'missing_key',
                }), 200

            kem_ciphertext = evidence.encryption_key or encrypted_data.get('kem_ciphertext')
            if not kem_ciphertext:
                log_event(
                    user_id,
                    'decryption_failed',
                    'evidence',
                    evidence.id,
                    details={'reason': 'kem_ciphertext_missing'},
                    status='failure',
                )
                return jsonify({'error': 'KEM ciphertext missing for evidence'}), 500

            shared_secret = pqc_engine.decapsulate(
                kem_secret_key,
                kem_ciphertext,
                kex_algorithm=kex_algorithm,
            )
            key_result = pqc_engine.derive_aes_key(shared_secret, encrypted_data['salt'])

            try:
                decrypted_content = pqc_engine.decrypt_evidence(
                    encrypted_data['ciphertext'],
                    key_result['key'],
                    encrypted_data['iv'],
                    encrypted_data['tag']
                )
            except Exception:
                log_event(
                    user_id,
                    'decryption_failed',
                    'evidence',
                    evidence.id,
                    details={'reason': 'decrypt_failed'},
                    status='failure',
                )
                return jsonify({
                    'evidence': evidence.to_dict(),
                    'encrypted_content': encrypted_data['ciphertext'][:100] + '...',  # Preview
                    'signature_valid': True,
                    'integrity_valid': True,
                    'is_accessible': False,
                    'kex_algorithm': kex_algorithm,
                    'sig_algorithm': sig_algorithm,
                    'hash_algorithm': 'SHA-256',
                    'decryption_status': 'decrypt_failed',
                }), 200

            decrypted_hash = hashlib.sha256(decrypted_content).hexdigest()
            if decrypted_hash != evidence.file_hash:
                log_event(
                    user_id,
                    'integrity_check_failed',
                    'evidence',
                    evidence.id,
                    details={
                        'reason': 'hash_mismatch',
                        'case_id': evidence.case_id,
                        'filename': evidence.filename,
                        'expected_hash': evidence.file_hash,
                        'observed_hash': decrypted_hash,
                    },
                    status='failure',
                )
                return jsonify({
                    'evidence': evidence.to_dict(),
                    'encrypted_content': encrypted_data['ciphertext'][:100] + '...',  # Preview
                    'signature_valid': True,
                    'integrity_valid': True,
                    'is_accessible': False,
                    'kex_algorithm': kex_algorithm,
                    'sig_algorithm': sig_algorithm,
                    'hash_algorithm': 'SHA-256',
                    'decryption_status': 'key_mismatch',
                }), 200

            if role == 'admin':
                # Admin integrity checks should not register as evidence views in custody chain.
                db.session.commit()
                log_event(user_id, 'evidence_integrity_check', 'evidence', evidence.id)
            else:
                # Log custody record only when content is accessible
                sig_secret_key = user.get_sig_secret_key()
                viewer_sig_algorithm = user.pqc_sig_algorithm or pqc_engine.sig_algorithm
                custody = CustodyRecord(
                    evidence_id=evidence.id,
                    user_id=user_id,
                    action='view',
                    ip_address=request.remote_addr,
                    signature=(
                        pqc_engine.sign(
                            build_evidence_signature_payload({'evidence_id': evidence.id, 'action': 'view'}),
                            sig_secret_key,
                            sig_algorithm=viewer_sig_algorithm,
                        )
                        if sig_secret_key
                        else None
                    )
                )
                db.session.add(custody)
                db.session.commit()

                log_event(user_id, 'evidence_view', 'evidence', evidence.id)

            return jsonify({
                'evidence': evidence.to_dict(),
                'encrypted_content': encrypted_data['ciphertext'][:100] + '...',  # Preview
                'signature_valid': True,
                'integrity_valid': True,
                'is_accessible': True,
                'kex_algorithm': kex_algorithm,
                'sig_algorithm': sig_algorithm,
                'hash_algorithm': 'SHA-256',
            }), 200
        
        except Exception as e:
            log_event(
                user_id,
                'decryption_failed',
                'evidence',
                evidence.id,
                details={'reason': 'exception', 'error': str(e)[:200]},
                status='failure',
            )
            return jsonify({'error': f'Decryption failed: {str(e)}'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/<evidence_id>/content', methods=['GET'])
@jwt_required()
@limiter.limit(lambda: current_app.config.get("RATELIMIT_EVIDENCE_GET", "300 per hour"))
def get_evidence_content(evidence_id):
    """Return decrypted evidence content for authorized preview."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        evidence = Evidence.query.get(evidence_id)
        if not evidence:
            return jsonify({'error': 'Evidence not found'}), 404

        role = claims.get('role')
        if role == 'investigator':
            case_file = CaseFile.query.filter_by(id=evidence.case_file_id).first() if evidence.case_file_id else None
            if not _is_case_assigned_and_approved(case_file, user_id):
                if case_file and not _is_case_approved(case_file):
                    log_event(
                        user_id,
                        'evidence_view_denied',
                        'evidence',
                        evidence.id,
                        details={'reason': 'case_pending_approval', 'case_file_id': evidence.case_file_id},
                        status='failure',
                    )
                    return jsonify({'error': 'Case is pending admin approval'}), 403
                log_event(
                    user_id,
                    'evidence_view_denied',
                    'evidence',
                    evidence.id,
                    details={'reason': 'unauthorized', 'case_file_id': evidence.case_file_id},
                    status='failure',
                )
                return jsonify({'error': 'Unauthorized'}), 403
        elif role == 'court_user':
            if not _court_can_view_evidence(evidence, user_id):
                reason = (
                    'court_access_inactive'
                    if evidence.case_file_id and _is_evidence_approved(evidence) and not evidence.is_deleted
                    else 'evidence_not_available'
                )
                log_event(
                    user_id,
                    'evidence_view_denied',
                    'evidence',
                    evidence.id,
                    details={
                        'reason': reason,
                        'case_file_id': evidence.case_file_id,
                        'approval_status': evidence.approval_status,
                        'is_deleted': evidence.is_deleted,
                    },
                    status='failure',
                )
                if reason == 'court_access_inactive':
                    return jsonify({'error': 'Court access window not active for this case'}), 403
                return jsonify({'error': 'Unauthorized'}), 403
        else:
            log_event(
                user_id,
                'evidence_view_denied',
                'evidence',
                evidence.id,
                details={'reason': 'unauthorized_role', 'role': role},
                status='failure',
            )
            return jsonify({'error': 'Unauthorized'}), 403

        try:
            with open(evidence.encrypted_data_path, 'r') as f:
                encrypted_data = json.load(f)
            uploader = User.query.get(evidence.uploaded_by)
            signature_public_key = evidence.signature_public_key or (uploader.get_sig_public_key() if uploader else None)
            signature_algorithm = (
                evidence.signature_algorithm
                or (uploader.pqc_sig_algorithm if uploader else None)
                or pqc_engine.sig_algorithm
            )
            if not signature_public_key:
                return jsonify({'error': 'Uploader signature key missing'}), 500

            if _looks_encrypted(evidence.case_id) or _looks_encrypted(evidence.filename):
                return jsonify({
                    'error': (
                        'Evidence metadata could not be decrypted. '
                        'Check APP_DATA_ENCRYPTION_KEY/SECRET_KEY consistency.'
                    )
                }), 500

            ciphertext_hash = hashlib.sha256(
                encrypted_data['ciphertext'].encode('utf-8')
            ).hexdigest()
            signature_payload = build_evidence_signature_payload({
                'file_hash': evidence.file_hash,
                'ciphertext_hash': ciphertext_hash,
                'case_id': evidence.case_id,
                'filename': evidence.filename,
                'file_size': evidence.file_size
            })
            sig_candidates = [signature_algorithm]
            if not evidence.signature_algorithm:
                sig_candidates.extend([
                    pqc_engine.sig_algorithm,
                    "ML-DSA-65",
                    "Dilithium3",
                    "ML-DSA-44",
                    "Dilithium2",
                ])
            signature_valid = False
            resolved_sig_algorithm = None
            seen_sig = set()
            for candidate in sig_candidates:
                if not candidate or candidate in seen_sig:
                    continue
                seen_sig.add(candidate)
                if pqc_engine.verify(
                    signature_payload,
                    evidence.signature,
                    signature_public_key,
                    sig_algorithm=candidate,
                ):
                    signature_valid = True
                    resolved_sig_algorithm = candidate
                    break
            if not signature_valid:
                log_event(
                    user_id,
                    'signature_verification_failed',
                    'evidence',
                    evidence.id,
                    details={
                        'reason': 'signature_invalid',
                        'case_id': evidence.case_id,
                        'filename': evidence.filename,
                        'file_hash': evidence.file_hash,
                        'sig_algorithm': signature_algorithm,
                        'sig_candidates': [candidate for candidate in sig_candidates if candidate],
                    },
                    status='failure',
                )
                return jsonify({'error': 'Signature verification failed'}), 409

            if resolved_sig_algorithm and not evidence.signature_algorithm:
                evidence.signature_algorithm = resolved_sig_algorithm
            if signature_public_key and not evidence.signature_public_key:
                evidence.signature_public_key = signature_public_key
            if uploader and resolved_sig_algorithm and not uploader.pqc_sig_algorithm:
                uploader.pqc_sig_algorithm = resolved_sig_algorithm

            decrypt_owner = uploader or user
            kex_algorithm = (
                encrypted_data.get('kex_algorithm')
                or decrypt_owner.pqc_kem_algorithm
                or pqc_engine.kex_algorithm
            )
            kem_secret_key = decrypt_owner.get_kem_secret_key()
            if not kem_secret_key:
                log_event(
                    user_id,
                    'decryption_unavailable',
                    'evidence',
                    evidence.id,
                    details={'reason': 'missing_kem_key'},
                    status='failure',
                )
                return jsonify({'error': 'Decryption key missing for this user'}), 403

            kem_ciphertext = evidence.encryption_key or encrypted_data.get('kem_ciphertext')
            if not kem_ciphertext:
                log_event(
                    user_id,
                    'decryption_failed',
                    'evidence',
                    evidence.id,
                    details={'reason': 'kem_ciphertext_missing'},
                    status='failure',
                )
                return jsonify({'error': 'KEM ciphertext missing for evidence'}), 500

            shared_secret = pqc_engine.decapsulate(
                kem_secret_key,
                kem_ciphertext,
                kex_algorithm=kex_algorithm,
            )
            key_result = pqc_engine.derive_aes_key(shared_secret, encrypted_data['salt'])

            try:
                decrypted_content = pqc_engine.decrypt_evidence(
                    encrypted_data['ciphertext'],
                    key_result['key'],
                    encrypted_data['iv'],
                    encrypted_data['tag']
                )
            except Exception:
                log_event(
                    user_id,
                    'decryption_failed',
                    'evidence',
                    evidence.id,
                    details={'reason': 'decrypt_failed'},
                    status='failure',
                )
                return jsonify({'error': 'Decryption failed'}), 500

            decrypted_hash = hashlib.sha256(decrypted_content).hexdigest()
            if decrypted_hash != evidence.file_hash:
                log_event(
                    user_id,
                    'integrity_check_failed',
                    'evidence',
                    evidence.id,
                    details={
                        'reason': 'hash_mismatch',
                        'case_id': evidence.case_id,
                        'filename': evidence.filename,
                        'expected_hash': evidence.file_hash,
                        'observed_hash': decrypted_hash,
                    },
                    status='failure',
                )
                return jsonify({'error': 'File integrity mismatch'}), 409

            sig_secret_key = user.get_sig_secret_key()
            viewer_sig_algorithm = user.pqc_sig_algorithm or pqc_engine.sig_algorithm
            custody = CustodyRecord(
                evidence_id=evidence.id,
                user_id=user_id,
                action='view',
                ip_address=request.remote_addr,
                signature=(
                    pqc_engine.sign(
                        build_evidence_signature_payload({'evidence_id': evidence.id, 'action': 'view'}),
                        sig_secret_key,
                        sig_algorithm=viewer_sig_algorithm,
                    )
                    if sig_secret_key
                    else None
                )
            )
            db.session.add(custody)
            db.session.commit()

            log_event(user_id, 'evidence_view', 'evidence', evidence.id)

            mime = _guess_evidence_mime(evidence.filename)
            return send_file(
                BytesIO(decrypted_content),
                mimetype=mime,
                as_attachment=False,
                download_name=evidence.filename or 'evidence-file'
            )
        except Exception as e:
            log_event(
                user_id,
                'decryption_failed',
                'evidence',
                evidence.id,
                details={'reason': 'exception', 'error': str(e)[:200]},
                status='failure',
            )
            return jsonify({'error': f'Decryption failed: {str(e)}'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/<evidence_id>/custody-chain', methods=['GET'])
@jwt_required()
def get_custody_chain(evidence_id):
    """Get chain of custody for evidence"""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        
        evidence = Evidence.query.get(evidence_id)
        if not evidence:
            return jsonify({'error': 'Evidence not found'}), 404
        
        # Check permissions
        if claims['role'] == 'investigator':
            case_file = CaseFile.query.filter_by(id=evidence.case_file_id).first() if evidence.case_file_id else None
            if not _is_case_assigned_and_approved(case_file, user_id):
                if case_file and not _is_case_approved(case_file):
                    log_event(
                        user_id,
                        'custody_chain_view_denied',
                        'evidence',
                        evidence_id,
                        details={'reason': 'case_pending_approval', 'case_file_id': evidence.case_file_id},
                        status='failure',
                    )
                    return jsonify({'error': 'Case is pending admin approval'}), 403
                log_event(
                    user_id,
                    'custody_chain_view_denied',
                    'evidence',
                    evidence_id,
                    details={'reason': 'unauthorized', 'case_file_id': evidence.case_file_id},
                    status='failure',
                )
                return jsonify({'error': 'Unauthorized'}), 403
        if claims['role'] == 'court_user':
            if not _court_can_view_evidence(evidence, user_id):
                reason = (
                    'court_access_inactive'
                    if evidence.case_file_id and _is_evidence_approved(evidence) and not evidence.is_deleted
                    else 'evidence_not_available'
                )
                log_event(
                    user_id,
                    'custody_chain_view_denied',
                    'evidence',
                    evidence_id,
                    details={
                        'reason': reason,
                        'case_file_id': evidence.case_file_id,
                        'approval_status': evidence.approval_status,
                        'is_deleted': evidence.is_deleted,
                    },
                    status='failure',
                )
                if reason == 'court_access_inactive':
                    return jsonify({'error': 'Court access window not active for this case'}), 403
                return jsonify({'error': 'Unauthorized'}), 403
        if claims['role'] not in ['admin', 'investigator', 'court_user']:
            log_event(
                user_id,
                'custody_chain_view_denied',
                'evidence',
                evidence_id,
                details={'reason': 'invalid_role', 'role': claims.get('role')},
                status='failure',
            )
            return jsonify({'error': 'Invalid role'}), 403
        
        custody_records = CustodyRecord.query.filter_by(evidence_id=evidence_id).all()
        user_ids = {record.user_id for record in custody_records}
        user_map = {}
        if user_ids:
            users = User.query.filter(User.id.in_(user_ids)).all()
            user_map = {
                user.id: {
                    'username': user.username,
                    'pqid': user.pqid,
                }
                for user in users
            }
        
        log_event(user_id, 'custody_chain_view', 'evidence', evidence_id)
        
        return jsonify({
            'evidence_id': evidence_id,
            'custody_chain': [
                {
                    **record.to_dict(),
                    'handler_name': user_map.get(record.user_id, {}).get('username'),
                    'handler_pqid': user_map.get(record.user_id, {}).get('pqid'),
                }
                for record in custody_records
            ]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@evidence_bp.route('/<evidence_id>/submit-to-court', methods=['POST'])
@jwt_required()
def submit_to_court(evidence_id):
    """Submit evidence to court (change access level)"""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        
        evidence = Evidence.query.get(evidence_id)
        if not evidence:
            return jsonify({'error': 'Evidence not found'}), 404
        
        # Check permissions
        role = claims.get('role')
        if role not in ['investigator', 'admin']:
            return jsonify({'error': 'Unauthorized'}), 403

        if role == 'investigator':
            case_file = CaseFile.query.filter_by(id=evidence.case_file_id).first() if evidence.case_file_id else None
            if not _is_case_assigned_and_approved(case_file, user_id):
                if case_file and not _is_case_approved(case_file):
                    return jsonify({'error': 'Case is pending admin approval'}), 403
                return jsonify({'error': 'Unauthorized'}), 403
            
        # Update access level
        evidence.access_level = 'court'
        
        # Log custody record
        user = User.query.get(user_id)
        sig_secret_key = user.get_sig_secret_key()
        viewer_sig_algorithm = user.pqc_sig_algorithm or pqc_engine.sig_algorithm
        
        custody = CustodyRecord(
            evidence_id=evidence.id,
            user_id=user_id,
            action='submit_to_court',
            ip_address=request.remote_addr,
            signature=(
                pqc_engine.sign(
                    build_evidence_signature_payload({'evidence_id': evidence.id, 'action': 'submit_to_court'}),
                    sig_secret_key,
                    sig_algorithm=viewer_sig_algorithm,
                )
                if sig_secret_key
                else None
            )
        )
        db.session.add(custody)
        db.session.commit()
        
        log_event(user_id, 'evidence_submit_court', 'evidence', evidence_id)
        
        return jsonify({
            'message': 'Evidence submitted to court successfully',
            'evidence': evidence.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
