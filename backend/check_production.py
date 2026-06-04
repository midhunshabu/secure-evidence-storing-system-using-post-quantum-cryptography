"""Preflight checks for production deployment."""

import os
import sys

from dotenv import load_dotenv
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(__file__))
load_dotenv()

from app import create_app, db  # noqa: E402
from app.modules.pqc_engine import HAS_OQS, pqc_engine  # noqa: E402


def main():
    app = create_app("production")

    failures = []
    with app.app_context():
        try:
            db.session.execute(text("SELECT 1"))
        except Exception as exc:
            failures.append(f"Database connectivity failed: {exc}")

    if not HAS_OQS:
        failures.append("liboqs/oqs-python not available")

    if os.getenv("PQC_ALLOW_INSECURE_FALLBACK", "").lower() == "true":
        failures.append("PQC_ALLOW_INSECURE_FALLBACK must be false in production")

    print(f"KEM algorithm: {pqc_engine.kex_algorithm}")
    print(f"SIG algorithm: {pqc_engine.sig_algorithm}")

    if failures:
        print("Production preflight failed:")
        for issue in failures:
            print(f" - {issue}")
        sys.exit(1)

    print("Production preflight passed.")


if __name__ == "__main__":
    main()
