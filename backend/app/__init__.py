"""Flask application factory and extension wiring."""

import logging
import os
import json
import threading
from datetime import datetime
from logging.handlers import RotatingFileHandler

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, get_jwt, get_jwt_identity, verify_jwt_in_request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError
from sqlalchemy import inspect, text
from werkzeug.middleware.proxy_fix import ProxyFix

from config import config

db = SQLAlchemy()
jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address)
_heartbeat_stop = threading.Event()


@jwt.token_in_blocklist_loader
def _reject_webauthn_login_tokens(_jwt_header, jwt_payload):
    """Prevent temporary WebAuthn login tokens from accessing protected APIs."""
    if jwt_payload.get("webauthn_login") or jwt_payload.get("pqid_login"):
        return True

    user_id = jwt_payload.get("sub")
    if not user_id:
        return False
    try:
        from app.models.user import User

        user = User.query.get(user_id)
        if user and user.pqid_locked_until and user.pqid_locked_until > datetime.utcnow():
            try:
                from app.utils.pqid import is_pqid_bypass_user
            except Exception:
                is_pqid_bypass_user = None
            if is_pqid_bypass_user and is_pqid_bypass_user(user):
                return False
            return True
    except Exception:
        return False
    return False


def _configure_logging(app: Flask):
    os.makedirs(app.config["LOG_DIR"], exist_ok=True)
    level = getattr(logging, app.config.get("LOG_LEVEL", "INFO").upper(), logging.INFO)
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
    )

    file_handler = RotatingFileHandler(
        os.path.join(app.config["LOG_DIR"], "app.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=10,
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(formatter)

    app.logger.setLevel(level)
    app.logger.addHandler(file_handler)


def _add_security_headers(app: Flask):
    @app.after_request
    def apply_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "object-src 'self' blob:; "
            "frame-src 'self' blob:; "
            "frame-ancestors 'none'; "
            "base-uri 'self';"
        )
        if app.config.get("FORCE_HTTPS_HEADERS", False):
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response


def _add_request_audit_logging(app: Flask):
    @app.after_request
    def audit_api_request(response):
        try:
            if request.method == "OPTIONS":
                return response
            if not request.path.startswith("/api/"):
                return response
            if request.path == "/api/healthz":
                return response
            if not app.config.get("AUDIT_API_REQUESTS", False):
                return response

            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            if not user_id:
                return response

            claims = get_jwt() or {}
            details = {
                "method": request.method,
                "path": request.path,
                "endpoint": request.endpoint,
                "status_code": response.status_code,
                "query": request.args.to_dict(flat=False),
                "view_args": request.view_args or {},
                "role": claims.get("role"),
            }

            resource_type = "api"
            path_parts = [part for part in request.path.split("/") if part]
            if len(path_parts) >= 2:
                resource_type = path_parts[1]

            resource_id = None
            for key in ("id", "user_id", "evidence_id", "case_id"):
                if key in (request.view_args or {}):
                    resource_id = str((request.view_args or {}).get(key))
                    break

            from app.models.audit_log import AuditLog

            db.session.add(
                AuditLog(
                    user_id=user_id,
                    action="api_request",
                    resource_type=resource_type[:50],
                    resource_id=resource_id,
                    details=json.dumps(details, sort_keys=True),
                    status="success" if response.status_code < 400 else "failure",
                    ip_address=request.remote_addr,
                    user_agent=request.headers.get("User-Agent", ""),
                )
            )
            db.session.commit()
        except Exception:
            db.session.rollback()
            app.logger.exception("Failed to write automatic request audit log")
        return response


def _normalize_storage_paths(app: Flask):
    base_dir = os.path.abspath(os.path.join(app.root_path, ".."))
    for key in ("UPLOAD_FOLDER", "CASE_BOOK_UPLOAD_FOLDER"):
        path = app.config.get(key)
        if path and not os.path.isabs(path):
            app.config[key] = os.path.abspath(os.path.join(base_dir, path))


def _normalize_database_uri(app: Flask):
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if not uri:
        return
    if uri.startswith("sqlite:///") and not uri.startswith("sqlite:////"):
        base_dir = os.path.abspath(os.path.join(app.root_path, ".."))
        rel_path = uri[len("sqlite:///"):]
        abs_path = os.path.abspath(os.path.join(base_dir, rel_path))
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{abs_path}"
        uri = app.config["SQLALCHEMY_DATABASE_URI"]
    if uri.startswith("sqlite:///"):
        db_path = uri[len("sqlite:///"):]
        db_dir = os.path.dirname(db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)


def _record_heartbeat(app: Flask):
    from app.models.system_heartbeat import SystemHeartbeat

    beat_minute = datetime.utcnow().replace(second=0, microsecond=0)
    load1 = 0.0
    if hasattr(os, "getloadavg"):
        try:
            load1 = float(os.getloadavg()[0])
        except OSError:
            load1 = 0.0
    load_pct = max(0, min(100, int((load1 / 4.0) * 100)))

    with app.app_context():
        try:
            db.session.add(SystemHeartbeat(beat_minute=beat_minute, load_pct=load_pct))
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            # Heartbeat for this minute already exists (multi-worker or duplicate tick):
            # refresh the load snapshot for the same minute.
            try:
                existing = SystemHeartbeat.query.filter_by(beat_minute=beat_minute).first()
                if existing:
                    existing.load_pct = load_pct
                    db.session.commit()
            except Exception:
                db.session.rollback()
                app.logger.exception("Failed to update system heartbeat load snapshot")
        except Exception:
            db.session.rollback()
            app.logger.exception("Failed to record system heartbeat")


def _heartbeat_loop(app: Flask, interval_seconds: int):
    # Write one heartbeat immediately when loop starts.
    _record_heartbeat(app)
    while not _heartbeat_stop.wait(max(5, interval_seconds)):
        _record_heartbeat(app)


def _start_heartbeat(app: Flask):
    if not app.config.get("HEARTBEAT_ENABLED", True):
        return

    # Avoid duplicate thread in Flask debug reloader parent process.
    if app.debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return

    if app.extensions.get("heartbeat_thread_started"):
        return

    # Ensure heartbeat table exists even if migration wasn't run for this DB file.
    with app.app_context():
        from app.models.system_heartbeat import SystemHeartbeat

        inspector = inspect(db.engine)
        if not inspector.has_table(SystemHeartbeat.__tablename__):
            SystemHeartbeat.__table__.create(bind=db.engine, checkfirst=True)
        else:
            column_names = {
                col["name"] for col in inspector.get_columns(SystemHeartbeat.__tablename__)
            }
            if "load_pct" not in column_names:
                with db.engine.begin() as conn:
                    conn.execute(
                        text(
                            "ALTER TABLE system_heartbeats ADD COLUMN load_pct INTEGER NOT NULL DEFAULT 0"
                        )
                    )

    app.extensions["heartbeat_thread_started"] = True
    interval = int(app.config.get("HEARTBEAT_INTERVAL_SECONDS", 30) or 30)
    thread = threading.Thread(
        target=_heartbeat_loop,
        args=(app, interval),
        daemon=True,
        name="system-heartbeat",
    )
    thread.start()


def _ensure_case_files_schema(app: Flask):
    """Backfill minimal case_files schema changes for older SQLite deployments."""
    with app.app_context():
        inspector = inspect(db.engine)
        if not inspector.has_table("case_files"):
            return

        column_names = {col["name"] for col in inspector.get_columns("case_files")}
        with db.engine.begin() as conn:
            if "quantum_ledger_number" not in column_names:
                conn.execute(text("ALTER TABLE case_files ADD COLUMN quantum_ledger_number VARCHAR(20)"))
            if "incident_state" not in column_names:
                conn.execute(text("ALTER TABLE case_files ADD COLUMN incident_state TEXT"))
            if "incident_district" not in column_names:
                conn.execute(text("ALTER TABLE case_files ADD COLUMN incident_district TEXT"))
            if "assigned_investigator_id" not in column_names:
                conn.execute(text("ALTER TABLE case_files ADD COLUMN assigned_investigator_id INTEGER"))
            if "approval_status" not in column_names:
                conn.execute(text("ALTER TABLE case_files ADD COLUMN approval_status VARCHAR(20) DEFAULT 'approved'"))
            if "approved_by" not in column_names:
                conn.execute(text("ALTER TABLE case_files ADD COLUMN approved_by INTEGER"))
            if "approved_at" not in column_names:
                conn.execute(text("ALTER TABLE case_files ADD COLUMN approved_at DATETIME"))
            if "approval_notes" not in column_names:
                conn.execute(text("ALTER TABLE case_files ADD COLUMN approval_notes TEXT"))

        with db.engine.begin() as conn:
            rows_missing_ql = conn.execute(
                text(
                    "SELECT id, created_at FROM case_files "
                    "WHERE quantum_ledger_number IS NULL OR TRIM(quantum_ledger_number)=''"
                )
            ).fetchall()

            if rows_missing_ql:
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
                        year_value = int(created_at.year)
                    else:
                        try:
                            year_value = datetime.fromisoformat(str(created_at)).year
                        except Exception:
                            year_value = datetime.utcnow().year

                    yy = f"{year_value % 100:02d}"
                    next_seq = yearly_sequence.get(yy, 1817) + 1
                    yearly_sequence[yy] = next_seq
                    fallback_ql = f"QL{yy}ZZZZ{next_seq:04d}"
                    conn.execute(
                        text(
                            "UPDATE case_files SET quantum_ledger_number=:quantum_ledger_number "
                            "WHERE id=:id"
                        ),
                        {"id": row.id, "quantum_ledger_number": fallback_ql},
                    )

            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_case_files_case_number ON case_files (case_number)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_case_files_created_by ON case_files (created_by)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_case_files_status ON case_files (status)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_case_files_approval_status ON case_files (approval_status)")
            )


