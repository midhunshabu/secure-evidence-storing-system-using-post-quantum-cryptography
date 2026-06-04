"""Authentication routes."""

import json
import re
import secrets
import hashlib
import string
from difflib import SequenceMatcher
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
    set_refresh_cookies,
    unset_jwt_cookies,
)
from sqlalchemy.exc import IntegrityError

from app import db, limiter
from app.models.audit_log import AuditLog
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.webauthn_credential import WebAuthnCredential
from app.modules.pqc_engine import pqc_engine
from app.utils.helpers import validate_email, validate_password_strength
from app.utils.pqid import enforce_pqid_lockout, is_pqid_bypass_user, verify_pqid
from app.utils.aadhar import hash_aadhar_number, masked_aadhar, normalize_aadhar_number

from webauthn.helpers import (
    base64url_to_bytes,
    bytes_to_base64url,
    generate_challenge,
    generate_user_handle,
    options_to_json,
    parse_authentication_credential_json,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)
from webauthn.authentication.generate_authentication_options import generate_authentication_options
from webauthn.authentication.verify_authentication_response import verify_authentication_response
from webauthn.registration.generate_registration_options import generate_registration_options
from webauthn.registration.verify_registration_response import verify_registration_response

auth_bp = Blueprint("auth", __name__)


# ---------- utility helpers ----------
def _utcnow():
    return datetime.utcnow()


def _log_auth_event(user_id, action, status, details=None, error_msg=None):
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type="auth",
        details=json.dumps(details) if details else None,
        status=status,
        error_message=error_msg,
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent", ""),
    )
    db.session.add(log)
    db.session.commit()


def _hash_jti(jti: str) -> str:
    return hashlib.sha256(jti.encode("utf-8")).hexdigest()


def _revoke_refresh_by_raw_token(raw_token: str):
    try:
        payload = decode_token(raw_token)
    except Exception:
        return
    jti = payload.get("jti")
    if not jti:
        return
    token_row = RefreshToken.query.filter_by(jti_hash=_hash_jti(jti)).first()
    if token_row and not token_row.revoked_at:
        token_row.revoked_at = _utcnow()


def _issue_access_token(user: User):
    return create_access_token(
        identity=user.id,
        additional_claims={"role": user.role},
        expires_delta=current_app.config.get("JWT_ACCESS_TOKEN_EXPIRES", timedelta(hours=1)),
    )


def _issue_refresh_token(user: User):
    return create_refresh_token(
        identity=user.id,
        additional_claims={"role": user.role},
        expires_delta=current_app.config.get("JWT_REFRESH_TOKEN_EXPIRES", timedelta(days=7)),
    )

def _should_require_webauthn(user: User) -> bool:
    if not user:
        return False
    if _is_webauthn_bypass_user(user):
        return False
    if bool(current_app.config.get("WEBAUTHN_LOGIN_REQUIRED", True)):
        return True
    return bool(user.webauthn_required)

def _issue_pqid_login_token(user: User):
    ttl_seconds = int(
        current_app.config.get(
            "PQID_CHALLENGE_TTL_SECONDS",
            current_app.config.get("CHALLENGE_TTL_SECONDS", 300),
        )
    )
    return create_access_token(
        identity=user.id,
        additional_claims={"role": user.role, "pqid_login": True},
        expires_delta=timedelta(seconds=ttl_seconds),
    )


def _parse_pqid_login_token(raw_token: str):
    if not raw_token:
        return None
    try:
        payload = decode_token(raw_token)
    except Exception:
        return None
    if not payload.get("pqid_login"):
        return None
    return payload


def _webauthn_rp_config():
    rp_id = str(current_app.config.get("WEBAUTHN_RP_ID") or "").strip()
    if not rp_id:
        rp_id = request.host.split(":")[0]
    rp_name = str(current_app.config.get("WEBAUTHN_RP_NAME") or "PQC Evidence Vault").strip()
    origin = str(current_app.config.get("WEBAUTHN_ORIGIN") or "").strip()
    if not origin:
        origin = f"{request.scheme}://{request.host}"
    timeout_ms = int(current_app.config.get("WEBAUTHN_TIMEOUT_MS", 60000))
    return rp_id, rp_name, origin, timeout_ms


