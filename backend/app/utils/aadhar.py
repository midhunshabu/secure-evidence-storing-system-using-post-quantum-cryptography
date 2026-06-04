"""Aadhar normalization and hashing utilities."""

import hashlib
import hmac
import re

from flask import current_app


def _aadhar_hash_pepper() -> str:
    """Resolve the pepper used to hash Aadhar numbers."""
    return (
        str(current_app.config.get("AADHAR_HASH_PEPPER", "")).strip()
        or str(current_app.config.get("SECRET_KEY", "")).strip()
        or str(current_app.config.get("JWT_SECRET_KEY", "")).strip()
        or "dev-aadhar-pepper"
    )


def normalize_aadhar_number(raw_value) -> str:
    """Normalize and validate a raw Aadhar number string."""
    digits_only = re.sub(r"\D", "", str(raw_value or ""))
    if len(digits_only) != 12:
        raise ValueError("invalid_aadhar_format")
    return digits_only


def hash_aadhar_number(normalized_aadhar: str) -> str:
    """Hash a normalized Aadhar number using a pepper."""
    pepper = _aadhar_hash_pepper().encode("utf-8")
    return hmac.new(pepper, normalized_aadhar.encode("utf-8"), hashlib.sha256).hexdigest()


def masked_aadhar(normalized_aadhar: str) -> str:
    """Return a masked Aadhar representation for display."""
    return f"XXXX-XXXX-{normalized_aadhar[-4:]}"
