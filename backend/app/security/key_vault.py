"""Encrypted local key vault for user private keys.

This keeps private keys out of database rows. Keys are encrypted at rest
using a master key and stored in per-user files.
"""

import base64
import hashlib
import json
import os
from datetime import datetime

from cryptography.fernet import Fernet, InvalidToken


def _derive_fernet_key() -> bytes:
    explicit = os.getenv("KEY_VAULT_MASTER_KEY") or os.getenv("APP_DATA_ENCRYPTION_KEY")
    if explicit:
        try:
            Fernet(explicit.encode("utf-8"))
            return explicit.encode("utf-8")
        except Exception:
            pass

    # Dev fallback only: derive from JWT secret so app still runs locally.
    seed = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY") or "dev-key-vault-seed"
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet() -> Fernet:
    return Fernet(_derive_fernet_key())


def _vault_dir() -> str:
    path = os.getenv("KEY_VAULT_DIR", "secure/key_vault")
    os.makedirs(path, exist_ok=True)
    return path


def _user_path(user_id: int) -> str:
    return os.path.join(_vault_dir(), f"user_{user_id}.json.enc")


def save_user_keys(user_id: int, keys: dict):
    """Persist encrypted key bundle for a user."""
    payload = {
        "user_id": user_id,
        "updated_at": datetime.utcnow().isoformat(),
        "keys": keys,
    }
    token = _fernet().encrypt(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    file_path = _user_path(user_id)
    with open(file_path, "wb") as f:
        f.write(token)
    os.chmod(file_path, 0o600)


def load_user_keys(user_id: int) -> dict:
    """Load and decrypt user keys. Returns empty dict if missing/unreadable."""
    file_path = _user_path(user_id)
    if not os.path.exists(file_path):
        return {}
    try:
        with open(file_path, "rb") as f:
            token = f.read()
        raw = _fernet().decrypt(token)
        data = json.loads(raw.decode("utf-8"))
        return data.get("keys", {}) or {}
    except (InvalidToken, OSError, ValueError, json.JSONDecodeError):
        return {}


def get_user_key(user_id: int, key_name: str):
    """Read one key value from the encrypted vault."""
    return load_user_keys(user_id).get(key_name)