def _ensure_webauthn_user_handle(user: User):
    if user.webauthn_user_handle:
        return base64url_to_bytes(user.webauthn_user_handle)
    handle = generate_user_handle()
    user.webauthn_user_handle = bytes_to_base64url(handle)
    db.session.commit()
    return handle


def _bool_from_value(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _issue_webauthn_login_token(user: User, stage: str, challenge: bytes, flow: str = "login"):
    ttl_seconds = int(current_app.config.get("WEBAUTHN_CHALLENGE_TTL_SECONDS", 300))
    return create_access_token(
        identity=user.id,
        additional_claims={
            "role": user.role,
            "webauthn_login": True,
            "webauthn_flow": flow,
            "webauthn_stage": stage,
            "webauthn_challenge": bytes_to_base64url(challenge),
        },
        expires_delta=timedelta(seconds=ttl_seconds),
    )


def _parse_webauthn_login_token(raw_token: str):
    if not raw_token:
        return None
    try:
        payload = decode_token(raw_token)
    except Exception:
        return None
    if not payload.get("webauthn_login"):
        return None
    return payload


def _build_webauthn_login_response(user: User, flow: str = "login"):
    rp_id, rp_name, origin, timeout_ms = _webauthn_rp_config()
    credentials = (
        WebAuthnCredential.query.filter_by(user_id=user.id, is_active=True)
        .order_by(WebAuthnCredential.id.asc())
        .all()
    )
    stage = "register" if not credentials else "authenticate"
    challenge = generate_challenge()

    if stage == "register":
        exclude = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(entry.credential_id))
            for entry in credentials
        ]
        selection = AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        )
        user_handle = _ensure_webauthn_user_handle(user)
        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=rp_name,
            user_id=user_handle,
            user_name=user.username,
            user_display_name=user.username,
            challenge=challenge,
            timeout=timeout_ms,
            authenticator_selection=selection,
            exclude_credentials=exclude,
        )
    else:
        allow = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(entry.credential_id))
            for entry in credentials
        ]
        options = generate_authentication_options(
            rp_id=rp_id,
            challenge=challenge,
            timeout=timeout_ms,
            allow_credentials=allow,
            user_verification=UserVerificationRequirement.REQUIRED,
        )

    token = _issue_webauthn_login_token(user, stage, challenge, flow=flow)
    return (
        jsonify(
            {
                "mfa_required": True,
                "mfa_type": "webauthn",
                "flow": flow,
                "stage": stage,
                "login_token": token,
                "options": json.loads(options_to_json(options)),
                "origin": origin,
            }
        ),
        200,
    )


def _build_auth_response(
    user: User,
    existing_refresh_jti_hash: str = None,
    login_method: str = "password",
    log_login: bool = True,
):
    access_token = _issue_access_token(user)
    refresh_token = _issue_refresh_token(user)

    refresh_payload = decode_token(refresh_token)
    refresh_jti = refresh_payload.get("jti")
    refresh_exp = refresh_payload.get("exp")
    expires_at = datetime.utcfromtimestamp(refresh_exp) if refresh_exp else (_utcnow() + timedelta(days=7))
    refresh_jti_hash = _hash_jti(refresh_jti)

    if existing_refresh_jti_hash:
        existing = RefreshToken.query.filter_by(jti_hash=existing_refresh_jti_hash).first()
        if existing and not existing.revoked_at:
            existing.revoked_at = _utcnow()
            existing.replaced_by_hash = refresh_jti_hash
            existing.last_used_at = _utcnow()

    db.session.add(
        RefreshToken(
            user_id=user.id,
            jti_hash=refresh_jti_hash,
            expires_at=expires_at,
            created_ip=request.remote_addr,
            user_agent=request.headers.get("User-Agent", ""),
        )
    )
    user.last_login = _utcnow()
    user.current_challenge = None
    user.current_challenge_expires_at = None
    db.session.commit()
    if log_login:
        _log_auth_event(user.id, "login_success", "success", {"role": user.role, "method": login_method})

    response = jsonify({"access_token": access_token, "user": user.to_dict(), "token_type": "Bearer"})
    set_refresh_cookies(response, refresh_token)
    return response


