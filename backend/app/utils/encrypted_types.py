"""SQLAlchemy encrypted text type for sensitive columns."""

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import Text, TypeDecorator


def _derive_data_key() -> bytes:
    explicit = os.getenv("APP_DATA_ENCRYPTION_KEY")
    if explicit:
        try:
            Fernet(explicit.encode("utf-8"))
            return explicit.encode("utf-8")
        except Exception:
            pass

    # Dev fallback for local use. In production set APP_DATA_ENCRYPTION_KEY.
    seed = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY") or "dev-data-encryption-seed"
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


class EncryptedText(TypeDecorator):
    """Encrypt/decrypt text transparently in ORM columns."""

    impl = Text
    cache_ok = True
    _prefix = "enc::"

    @staticmethod
    def _cipher() -> Fernet:
        return Fernet(_derive_data_key())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        plain = str(value)
        if plain.startswith(self._prefix):
            return plain
        token = self._cipher().encrypt(plain.encode("utf-8")).decode("utf-8")
        return f"{self._prefix}{token}"

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        raw = str(value)
        if not raw.startswith(self._prefix):
            return raw
        token = raw[len(self._prefix) :]
        try:
            return self._cipher().decrypt(token.encode("utf-8")).decode("utf-8")
        except (InvalidToken, ValueError):
            return raw
