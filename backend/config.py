"""Application configuration for development, testing, and production."""

import os
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DEFAULT_STORAGE_ROOT = os.path.join(BASE_DIR, "storage")


def _to_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_list(value, default=None):
    if value is None:
        return default or []
    return [item.strip() for item in value.split(",") if item.strip()]


class Config:
    """Base configuration."""

    DEBUG = False
    TESTING = False

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///pqc_evidence_dev.db")
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": _to_int(os.getenv("DB_POOL_RECYCLE"), 1800),
    }

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-key")
    AADHAR_HASH_PEPPER = os.getenv("AADHAR_HASH_PEPPER", SECRET_KEY)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=_to_int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES"), 60)
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=_to_int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS"), 7)
    )
    JWT_TOKEN_LOCATION = ["headers", "cookies"]
    JWT_COOKIE_SECURE = _to_bool(os.getenv("JWT_COOKIE_SECURE"), False)
    JWT_COOKIE_SAMESITE = os.getenv("JWT_COOKIE_SAMESITE", "Lax")
    JWT_COOKIE_CSRF_PROTECT = _to_bool(os.getenv("JWT_COOKIE_CSRF_PROTECT"), False)
    JWT_REFRESH_COOKIE_PATH = "/api/auth/refresh"

    MAX_CONTENT_LENGTH = _to_int(os.getenv("MAX_CONTENT_LENGTH"), 500 * 1024 * 1024)
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", os.path.join(DEFAULT_STORAGE_ROOT, "evidence"))
    CASE_BOOK_UPLOAD_FOLDER = os.getenv("CASE_BOOK_UPLOAD_FOLDER", os.path.join(DEFAULT_STORAGE_ROOT, "case_books"))

    CORS_ORIGINS = _to_list(os.getenv("CORS_ORIGINS"), ["http://localhost:5173"])

    CHALLENGE_TTL_SECONDS = _to_int(os.getenv("CHALLENGE_TTL_SECONDS"), 300)
    SERVER_GENERATES_CLIENT_AUTH_SECRET = _to_bool(
        os.getenv("SERVER_GENERATES_CLIENT_AUTH_SECRET"), True
    )

    WEBAUTHN_RP_ID = os.getenv("WEBAUTHN_RP_ID", "")
    WEBAUTHN_RP_NAME = os.getenv("WEBAUTHN_RP_NAME", "PQC Evidence Vault")
    WEBAUTHN_ORIGIN = os.getenv("WEBAUTHN_ORIGIN", "http://localhost:5173")
    WEBAUTHN_TIMEOUT_MS = _to_int(os.getenv("WEBAUTHN_TIMEOUT_MS"), 60000)
    WEBAUTHN_CHALLENGE_TTL_SECONDS = _to_int(
        os.getenv("WEBAUTHN_CHALLENGE_TTL_SECONDS"), 300
    )
    WEBAUTHN_LOGIN_REQUIRED = _to_bool(
        os.getenv("WEBAUTHN_LOGIN_REQUIRED"), True
    )

    RATELIMIT_ENABLED = _to_bool(os.getenv("RATELIMIT_ENABLED"), True)
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "300 per hour")
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_STRATEGY = os.getenv("RATELIMIT_STRATEGY", "fixed-window")
    RATELIMIT_LOGIN_CHALLENGE = os.getenv("RATELIMIT_LOGIN_CHALLENGE", "10 per minute")
    RATELIMIT_LOGIN_VERIFY = os.getenv("RATELIMIT_LOGIN_VERIFY", "10 per minute")
    RATELIMIT_EVIDENCE_UPLOAD = os.getenv("RATELIMIT_EVIDENCE_UPLOAD", "60 per hour")
    RATELIMIT_CASE_BOOK_UPLOAD = os.getenv("RATELIMIT_CASE_BOOK_UPLOAD", "60 per hour")
    RATELIMIT_EVIDENCE_GET = os.getenv("RATELIMIT_EVIDENCE_GET", "300 per hour")

    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_DIR = os.getenv("LOG_DIR", "logs")

    # If false, do not run db.create_all at app startup.
    AUTO_CREATE_DB = _to_bool(os.getenv("AUTO_CREATE_DB"), False)

    # Security headers controls.
    FORCE_HTTPS_HEADERS = _to_bool(os.getenv("FORCE_HTTPS_HEADERS"), True)
    DEV_LOGIN_ALLOW_CHALLENGE_ECHO = _to_bool(
        os.getenv("DEV_LOGIN_ALLOW_CHALLENGE_ECHO"), False
    )
    HEARTBEAT_ENABLED = _to_bool(os.getenv("HEARTBEAT_ENABLED"), True)
    HEARTBEAT_INTERVAL_SECONDS = _to_int(os.getenv("HEARTBEAT_INTERVAL_SECONDS"), 30)

    @staticmethod
    def validate():
        """Base validation hook."""
        return


class DevelopmentConfig(Config):
    """Development configuration."""

    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///pqc_evidence_dev.db")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-key")
    AUTO_CREATE_DB = _to_bool(os.getenv("AUTO_CREATE_DB"), True)
    FORCE_HTTPS_HEADERS = False
    DEV_LOGIN_ALLOW_CHALLENGE_ECHO = _to_bool(
        os.getenv("DEV_LOGIN_ALLOW_CHALLENGE_ECHO"), True
    )


class ProductionConfig(Config):
    """Production configuration."""

    DEBUG = False
    TESTING = False
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Strict"
    SERVER_GENERATES_CLIENT_AUTH_SECRET = _to_bool(
        os.getenv("SERVER_GENERATES_CLIENT_AUTH_SECRET"), False
    )

    @staticmethod
    def validate():
        required = ["DATABASE_URL", "SECRET_KEY", "JWT_SECRET_KEY"]
        missing = [name for name in required if not os.getenv(name)]
        if missing:
            raise RuntimeError(
                f"Missing required environment variables for production: {', '.join(missing)}"
            )

        if os.getenv("PQC_ALLOW_INSECURE_FALLBACK", "").strip().lower() == "true":
            raise RuntimeError(
                "PQC_ALLOW_INSECURE_FALLBACK=true is not allowed in production."
            )

        if _to_bool(os.getenv("RATELIMIT_ENABLED"), True) and not os.getenv(
            "RATELIMIT_STORAGE_URI"
        ):
            raise RuntimeError(
                "RATELIMIT_STORAGE_URI must be set in production when rate limiting is enabled."
            )


class TestingConfig(Config):
    """Testing configuration."""

    DEBUG = True
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SECRET_KEY = "test-secret-key"
    JWT_SECRET_KEY = "test-jwt-secret-key"
    AADHAR_HASH_PEPPER = "test-aadhar-pepper"
    AUTO_CREATE_DB = True
    RATELIMIT_ENABLED = False
    FORCE_HTTPS_HEADERS = False


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