# ---------- existing admin registration ----------
def _generate_pqid(username, password):
    """Generate a PQID based on specific constraints."""
    # pq + 3 random letters from username + 3 from password + 2 digits + 2 symbols
    
    def get_chars(source, count):
        # Filter for letters only to match "letters from..." requirement, 
        # fallback to source if not enough letters, or random letters if source is too short
        letters = [c for c in source if c.isalpha()]
        if not letters:
            letters = list(string.ascii_letters)
        
        selected = []
        for _ in range(count):
            selected.append(secrets.choice(letters))
        return "".join(selected)

    user_part = get_chars(username, 3)
    pass_part = get_chars(password, 3)
    
    digits = "".join(secrets.choice(string.digits) for _ in range(2))
    symbols = "".join(secrets.choice("!@#$%^&*") for _ in range(2))
    
    # "start with letters pq ... mixed with these combination"
    # The prompt says "start with pq" and then "mixed with these combination".
    # It's slightly ambiguous: "it can be mixed with therese combination but it should start with letters pq"
    # I will stick to: pq + [mixed others]
    
    remainder_pool = list(user_part + pass_part + digits + symbols)
    secrets.SystemRandom().shuffle(remainder_pool)
    
    return "pq" + "".join(remainder_pool)


def _is_webauthn_bypass_user(user):
    return is_pqid_bypass_user(user)


def _normalize_similarity_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _canonicalize_similarity_token(value: str) -> str:
    substitutions = str.maketrans(
        {
            "0": "o",
            "1": "i",
            "3": "e",
            "4": "a",
            "5": "s",
            "7": "t",
            "8": "b",
            "@": "a",
            "$": "s",
            "!": "i",
        }
    )
    translated = str(value or "").lower().translate(substitutions)
    return re.sub(r"[^a-z0-9]", "", translated)


def _has_shared_username_chunk(username_token: str, password_token: str) -> bool:
    if len(username_token) < 4 or len(password_token) < 4:
        return False
    chunk_size = min(4, len(username_token), len(password_token))
    return any(
        username_token[index : index + chunk_size] in password_token
        for index in range(0, len(username_token) - chunk_size + 1)
    )


def _password_too_similar_to_username(username: str, password: str) -> bool:
    token_pairs = (
        (_normalize_similarity_token(username), _normalize_similarity_token(password)),
        (_canonicalize_similarity_token(username), _canonicalize_similarity_token(password)),
    )
    for username_token, password_token in token_pairs:
        if not username_token or not password_token:
            continue
        if username_token == password_token:
            return True
        if username_token in password_token or password_token in username_token:
            return True
        if _has_shared_username_chunk(username_token, password_token):
            return True
        similarity = SequenceMatcher(None, username_token, password_token).ratio()
        if similarity >= 0.72:
            return True
    return False


