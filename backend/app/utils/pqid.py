"""PQID verification and lockout helpers."""

from datetime import datetime, timedelta

from flask import jsonify

from app import db

LOCKOUT_THRESHOLD = 3
LOCKOUT_DURATION_HOURS = 24


def _utcnow():
    return datetime.utcnow()


def is_pqid_bypass_user(user):
    return False


def _clear_pqid_lockout(user):
    if not user:
        return
    if user.pqid_failed_attempts or user.pqid_locked_until:
        user.pqid_failed_attempts = 0
        user.pqid_locked_until = None
        db.session.commit()


def _lockout_payload(user, message):
    locked_until = user.pqid_locked_until.isoformat() if user and user.pqid_locked_until else None
    return jsonify({
        "error": message,
        "lockout": True,
        "locked_until": locked_until,
    }), 423


def is_pqid_locked(user, now=None):
    if not user:
        return False
    locked_until = user.pqid_locked_until
    if not locked_until:
        return False
    now_value = now or _utcnow()
    return locked_until > now_value


def enforce_pqid_lockout(user):
    """Return a lockout response tuple if the user is currently locked."""
    if is_pqid_bypass_user(user):
        _clear_pqid_lockout(user)
        return None
    if user and user.pqid_locked_until and user.pqid_locked_until <= _utcnow():
        user.pqid_locked_until = None
        user.pqid_failed_attempts = 0
        db.session.commit()
    if is_pqid_locked(user):
        return _lockout_payload(
            user,
            "PQID locked for 24 hours due to multiple failed attempts.",
        )
    return None


def verify_pqid(user, provided_pqid, required_message="PQID is required"):
    """Validate PQID, track failed attempts, and lock out after 3 failures."""
    if not user:
        return False, (jsonify({"error": "User not found"}), 404)

    if is_pqid_bypass_user(user):
        _clear_pqid_lockout(user)
        return True, None

    lockout_response = enforce_pqid_lockout(user)
    if lockout_response:
        return False, lockout_response

    pqid = str(provided_pqid or "").strip()
    if not pqid:
        return False, (jsonify({"error": required_message}), 400)

    stored_pqid = str(user.pqid or "").strip()
    if not stored_pqid:
        return False, (jsonify({"error": "PQID not set for this user. Contact admin."}), 403)

    if stored_pqid.lower() != pqid.lower():
        user.pqid_failed_attempts = int(user.pqid_failed_attempts or 0) + 1
        if user.pqid_failed_attempts >= LOCKOUT_THRESHOLD:
            user.pqid_locked_until = _utcnow() + timedelta(hours=LOCKOUT_DURATION_HOURS)
            db.session.commit()
            return False, _lockout_payload(
                user,
                "PQID locked for 24 hours due to multiple failed attempts.",
            )
        db.session.commit()
        attempts_left = max(0, LOCKOUT_THRESHOLD - int(user.pqid_failed_attempts or 0))
        return False, (
            jsonify({
                "error": "pqid not correct enter the correct one",
                "attempts_remaining": attempts_left,
            }),
            401,
        )

    if user.pqid_failed_attempts or user.pqid_locked_until:
        user.pqid_failed_attempts = 0
        user.pqid_locked_until = None
        db.session.commit()

    return True, None
