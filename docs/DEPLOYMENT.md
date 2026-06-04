# Deployment Guide

## 1. Production Requirements

- Python 3.10+
- Node.js 18+
- PostgreSQL (recommended)
- `liboqs` + `oqs-python` installed and working
- Reverse proxy (Nginx/Apache)

Do not run production with `PQC_ALLOW_INSECURE_FALLBACK=true`.

## 2. Backend Installation

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 3. Environment Configuration

Start from `backend/.env.example`:

```bash
cp .env.example .env
```

Set production-critical values:
- `APP_ENV=production`
- `DATABASE_URL=postgresql://...`
- `SECRET_KEY=<strong random>`
- `JWT_SECRET_KEY=<strong random>`
- `AADHAR_HASH_PEPPER=<strong random>`
- `APP_DATA_ENCRYPTION_KEY=<fernet key>`
- `KEY_VAULT_MASTER_KEY=<fernet key>`
- `KEY_VAULT_DIR=/secure/path/key_vault`
- `PQC_ALLOW_INSECURE_FALLBACK=false`
- `SERVER_GENERATES_CLIENT_AUTH_SECRET=false`
- `RATELIMIT_STORAGE_URI=<redis://... or other shared store>`
- `CORS_ORIGINS=https://your-domain.example`
- `FORCE_HTTPS_HEADERS=true`

Generate Fernet keys:

```bash
python - <<'PY'
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
PY
```

Use two different generated keys for:
- `APP_DATA_ENCRYPTION_KEY`
- `KEY_VAULT_MASTER_KEY`

## 4. Database Migration

Run idempotent migration after each backend upgrade:

```bash
python migrate_db.py
```

Optional bootstrap admin on empty installs:

```bash
python init_db.py
```

## 5. Preflight Validation

```bash
python check_production.py
```

This verifies:
- DB connectivity
- OQS availability
- fallback disabled

## 6. Frontend Build

```bash
cd ../react-app
npm install
npm run build
```

Build output goes to `backend/static/`.

## 7. Run with Gunicorn

From `backend/`:

```bash
gunicorn --config gunicorn.conf.py wsgi:app
```

Useful env overrides:
- `GUNICORN_BIND` (default `0.0.0.0:8000`)
- `GUNICORN_WORKERS`
- `GUNICORN_THREADS`
- `GUNICORN_TIMEOUT`

## 8. Reverse Proxy (Nginx Example)

Minimal pattern:
- Route `/api` and app paths to Gunicorn upstream
- Preserve headers: `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`
- Enable HTTPS and HSTS

Example upstream target: `127.0.0.1:8000`

## 9. Storage and Permissions

Create and lock down:
- evidence storage directory (`UPLOAD_FOLDER`)
- key-vault directory (`KEY_VAULT_DIR`)
- log directory (`LOG_DIR`)

Recommended permissions:
- owned by service user
- no world read access
- key-vault files mode `600`

## 10. Post-Deploy Smoke Checks

1. `GET /api/healthz` returns `{"status":"ok"}`
2. Admin login works (`POST /api/auth/login-verify`)
3. Refresh works (`POST /api/auth/refresh` with cookie)
4. Evidence upload and approval workflow completes
5. Admin audit log query returns `chain_status` values

## 11. Upgrade Checklist

For every upgrade:
1. Pull new code
2. Install/upgrade dependencies
3. Run `python migrate_db.py`
4. Build frontend `npm run build`
5. Run `python check_production.py`
6. Restart Gunicorn
7. Run smoke checks
