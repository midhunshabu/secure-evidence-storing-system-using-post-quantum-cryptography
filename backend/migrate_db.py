"""Idempotent schema migration utility for existing deployments."""

import hashlib
import hmac
import json
import sys
import os
import re
import secrets
import string
from datetime import datetime

from sqlalchemy import inspect, text

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db  # noqa: E402


def _column_exists(inspector, table_name, column_name):
    columns = inspector.get_columns(table_name)
    return any(col["name"] == column_name for col in columns)


def _run_sql(conn, sql):
    conn.execute(text(sql))


def _audit_payload(row):
    if row.timestamp is None:
        timestamp_value = None
    elif hasattr(row.timestamp, "isoformat"):
        timestamp_value = row.timestamp.isoformat()
    else:
        timestamp_value = str(row.timestamp)

    payload = {
        "user_id": row.user_id,
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "details": row.details,
        "status": row.status,
        "error_message": row.error_message,
        "ip_address": row.ip_address,
        "user_agent": row.user_agent,
        "timestamp": timestamp_value,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _audit_hash(prev_hash, payload):
    return hashlib.sha3_256(f"{prev_hash}|{payload}".encode("utf-8")).hexdigest()


def _aadhar_hash_pepper():
    return (
        os.getenv("AADHAR_HASH_PEPPER")
        or os.getenv("SECRET_KEY")
        or os.getenv("JWT_SECRET_KEY")
        or "dev-aadhar-pepper"
    )


def _normalize_aadhar_number(raw_value):
    digits_only = re.sub(r"\D", "", str(raw_value or ""))
    if len(digits_only) != 12:
        return None
    return digits_only


def _hash_aadhar_number(normalized_aadhar):
    pepper = _aadhar_hash_pepper().encode("utf-8")
    return hmac.new(pepper, normalized_aadhar.encode("utf-8"), hashlib.sha256).hexdigest()


def _generate_backfill_pqid(username):
    """Generate a PQID for existing users without knowing their password."""
    def get_letters(source, count):
        letters = [c for c in (source or "") if str(c).isalpha()]
        if not letters:
            letters = list(string.ascii_letters)
        return "".join(secrets.choice(letters) for _ in range(count))

    user_part = get_letters(username, 3)
    pass_part = get_letters(string.ascii_letters, 3)
    digits = "".join(secrets.choice(string.digits) for _ in range(2))
    symbols = "".join(secrets.choice("!@#$%^&*") for _ in range(2))
    remainder_pool = list(user_part + pass_part + digits + symbols)
    secrets.SystemRandom().shuffle(remainder_pool)
    return "pq" + "".join(remainder_pool)


def migrate():
    app = create_app(os.getenv("APP_ENV", "development"))

    with app.app_context():
        inspector = inspect(db.engine)
        dialect = db.engine.dialect.name
        print(f"[{datetime.utcnow().isoformat()}] Running migration for dialect: {dialect}")

        with db.engine.begin() as conn:
            if inspector.has_table("users"):
                if not _column_exists(inspector, "users", "pqc_kem_public_key"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN pqc_kem_public_key TEXT")
                if not _column_exists(inspector, "users", "pqc_kem_secret_key"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN pqc_kem_secret_key TEXT")
                if not _column_exists(inspector, "users", "pqc_sig_public_key"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN pqc_sig_public_key TEXT")
                if not _column_exists(inspector, "users", "pqc_sig_secret_key"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN pqc_sig_secret_key TEXT")
                if not _column_exists(inspector, "users", "client_auth_sig_public_key"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN client_auth_sig_public_key TEXT")
                if not _column_exists(inspector, "users", "pqc_kem_algorithm"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN pqc_kem_algorithm VARCHAR(64)")
                if not _column_exists(inspector, "users", "pqc_sig_algorithm"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN pqc_sig_algorithm VARCHAR(64)")
                if not _column_exists(inspector, "users", "current_challenge_expires_at"):
                    if dialect == "postgresql":
                        _run_sql(
                            conn,
                            "ALTER TABLE users ADD COLUMN current_challenge_expires_at TIMESTAMP",
                        )
                    else:
                        _run_sql(
                            conn,
                            "ALTER TABLE users ADD COLUMN current_challenge_expires_at DATETIME",
                        )
                if not _column_exists(inspector, "users", "webauthn_required"):
                    if dialect == "postgresql":
                        _run_sql(conn, "ALTER TABLE users ADD COLUMN webauthn_required BOOLEAN DEFAULT FALSE")
                    else:
                        _run_sql(conn, "ALTER TABLE users ADD COLUMN webauthn_required BOOLEAN DEFAULT 0")
                if not _column_exists(inspector, "users", "webauthn_user_handle"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN webauthn_user_handle VARCHAR(128)")
                _run_sql(
                    conn,
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_webauthn_user_handle ON users (webauthn_user_handle)",
                )
                if not _column_exists(inspector, "users", "webauthn_enrolled_at"):
                    if dialect == "postgresql":
                        _run_sql(conn, "ALTER TABLE users ADD COLUMN webauthn_enrolled_at TIMESTAMP")
                    else:
                        _run_sql(conn, "ALTER TABLE users ADD COLUMN webauthn_enrolled_at DATETIME")
                
                if not _column_exists(inspector, "users", "address"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN address TEXT")
                if not _column_exists(inspector, "users", "phone_number"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN phone_number VARCHAR(20)")
                if not _column_exists(inspector, "users", "pqid"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN pqid VARCHAR(50)")
                    _run_sql(conn, "CREATE UNIQUE INDEX ix_users_pqid ON users (pqid)")
                if not _column_exists(inspector, "users", "pqid_failed_attempts"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN pqid_failed_attempts INTEGER DEFAULT 0")
                if not _column_exists(inspector, "users", "pqid_locked_until"):
                    if dialect == "postgresql":
                        _run_sql(conn, "ALTER TABLE users ADD COLUMN pqid_locked_until TIMESTAMP")
                    else:
                        _run_sql(conn, "ALTER TABLE users ADD COLUMN pqid_locked_until DATETIME")
                if not _column_exists(inspector, "users", "is_physically_verified"):
                    if dialect == "postgresql":
                        _run_sql(conn, "ALTER TABLE users ADD COLUMN is_physically_verified BOOLEAN DEFAULT FALSE")
                    else:
                        _run_sql(conn, "ALTER TABLE users ADD COLUMN is_physically_verified BOOLEAN DEFAULT 0")

                if not _column_exists(inspector, "users", "aadhar_number"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN aadhar_number VARCHAR(20)")
                if not _column_exists(inspector, "users", "aadhar_hash"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN aadhar_hash VARCHAR(64)")
                rows_to_backfill = conn.execute(
                    text(
                        "SELECT id, aadhar_number FROM users "
                        "WHERE aadhar_number IS NOT NULL "
                        "AND TRIM(aadhar_number) <> '' "
                        "AND (aadhar_hash IS NULL OR aadhar_hash = '')"
                    )
                ).fetchall()
                for row in rows_to_backfill:
                    normalized = _normalize_aadhar_number(row.aadhar_number)
                    if not normalized:
                        continue
                    conn.execute(
                        text(
                            "UPDATE users SET aadhar_hash=:aadhar_hash WHERE id=:id"
                        ),
                        {"id": row.id, "aadhar_hash": _hash_aadhar_number(normalized)},
                    )
                duplicate_hash_rows = conn.execute(
                    text(
                        "SELECT aadhar_hash, COUNT(*) AS hash_count "
                        "FROM users "
                        "WHERE aadhar_hash IS NOT NULL AND TRIM(aadhar_hash) <> '' "
                        "GROUP BY aadhar_hash "
                        "HAVING COUNT(*) > 1"
                    )
                ).fetchall()
                if duplicate_hash_rows:
                    print(
                        f"WARNING: Found {len(duplicate_hash_rows)} duplicate aadhar hash group(s); "
                        "creating non-unique index only."
                    )
                    _run_sql(
                        conn,
                        "CREATE INDEX IF NOT EXISTS ix_users_aadhar_hash ON users (aadhar_hash)",
                    )
                else:
                    _run_sql(
                        conn,
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_aadhar_hash ON users (aadhar_hash)",
                    )
                if not _column_exists(inspector, "users", "designation"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN designation VARCHAR(100)")
                if not _column_exists(inspector, "users", "court_details"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN court_details TEXT")
                if not _column_exists(inspector, "users", "station_name"):
                    _run_sql(conn, "ALTER TABLE users ADD COLUMN station_name VARCHAR(100)")

            # Refresh inspector after potential changes.
            inspector = inspect(db.engine)

            if inspector.has_table("audit_logs"):
                if not _column_exists(inspector, "audit_logs", "prev_hash"):
                    _run_sql(conn, "ALTER TABLE audit_logs ADD COLUMN prev_hash VARCHAR(64)")
                if not _column_exists(inspector, "audit_logs", "current_hash"):
                    _run_sql(conn, "ALTER TABLE audit_logs ADD COLUMN current_hash VARCHAR(64)")

                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_audit_logs_prev_hash ON audit_logs (prev_hash)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_audit_logs_current_hash ON audit_logs (current_hash)",
                )

                needs_backfill = conn.execute(
                    text(
                        "SELECT COUNT(*) FROM audit_logs "
                        "WHERE current_hash IS NULL OR current_hash=''"
                    )
                ).scalar() or 0
                if needs_backfill:
                    rows = conn.execute(
                        text(
                            "SELECT id, user_id, action, resource_type, resource_id, details, status, "
                            "error_message, ip_address, user_agent, timestamp "
                            "FROM audit_logs ORDER BY id ASC"
                        )
                    ).fetchall()
                    prev_hash = "GENESIS"
                    for row in rows:
                        payload = _audit_payload(row)
                        current_hash = _audit_hash(prev_hash, payload)
                        conn.execute(
                            text(
                                "UPDATE audit_logs SET prev_hash=:prev_hash, current_hash=:current_hash "
                                "WHERE id=:id"
                            ),
                            {"id": row.id, "prev_hash": prev_hash, "current_hash": current_hash},
                        )
                        prev_hash = current_hash

            if not inspector.has_table("case_files"):
                if dialect == "postgresql":
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE case_files (
                            id VARCHAR(36) PRIMARY KEY,
                            case_number VARCHAR(64) NOT NULL UNIQUE,
                            quantum_ledger_number VARCHAR(20) NOT NULL UNIQUE,
                            case_title TEXT NOT NULL,
                            complainant_name TEXT,
                            suspect_name TEXT,
                            incident_date DATE,
                            incident_state TEXT,
                            incident_district TEXT,
                            incident_location TEXT,
                            case_summary TEXT,
                            status VARCHAR(20) NOT NULL DEFAULT 'open',
                            assigned_investigator_id INTEGER REFERENCES users(id),
                            approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
                            approved_by INTEGER REFERENCES users(id),
                            approved_at TIMESTAMP,
                            approval_notes TEXT,
                            created_by INTEGER NOT NULL REFERENCES users(id),
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """,
                    )
                else:
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE case_files (
                            id VARCHAR(36) PRIMARY KEY,
                            case_number VARCHAR(64) NOT NULL UNIQUE,
                            quantum_ledger_number VARCHAR(20) NOT NULL UNIQUE,
                            case_title TEXT NOT NULL,
                            complainant_name TEXT,
                            suspect_name TEXT,
                            incident_date DATE,
                            incident_state TEXT,
                            incident_district TEXT,
                            incident_location TEXT,
                            case_summary TEXT,
                            status VARCHAR(20) NOT NULL DEFAULT 'open',
                            assigned_investigator_id INTEGER,
                            approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
                            approved_by INTEGER,
                            approved_at DATETIME,
                            approval_notes TEXT,
                            created_by INTEGER NOT NULL,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY(assigned_investigator_id) REFERENCES users(id),
                            FOREIGN KEY(approved_by) REFERENCES users(id),
                            FOREIGN KEY(created_by) REFERENCES users(id)
                        )
                        """,
                    )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_case_number ON case_files (case_number)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_quantum_ledger_number ON case_files (quantum_ledger_number)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_created_by ON case_files (created_by)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_status ON case_files (status)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_approval_status ON case_files (approval_status)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_assigned_investigator_id "
                    "ON case_files (assigned_investigator_id)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_created_at ON case_files (created_at)",
                )

            inspector = inspect(db.engine)
            if inspector.has_table("case_files"):
                if not _column_exists(inspector, "case_files", "quantum_ledger_number"):
                    _run_sql(conn, "ALTER TABLE case_files ADD COLUMN quantum_ledger_number VARCHAR(20)")
                if not _column_exists(inspector, "case_files", "incident_state"):
                    _run_sql(conn, "ALTER TABLE case_files ADD COLUMN incident_state TEXT")
                if not _column_exists(inspector, "case_files", "incident_district"):
                    _run_sql(conn, "ALTER TABLE case_files ADD COLUMN incident_district TEXT")
                if not _column_exists(inspector, "case_files", "assigned_investigator_id"):
                    _run_sql(conn, "ALTER TABLE case_files ADD COLUMN assigned_investigator_id INTEGER")
                if not _column_exists(inspector, "case_files", "approval_status"):
                    _run_sql(conn, "ALTER TABLE case_files ADD COLUMN approval_status VARCHAR(20) DEFAULT 'approved'")
                if not _column_exists(inspector, "case_files", "approved_by"):
                    _run_sql(conn, "ALTER TABLE case_files ADD COLUMN approved_by INTEGER")
                if not _column_exists(inspector, "case_files", "approved_at"):
                    _run_sql(conn, "ALTER TABLE case_files ADD COLUMN approved_at DATETIME")
                if not _column_exists(inspector, "case_files", "approval_notes"):
                    _run_sql(conn, "ALTER TABLE case_files ADD COLUMN approval_notes TEXT")

                rows_missing_ql = conn.execute(
                    text(
                        "SELECT id, created_at FROM case_files "
                        "WHERE quantum_ledger_number IS NULL OR TRIM(quantum_ledger_number)=''"
                    )
                ).fetchall()
                yearly_sequence = {}
                existing_ql_rows = conn.execute(
                    text(
                        "SELECT quantum_ledger_number FROM case_files "
                        "WHERE quantum_ledger_number IS NOT NULL AND TRIM(quantum_ledger_number)<>''"
                    )
                ).fetchall()
                for existing in existing_ql_rows:
                    ql_value = str(existing.quantum_ledger_number or "").strip().upper()
                    if len(ql_value) < 8 or not ql_value.startswith("QL"):
                        continue
                    yy = ql_value[2:4]
                    tail = ql_value[-4:]
                    if not yy.isdigit() or not tail.isdigit():
                        continue
                    yearly_sequence[yy] = max(yearly_sequence.get(yy, 1817), int(tail))
                for row in rows_missing_ql:
                    created_at = row.created_at
                    if hasattr(created_at, "year"):
                        year = int(created_at.year)
                    else:
                        try:
                            year = datetime.fromisoformat(str(created_at)).year
                        except Exception:
                            year = datetime.utcnow().year
                    yy = f"{year % 100:02d}"
                    current_seq = yearly_sequence.get(yy, 1817) + 1
                    yearly_sequence[yy] = current_seq
                    quantum_ledger = f"QL{yy}ZZZZ{current_seq:04d}"
                    conn.execute(
                        text(
                            "UPDATE case_files SET quantum_ledger_number=:quantum_ledger_number "
                            "WHERE id=:id"
                        ),
                        {"id": row.id, "quantum_ledger_number": quantum_ledger},
                    )

                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_assigned_investigator_id "
                    "ON case_files (assigned_investigator_id)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_files_approval_status "
                    "ON case_files (approval_status)",
                )

                _run_sql(
                    conn,
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_case_files_quantum_ledger_number "
                    "ON case_files (quantum_ledger_number)",
                )

            inspector = inspect(db.engine)
            if not inspector.has_table("case_access_requests"):
                if dialect == "postgresql":
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE case_access_requests (
                            id SERIAL PRIMARY KEY,
                            requested_by INTEGER NOT NULL REFERENCES users(id),
                            case_file_id VARCHAR(36) REFERENCES case_files(id) ON DELETE SET NULL,
                            requested_case_number VARCHAR(64),
                            requested_quantum_ledger_number VARCHAR(20),
                            requested_duration_minutes INTEGER NOT NULL DEFAULT 60,
                            reason TEXT,
                            status VARCHAR(20) NOT NULL DEFAULT 'pending',
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            decided_at TIMESTAMP,
                            decided_by INTEGER REFERENCES users(id),
                            decision_notes TEXT,
                            granted_expires_at TIMESTAMP
                        )
                        """,
                    )
                else:
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE case_access_requests (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            requested_by INTEGER NOT NULL,
                            case_file_id VARCHAR(36),
                            requested_case_number VARCHAR(64),
                            requested_quantum_ledger_number VARCHAR(20),
                            requested_duration_minutes INTEGER NOT NULL DEFAULT 60,
                            reason TEXT,
                            status VARCHAR(20) NOT NULL DEFAULT 'pending',
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            decided_at DATETIME,
                            decided_by INTEGER,
                            decision_notes TEXT,
                            granted_expires_at DATETIME,
                            FOREIGN KEY(requested_by) REFERENCES users(id),
                            FOREIGN KEY(case_file_id) REFERENCES case_files(id),
                            FOREIGN KEY(decided_by) REFERENCES users(id)
                        )
                        """,
                    )

            inspector = inspect(db.engine)
            if inspector.has_table("case_access_requests"):
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_requested_by "
                    "ON case_access_requests (requested_by)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_case_file_id "
                    "ON case_access_requests (case_file_id)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_status "
                    "ON case_access_requests (status)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_created_at "
                    "ON case_access_requests (created_at)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_requested_case_number "
                    "ON case_access_requests (requested_case_number)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_requested_quantum_ledger_number "
                    "ON case_access_requests (requested_quantum_ledger_number)",
                )

            inspector = inspect(db.engine)
            if not inspector.has_table("case_access_grants"):
                if dialect == "postgresql":
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE case_access_grants (
                            id SERIAL PRIMARY KEY,
                            case_file_id VARCHAR(36) NOT NULL REFERENCES case_files(id) ON DELETE CASCADE,
                            court_user_id INTEGER NOT NULL REFERENCES users(id),
                            granted_by INTEGER NOT NULL REFERENCES users(id),
                            granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            expires_at TIMESTAMP NOT NULL,
                            revoked_at TIMESTAMP,
                            revoked_by INTEGER REFERENCES users(id),
                            revoke_reason TEXT,
                            source_request_id INTEGER REFERENCES case_access_requests(id) ON DELETE SET NULL,
                            notes TEXT
                        )
                        """,
                    )
                else:
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE case_access_grants (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            case_file_id VARCHAR(36) NOT NULL,
                            court_user_id INTEGER NOT NULL,
                            granted_by INTEGER NOT NULL,
                            granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            expires_at DATETIME NOT NULL,
                            revoked_at DATETIME,
                            revoked_by INTEGER,
                            revoke_reason TEXT,
                            source_request_id INTEGER,
                            notes TEXT,
                            FOREIGN KEY(case_file_id) REFERENCES case_files(id),
                            FOREIGN KEY(court_user_id) REFERENCES users(id),
                            FOREIGN KEY(granted_by) REFERENCES users(id),
                            FOREIGN KEY(revoked_by) REFERENCES users(id),
                            FOREIGN KEY(source_request_id) REFERENCES case_access_requests(id)
                        )
                        """,
                    )

            inspector = inspect(db.engine)
            if inspector.has_table("case_access_grants"):
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_case_file_id "
                    "ON case_access_grants (case_file_id)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_court_user_id "
                    "ON case_access_grants (court_user_id)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_expires_at "
                    "ON case_access_grants (expires_at)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_revoked_at "
                    "ON case_access_grants (revoked_at)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_source_request_id "
                    "ON case_access_grants (source_request_id)",
                )

            if inspector.has_table("evidence"):
                if not _column_exists(inspector, "evidence", "approval_status"):
                    _run_sql(conn, "ALTER TABLE evidence ADD COLUMN approval_status VARCHAR(20)")
                    _run_sql(
                        conn,
                        "UPDATE evidence SET approval_status='approved' "
                        "WHERE approval_status IS NULL OR approval_status=''",
                    )
                if not _column_exists(inspector, "evidence", "approved_by"):
                    _run_sql(conn, "ALTER TABLE evidence ADD COLUMN approved_by INTEGER")
                if not _column_exists(inspector, "evidence", "approved_at"):
                    if dialect == "postgresql":
                        _run_sql(conn, "ALTER TABLE evidence ADD COLUMN approved_at TIMESTAMP")
                    else:
                        _run_sql(conn, "ALTER TABLE evidence ADD COLUMN approved_at DATETIME")
                if not _column_exists(inspector, "evidence", "approval_signature"):
                    _run_sql(conn, "ALTER TABLE evidence ADD COLUMN approval_signature TEXT")
                if not _column_exists(inspector, "evidence", "signature_public_key"):
                    _run_sql(conn, "ALTER TABLE evidence ADD COLUMN signature_public_key TEXT")
                if not _column_exists(inspector, "evidence", "signature_algorithm"):
                    _run_sql(conn, "ALTER TABLE evidence ADD COLUMN signature_algorithm VARCHAR(64)")
                if not _column_exists(inspector, "evidence", "case_file_id"):
                    _run_sql(conn, "ALTER TABLE evidence ADD COLUMN case_file_id VARCHAR(36)")
                _run_sql(conn, "CREATE INDEX IF NOT EXISTS ix_evidence_case_file_id ON evidence (case_file_id)")

            if not inspector.has_table("refresh_tokens"):
                if dialect == "postgresql":
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE refresh_tokens (
                            id SERIAL PRIMARY KEY,
                            user_id INTEGER NOT NULL REFERENCES users(id),
                            jti_hash VARCHAR(64) NOT NULL UNIQUE,
                            expires_at TIMESTAMP NOT NULL,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            last_used_at TIMESTAMP,
                            revoked_at TIMESTAMP,
                            replaced_by_hash VARCHAR(64),
                            created_ip VARCHAR(45),
                            user_agent VARCHAR(255)
                        )
                        """,
                    )
                else:
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE refresh_tokens (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            jti_hash VARCHAR(64) NOT NULL UNIQUE,
                            expires_at DATETIME NOT NULL,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            last_used_at DATETIME,
                            revoked_at DATETIME,
                            replaced_by_hash VARCHAR(64),
                            created_ip VARCHAR(45),
                            user_agent VARCHAR(255),
                            FOREIGN KEY(user_id) REFERENCES users(id)
                        )
                        """,
                    )
                _run_sql(conn, "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens (user_id)")
                _run_sql(conn, "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_jti_hash ON refresh_tokens (jti_hash)")
                _run_sql(conn, "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at ON refresh_tokens (expires_at)")

            inspector = inspect(db.engine)
            if not inspector.has_table("system_heartbeats"):
                if dialect == "postgresql":
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE system_heartbeats (
                            id SERIAL PRIMARY KEY,
                            beat_minute TIMESTAMP NOT NULL UNIQUE,
                            load_pct INTEGER NOT NULL DEFAULT 0,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """,
                    )
                else:
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE system_heartbeats (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            beat_minute DATETIME NOT NULL UNIQUE,
                            load_pct INTEGER NOT NULL DEFAULT 0,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """,
                    )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_system_heartbeats_beat_minute ON system_heartbeats (beat_minute)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_system_heartbeats_created_at ON system_heartbeats (created_at)",
                )
            else:
                if not _column_exists(inspector, "system_heartbeats", "load_pct"):
                    _run_sql(
                        conn,
                        "ALTER TABLE system_heartbeats ADD COLUMN load_pct INTEGER NOT NULL DEFAULT 0",
                    )

            inspector = inspect(db.engine)
            if not inspector.has_table("webauthn_credentials"):
                if dialect == "postgresql":
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE webauthn_credentials (
                            id SERIAL PRIMARY KEY,
                            user_id INTEGER NOT NULL REFERENCES users(id),
                            credential_id TEXT NOT NULL UNIQUE,
                            public_key TEXT NOT NULL,
                            sign_count INTEGER NOT NULL DEFAULT 0,
                            transports TEXT,
                            device_type VARCHAR(40),
                            backed_up BOOLEAN DEFAULT FALSE,
                            fmt VARCHAR(40),
                            aaguid VARCHAR(36),
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            last_used_at TIMESTAMP,
                            is_active BOOLEAN DEFAULT TRUE
                        )
                        """,
                    )
                else:
                    _run_sql(
                        conn,
                        """
                        CREATE TABLE webauthn_credentials (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            credential_id TEXT NOT NULL UNIQUE,
                            public_key TEXT NOT NULL,
                            sign_count INTEGER NOT NULL DEFAULT 0,
                            transports TEXT,
                            device_type VARCHAR(40),
                            backed_up BOOLEAN DEFAULT 0,
                            fmt VARCHAR(40),
                            aaguid VARCHAR(36),
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            last_used_at DATETIME,
                            is_active BOOLEAN DEFAULT 1,
                            FOREIGN KEY(user_id) REFERENCES users(id)
                        )
                        """,
                    )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_webauthn_credentials_user_id ON webauthn_credentials (user_id)",
                )
                _run_sql(
                    conn,
                    "CREATE INDEX IF NOT EXISTS ix_webauthn_credentials_credential_id ON webauthn_credentials (credential_id)",
                )

        print(f"[{datetime.utcnow().isoformat()}] Migration completed successfully.")

        # Post-migration data hardening (ORM-level transforms).
        from app.models.audit_log import AuditLog  # noqa: E402
        from app.models.evidence import Evidence  # noqa: E402
        from app.models.user import User  # noqa: E402

        migrated_key_users = 0
        migrated_auditor_roles = 0
        for user in User.query.filter_by(role="auditor").all():
            user.role = "investigator"
            migrated_auditor_roles += 1

        for user in User.query.all():
            if user.pqc_kem_secret_key or user.pqc_sig_secret_key or user.pqc_secret_key:
                user.set_private_keys(
                    kem_secret_key=user.pqc_kem_secret_key,
                    sig_secret_key=user.pqc_sig_secret_key,
                    legacy_secret_key=user.pqc_secret_key,
                )
                migrated_key_users += 1

        # Trigger encrypted type write for legacy plaintext rows.
        for evidence in Evidence.query.all():
            evidence.case_id = evidence.case_id
            evidence.filename = evidence.filename
            evidence.description = evidence.description
            evidence.evidence_type = evidence.evidence_type

        generated_pqid_users = 0
        users_missing_pqid = User.query.filter(
            (User.pqid.is_(None)) | (User.pqid == "")
        ).all()
        for user in users_missing_pqid:
            candidate = _generate_backfill_pqid(user.username)
            while User.query.filter_by(pqid=candidate).first():
                candidate = _generate_backfill_pqid(user.username)
            user.pqid = candidate
            generated_pqid_users += 1

        for log in AuditLog.query.all():
            log.details = log.details
            log.error_message = log.error_message
            log.ip_address = log.ip_address
            log.user_agent = log.user_agent

        db.session.commit()
        print(
            f"[{datetime.utcnow().isoformat()}] Hardened data: migrated key bundles for {migrated_key_users} user(s), "
            f"converted {migrated_auditor_roles} auditor role(s) to investigator, "
            f"generated PQID for {generated_pqid_users} user(s)."
        )


if __name__ == "__main__":
    migrate()