def _ensure_user_schema(app: Flask):
    """Backfill minimal users schema changes for older SQLite deployments."""
    with app.app_context():
        inspector = inspect(db.engine)
        if not inspector.has_table("users"):
            return

        column_names = {col["name"] for col in inspector.get_columns("users")}
        with db.engine.begin() as conn:
            if "pqc_kem_algorithm" not in column_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN pqc_kem_algorithm VARCHAR(64)"))
            if "pqc_sig_algorithm" not in column_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN pqc_sig_algorithm VARCHAR(64)"))
            if "pqid_failed_attempts" not in column_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN pqid_failed_attempts INTEGER DEFAULT 0"))
            if "pqid_locked_until" not in column_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN pqid_locked_until TIMESTAMP"))


def _ensure_evidence_schema(app: Flask):
    """Backfill minimal evidence schema changes for older SQLite deployments."""
    with app.app_context():
        inspector = inspect(db.engine)
        if not inspector.has_table("evidence"):
            return

        column_names = {col["name"] for col in inspector.get_columns("evidence")}
        with db.engine.begin() as conn:
            if "signature_public_key" not in column_names:
                conn.execute(text("ALTER TABLE evidence ADD COLUMN signature_public_key TEXT"))
            if "signature_algorithm" not in column_names:
                conn.execute(text("ALTER TABLE evidence ADD COLUMN signature_algorithm VARCHAR(64)"))
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_case_files_created_at ON case_files (created_at)")
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_files_assigned_investigator_id "
                    "ON case_files (assigned_investigator_id)"
                )
            )
            try:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_case_files_quantum_ledger_number "
                        "ON case_files (quantum_ledger_number)"
                    )
                )
            except Exception:
                app.logger.exception("Unable to create unique index for case_files.quantum_ledger_number")
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_case_files_quantum_ledger_number "
                        "ON case_files (quantum_ledger_number)"
                    )
                )