@auth_bp.route("/register", methods=["POST"])
@jwt_required()
@limiter.limit("10 per minute")
def register():
    """Register new user with PQC keypair and enhanced identity verification."""
    try:
        claims = get_jwt()
        creator_id = get_jwt_identity()
        if claims.get("role") != "admin":
            return jsonify({"error": "Admin role required to create users"}), 403

        data = request.get_json()
        required_fields = ("username", "email", "password", "role", "is_physically_verified", "aadhar_number")
        if not data or not all(k in data for k in required_fields):
            return jsonify({"error": "Missing required fields"}), 400

        if not data.get("is_physically_verified"):
             return jsonify({"error": "Physical verification confirmation is required"}), 400

        admin_user = User.query.get(creator_id)
        if not admin_user:
            return jsonify({"error": "Admin user not found"}), 404

        pqid_value = str(data.get("pqid") or data.get("admin_pqid") or "").strip()
        pqid_ok, pqid_error = verify_pqid(
            admin_user,
            pqid_value,
            required_message="PQID is required to approve user creation",
        )
        if not pqid_ok:
            _log_auth_event(
                creator_id,
                "user_registration",
                "failure",
                error_msg="pqid_verification_failed",
            )
            return pqid_error

        username = str(data.get("username", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        role = data.get("role")
        address = data.get("address", "")
        phone_number = data.get("phone_number", "")
        try:
            aadhar_number = normalize_aadhar_number(data.get("aadhar_number", ""))
        except ValueError:
            return jsonify({"error": "Aadhar number must contain exactly 12 digits"}), 400
        aadhar_hash = hash_aadhar_number(aadhar_number)

        # Role-specific fields
        designation = data.get("designation", "")
        court_details = data.get("court_details", "")
        station_name = data.get("station_name", "")
        enroll_webauthn = _bool_from_value(data.get("enroll_webauthn"), default=False)

        if role not in {"admin", "investigator", "court_user"}:
            return jsonify({"error": "Invalid role"}), 400

        # Validate role-specific requirements
        if role == "court_user" and not (designation and court_details and address):
             return jsonify({"error": "Missing court user details"}), 400
        if role == "investigator" and not (station_name and address):
             return jsonify({"error": "Missing investigator details"}), 400
        if role == "admin" and not address:
             return jsonify({"error": "Admin address required"}), 400

        if not re.fullmatch(r"[A-Za-z0-9_.-]{3,64}", username or ""):
            return jsonify(
                {
                    "error": "Invalid username format",
                    "hint": "Use 3-64 chars: letters, numbers, underscore, dot, hyphen",
                }
            ), 400

        if not validate_email(email):
            return jsonify({"error": "Invalid email format"}), 400

        if _password_too_similar_to_username(username, password):
            return jsonify(
                {
                    "error": "Password too similar to username",
                    "hint": "Password must be clearly different from the username, including close spellings and symbol substitutions.",
                }
            ), 400

        is_strong, requirements = validate_password_strength(password)
        if not is_strong:
            return jsonify(
                {
                    "error": "Weak password",
                    "requirements": requirements,
                    "hint": "Password must be 12+ chars and include upper, lower, digit, special char",
                }
            ), 400

        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 409
        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already exists"}), 409
        if User.query.filter_by(aadhar_hash=aadhar_hash).first():
            return jsonify({"error": "Aadhar number already registered"}), 409

        # Backward-compatibility: existing deployments may still have legacy rows
        # where aadhar_hash is null and aadhar_number is stored in older formats.
        legacy_users = (
            User.query.filter(User.aadhar_hash.is_(None), User.aadhar_number.isnot(None)).all()
        )
        for legacy_user in legacy_users:
            try:
                if normalize_aadhar_number(legacy_user.aadhar_number) == aadhar_number:
                    return jsonify({"error": "Aadhar number already registered"}), 409
            except ValueError:
                continue
        
        # Generate PQID
        pqid = _generate_pqid(username, password)
        # Ensure PQID uniqueness (unlikely collision but good practice in loop)
        while User.query.filter_by(pqid=pqid).first():
             pqid = _generate_pqid(username, password)

        kem_keypair = pqc_engine.generate_keypair("kex")
        sig_keypair = pqc_engine.generate_keypair("sig")
        
        user = User(
            username=username, 
            email=email, 
            role=role,
            address=address,
            phone_number=phone_number,
            pqid=pqid,
            is_physically_verified=True,
            aadhar_number=aadhar_number,
            aadhar_hash=aadhar_hash,
            designation=designation,
            court_details=court_details,
            station_name=station_name,
            is_active=True,
            webauthn_required=bool(enroll_webauthn),
        )
        user.set_password(password)
        user.pqc_kem_public_key = kem_keypair["public_key"]
        user.pqc_sig_public_key = sig_keypair["public_key"]
        user.pqc_public_key = sig_keypair["public_key"]
        user.pqc_kem_algorithm = kem_keypair.get("algorithm")
        user.pqc_sig_algorithm = sig_keypair.get("algorithm")

        # Reuse signature public key for legacy challenge endpoint compatibility.
        user.client_auth_sig_public_key = user.pqc_sig_public_key

        db.session.add(user)
        db.session.flush()
        user.set_private_keys(
            kem_secret_key=kem_keypair["secret_key"],
            sig_secret_key=sig_keypair["secret_key"],
            legacy_secret_key=sig_keypair["secret_key"],
        )
        db.session.commit()

        _log_auth_event(
            creator_id,
            "user_registration",
            "success",
            {
                "username": user.username,
                "created_user_id": user.id,
                "pqid": pqid,
                "aadhar_ref": masked_aadhar(aadhar_number),
            },
        )

        if enroll_webauthn:
            return _build_webauthn_login_response(user, flow="enroll")

        return (
            jsonify({"message": "User registered successfully", "user": user.to_dict(), "pqid": pqid}),
            201,
        )
    except IntegrityError:
        db.session.rollback()
        _log_auth_event(
            creator_id if "creator_id" in locals() else None,
            "user_registration",
            "failure",
            error_msg="registration_conflict",
        )
        return jsonify({"error": "User with provided details already exists"}), 409
    except Exception as exc:
        db.session.rollback()
        _log_auth_event(
            creator_id if "creator_id" in locals() else None,
            "user_registration",
            "failure",
            details={"error_type": type(exc).__name__},
            error_msg="registration_internal_error",
        )
        return jsonify({"error": "Registration failed due to an internal error"}), 500


# ---------- legacy challenge endpoint (kept) ----------
@auth_bp.route("/login-challenge", methods=["POST"])
@limiter.limit(lambda: current_app.config.get("RATELIMIT_LOGIN_CHALLENGE", "10 per minute"))
def login_challenge():
    """Legacy PQC challenge endpoint kept for compatibility."""
    try:
        data = request.get_json() or {}
        username = data.get("username")
        if not username:
            return jsonify({"error": "Username required"}), 400

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        challenge = secrets.token_hex(32)
        user.current_challenge = challenge
        user.current_challenge_expires_at = _utcnow() + timedelta(
            seconds=current_app.config.get("CHALLENGE_TTL_SECONDS", 300)
        )
        db.session.commit()

        return jsonify(
            {
                "challenge": challenge,
                "user_id": user.id,
                "user_public_key": user.get_auth_sig_public_key(),
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@auth_bp.route("/login-verify", methods=["POST"])
@limiter.limit(lambda: current_app.config.get("RATELIMIT_LOGIN_VERIFY", "10 per minute"))
def login_verify():
    """Username/password login endpoint."""
    try:
        data = request.get_json() or {}
        username = data.get("username")
        password = data.get("password")

        if not all([username, password]):
            return jsonify({"error": "Missing required fields"}), 400

        # Login with Username
        user = User.query.filter(User.username == username).first()

        if not user or not user.check_password(password):
            _log_auth_event(None, "login_attempt", "failure", {"username": username, "reason": "invalid_credentials"})
            return jsonify({"error": "Invalid credentials"}), 401

        if not user.is_active:
            _log_auth_event(user.id, "login_attempt", "failure", {"reason": "user_inactive"})
            return jsonify({"error": "Invalid credentials"}), 401

        lockout_response = enforce_pqid_lockout(user)
        if lockout_response:
            _log_auth_event(user.id, "login_attempt", "failure", {"reason": "pqid_locked"})
            return lockout_response

        if _should_require_webauthn(user):
            return _build_webauthn_login_response(user, flow="login")

        return _build_auth_response(user, login_method="password")
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@auth_bp.route("/login-pqid", methods=["POST"])
@limiter.limit(lambda: current_app.config.get("RATELIMIT_LOGIN_VERIFY", "10 per minute"))
def login_pqid():
    """Complete PQID verification after username/password."""
    try:
        data = request.get_json() or {}
        raw_token = data.get("login_token")

        if not raw_token:
            return jsonify({"error": "Missing PQID verification data"}), 400

        token_payload = _parse_pqid_login_token(raw_token)
        if not token_payload:
            return jsonify({"error": "Invalid or expired PQID session"}), 401

        user_id = token_payload.get("sub")
        if not user_id:
            return jsonify({"error": "Invalid PQID session"}), 401

        user = User.query.get(user_id)
        if not user or not user.is_active:
            return jsonify({"error": "Invalid user"}), 401

        if is_pqid_bypass_user(user):
            _log_auth_event(user.id, "pqid_verify", "success", {"bypass": True})
            return _build_auth_response(user, login_method="pqid"), 200

        pqid = str(data.get("pqid", "")).strip()
        if not pqid:
            return jsonify({"error": "Missing PQID verification data"}), 400

        pqid_ok, pqid_error = verify_pqid(user, pqid, required_message="Missing PQID verification data")
        if not pqid_ok:
            _log_auth_event(user.id, "pqid_verify", "failure")
            return pqid_error

        _log_auth_event(user.id, "pqid_verify", "success")
        return _build_auth_response(user, login_method="pqid"), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@auth_bp.route("/webauthn/verify", methods=["POST"])
@limiter.limit(lambda: current_app.config.get("RATELIMIT_LOGIN_VERIFY", "10 per minute"))
def webauthn_verify():
    """Complete WebAuthn registration/authentication for a pending login."""
    data = request.get_json() or {}
    raw_token = data.get("login_token")
    credential = data.get("credential")
    if not raw_token or not credential:
        return jsonify({"error": "Missing WebAuthn verification data"}), 400

    token_payload = _parse_webauthn_login_token(raw_token)
    if not token_payload:
        return jsonify({"error": "Invalid or expired WebAuthn session"}), 401

    user_id = token_payload.get("sub")
    stage = token_payload.get("webauthn_stage")
    flow = token_payload.get("webauthn_flow", "login")
    challenge_b64 = token_payload.get("webauthn_challenge")
    if not user_id or not stage or not challenge_b64:
        return jsonify({"error": "Invalid WebAuthn session payload"}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Invalid user"}), 401
    if not user.is_active and flow != "enroll":
        return jsonify({"error": "Invalid user"}), 401

    lockout_response = enforce_pqid_lockout(user)
    if lockout_response and flow != "enroll":
        _log_auth_event(user.id, "webauthn_verify", "failure", {"reason": "pqid_locked"})
        return lockout_response

    if not user.webauthn_required and flow == "enroll":
        return jsonify({"error": "WebAuthn not enabled for this user"}), 400

    rp_id, _, origin, _ = _webauthn_rp_config()
    expected_challenge = base64url_to_bytes(challenge_b64)

    try:
        if stage == "register":
            verified = verify_registration_response(
                credential=credential,
                expected_challenge=expected_challenge,
                expected_rp_id=rp_id,
                expected_origin=origin,
                require_user_verification=True,
            )
            credential_id = bytes_to_base64url(verified.credential_id)
            existing = WebAuthnCredential.query.filter_by(credential_id=credential_id).first()
            if existing:
                return jsonify({"error": "Credential already registered"}), 409

            transports = None
            if isinstance(credential, dict):
                transports = credential.get("transports")
                if transports is not None:
                    transports = json.dumps(transports)

            db.session.add(
                WebAuthnCredential(
                    user_id=user.id,
                    credential_id=credential_id,
                    public_key=bytes_to_base64url(verified.credential_public_key),
                    sign_count=verified.sign_count,
                    transports=transports,
                    device_type=getattr(verified.credential_device_type, "value", None),
                    backed_up=verified.credential_backed_up,
                    fmt=getattr(verified.fmt, "value", None),
                    aaguid=verified.aaguid,
                )
            )
            if not user.webauthn_required:
                user.webauthn_required = True
            user.webauthn_enrolled_at = _utcnow()
            if flow == "enroll" and not user.is_active:
                user.is_active = True
            db.session.commit()
            _log_auth_event(
                user.id,
                "webauthn_register",
                "success",
                {"stage": "register", "flow": flow},
            )
            if flow == "enroll":
                return (
                    jsonify(
                        {
                            "message": "Passkey registered successfully",
                            "user": user.to_dict(),
                        }
                    ),
                    200,
                )
            return _build_auth_response(user, login_method="webauthn"), 200

        if stage == "authenticate":
            parsed = parse_authentication_credential_json(credential)
            credential_id = bytes_to_base64url(parsed.raw_id)
            record = (
                WebAuthnCredential.query.filter_by(
                    user_id=user.id, credential_id=credential_id, is_active=True
                )
                .order_by(WebAuthnCredential.id.asc())
                .first()
            )
            if not record:
                return jsonify({"error": "Credential not recognized"}), 401

            verified = verify_authentication_response(
                credential=parsed,
                expected_challenge=expected_challenge,
                expected_rp_id=rp_id,
                expected_origin=origin,
                credential_public_key=base64url_to_bytes(record.public_key),
                credential_current_sign_count=record.sign_count or 0,
                require_user_verification=True,
            )
            record.sign_count = verified.new_sign_count
            record.last_used_at = _utcnow()
            record.device_type = getattr(verified.credential_device_type, "value", record.device_type)
            record.backed_up = verified.credential_backed_up
            if not user.webauthn_required:
                user.webauthn_required = True
            db.session.commit()
            _log_auth_event(
                user.id,
                "webauthn_auth",
                "success",
                {"stage": "authenticate", "flow": flow},
            )
            if flow == "enroll":
                return (
                    jsonify(
                        {
                            "message": "Passkey verified successfully",
                            "user": user.to_dict(),
                        }
                    ),
                    200,
                )
            return _build_auth_response(user, login_method="webauthn"), 200

        return jsonify({"error": "Invalid WebAuthn stage"}), 400
    except Exception as exc:
        db.session.rollback()
        _log_auth_event(
            user.id,
            "webauthn_auth",
            "failure",
            details={"stage": stage, "error_type": type(exc).__name__},
            error_msg=str(exc),
        )
        return jsonify({"error": "WebAuthn verification failed"}), 401


@auth_bp.route("/refresh", methods=["POST"])
@limiter.limit(lambda: current_app.config.get("RATELIMIT_LOGIN_VERIFY", "10 per minute"))
@jwt_required(refresh=True, locations=["cookies"])
def refresh():
    """Rotate refresh token and issue new short-lived access token."""
    try:
        user_id = get_jwt_identity()
        claims = get_jwt()
        refresh_jti = claims.get("jti")
        if not refresh_jti:
            response = jsonify({"error": "Invalid refresh token"})
            unset_jwt_cookies(response)
            return response, 401

        jti_hash = _hash_jti(refresh_jti)
        session = RefreshToken.query.filter_by(jti_hash=jti_hash, user_id=user_id).first()
        if not session:
            _log_auth_event(user_id, "token_refresh", "failure", {"reason": "session_not_found"})
            response = jsonify({"error": "Refresh session not found"})
            unset_jwt_cookies(response)
            return response, 401

        if session.revoked_at or session.expires_at < _utcnow():
            _log_auth_event(user_id, "token_refresh", "failure", {"reason": "session_revoked_or_expired"})
            response = jsonify({"error": "Refresh session invalid"})
            unset_jwt_cookies(response)
            return response, 401

        user = User.query.get(user_id)
        if not user or not user.is_active:
            _log_auth_event(user_id, "token_refresh", "failure", {"reason": "user_inactive_or_missing"})
            response = jsonify({"error": "Invalid user"})
            unset_jwt_cookies(response)
            return response, 401

        return _build_auth_response(
            user,
            existing_refresh_jti_hash=jti_hash,
            log_login=False,
        ), 200
    except Exception as exc:
        db.session.rollback()
        response = jsonify({"error": str(exc)})
        unset_jwt_cookies(response)
        return response, 401


@auth_bp.route("/verify-token", methods=["GET"])
@jwt_required()
def verify_token():
    """Verify JWT token validity."""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"valid": True, "user": user.to_dict()}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 401


@auth_bp.route("/presence", methods=["GET"])
@jwt_required()
def presence():
    """Lightweight heartbeat endpoint used for live activity status."""
    return jsonify({"status": "ok"}), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Logout endpoint for audit logging."""
    try:
        user_id = get_jwt_identity()
        refresh_cookie_name = current_app.config.get("JWT_REFRESH_COOKIE_NAME", "refresh_token_cookie")
        refresh_raw = request.cookies.get(refresh_cookie_name)
        if refresh_raw:
            _revoke_refresh_by_raw_token(refresh_raw)
            db.session.commit()

        _log_auth_event(user_id, "logout", "success")
        response = jsonify({"message": "Logged out successfully"})
        unset_jwt_cookies(response)
        return response, 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
