# PQC Evidence Storing System

Post-quantum evidence management platform with:
- Flask backend API (`backend/`)
- React + Vite frontend (`react-app/`)
- Encrypted evidence storage + chain-of-custody tracking
- Admin-controlled identity provisioning and audit logging

## Current Upgrade State (as of 2026-02-18)

This repository now runs the upgraded stack:
- Admin-only user provisioning (`POST /api/auth/register` requires admin JWT)
- Username or `pqid` login (`POST /api/auth/login-verify`)
- Refresh-token rotation via HttpOnly cookie (`POST /api/auth/refresh`)
- Evidence approval workflow (`/api/admin/evidence/*`)
- Audit-log hash chain integrity fields (`prev_hash`, `current_hash`)
- System heartbeat telemetry (`system_heartbeats`)
- Encrypted sensitive DB columns and encrypted key vault files

## Tech Stack

- Backend: Flask 2.3, SQLAlchemy, Flask-JWT-Extended, Flask-Limiter
- Crypto: liboqs (preferred), AES-256-GCM, HKDF-SHA256
- Frontend: React 18, Vite, Axios, React Router
- Database: SQLite (dev) or PostgreSQL (prod)

## Prerequisites

- Python 3.10+
- Node.js 18+
- `liboqs` + `oqs-python` for real PQC mode

If `liboqs` is not available for local development, you can temporarily set:
- `PQC_ALLOW_INSECURE_FALLBACK=true`

Do not use insecure fallback in production.

## Quick Start (Development)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Generate strong Fernet keys for encrypted data/key vault:

```bash
python - <<'PY'
from cryptography.fernet import Fernet
print('APP_DATA_ENCRYPTION_KEY=' + Fernet.generate_key().decode())
print('KEY_VAULT_MASTER_KEY=' + Fernet.generate_key().decode())
PY
```

Add those values to `backend/.env`.

Initialize/upgrade schema and seed admin:

```bash
python migrate_db.py
python init_db.py
```

Start backend:

```bash
python run.py
```

API + built SPA are served at `http://localhost:5000`.

### 2. Frontend (React dev server)

```bash
cd react-app
npm install
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to backend `http://localhost:5000`.

### 3. Build frontend into Flask static assets

```bash
cd react-app
npm run build
```

Build output is written to `backend/static/`.

## Initial Database

`python init_db.py` creates empty database tables only. Create the first
administrator through your chosen production provisioning flow.

## Core API Surface

- Auth: `/api/auth/*`
- Evidence: `/api/evidence/*`
- Admin: `/api/admin/*`
- Health: `GET /api/healthz`

Full request/response details are in `API_DOCUMENTATION.md`.

## Key Directories

- `backend/app/routes/` - API routes
- `backend/app/models/` - DB models
- `backend/app/modules/pqc_engine.py` - PQC + encryption engine
- `backend/app/security/key_vault.py` - encrypted private key storage
- `react-app/src/` - React application
- `backend/static/` - production frontend build output

## Legacy Frontend

`frontend/` contains an older static UI. The actively maintained client is `react-app/`.

## Documentation

- `INDEX.md` - documentation map
- `ARCHITECTURE.md` - current architecture and data flow
- `API_DOCUMENTATION.md` - endpoint reference
- `DEPLOYMENT.md` - production setup
- `TESTING.md` - smoke/regression testing guidance
- `REACT_SETUP.md` - frontend setup details