def _ensure_case_book_schema(app: Flask):
    """Ensure case_book_pages table exists for append-only case-book uploads."""
    with app.app_context():
        from app.models.case_book_page import CaseBookPage

        inspector = inspect(db.engine)
        if not inspector.has_table(CaseBookPage.__tablename__):
            CaseBookPage.__table__.create(bind=db.engine, checkfirst=True)
            return

        with db.engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_case_book_pages_case_page "
                    "ON case_book_pages (case_file_id, page_number)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_book_pages_case_file_id "
                    "ON case_book_pages (case_file_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_book_pages_uploaded_by "
                    "ON case_book_pages (uploaded_by)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_book_pages_created_at "
                    "ON case_book_pages (created_at)"
                )
            )


def _ensure_court_access_schema(app: Flask):
    """Ensure court access request/grant tables exist for case-level viewing control."""
    with app.app_context():
        from app.models.court_access import CaseAccessGrant, CaseAccessRequest

        inspector = inspect(db.engine)
        if not inspector.has_table(CaseAccessRequest.__tablename__):
            CaseAccessRequest.__table__.create(bind=db.engine, checkfirst=True)
        if not inspector.has_table(CaseAccessGrant.__tablename__):
            CaseAccessGrant.__table__.create(bind=db.engine, checkfirst=True)

        with db.engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_requested_by "
                    "ON case_access_requests (requested_by)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_case_file_id "
                    "ON case_access_requests (case_file_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_status "
                    "ON case_access_requests (status)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_access_requests_created_at "
                    "ON case_access_requests (created_at)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_case_file_id "
                    "ON case_access_grants (case_file_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_court_user_id "
                    "ON case_access_grants (court_user_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_expires_at "
                    "ON case_access_grants (expires_at)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_case_access_grants_revoked_at "
                    "ON case_access_grants (revoked_at)"
                )
            )


def create_app(config_name="development"):
    """Create and configure the Flask application."""
    load_dotenv()
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    config_obj = config.get(config_name, config["default"])
    app.config.from_object(config_obj)
    config_obj.validate()

    _normalize_storage_paths(app)
    _normalize_database_uri(app)

    # Ensure storage paths exist.
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["CASE_BOOK_UPLOAD_FOLDER"], exist_ok=True)
    _configure_logging(app)

    db.init_app(app)
    jwt.init_app(app)
    # Flask-Limiter reads defaults from app config; keep init_app signature compatible.
    if not app.config.get("RATELIMIT_ENABLED", True):
        app.config["RATELIMIT_ENABLED"] = False
        app.config["RATELIMIT_DEFAULT"] = ""
    limiter.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=False,
    )
    _add_security_headers(app)
    _add_request_audit_logging(app)

    # Ensure SQLAlchemy models are registered before create_all().
    from app import models as _models  # noqa: F401

    if app.config.get("AUTO_CREATE_DB"):
        with app.app_context():
            db.create_all()

    _ensure_case_files_schema(app)
    _ensure_user_schema(app)
    _ensure_evidence_schema(app)
    _ensure_case_book_schema(app)
    _ensure_court_access_schema(app)

    from app.routes.admin import admin_bp
    from app.routes.auth import auth_bp
    from app.routes.evidence import evidence_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(evidence_bp, url_prefix="/api/evidence")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")

    @app.route("/api/healthz", methods=["GET"])
    def healthcheck():
        return jsonify({"status": "ok"}), 200

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react(path):
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        return send_file(os.path.join(app.static_folder, "index.html"))

    _start_heartbeat(app)

    return app
