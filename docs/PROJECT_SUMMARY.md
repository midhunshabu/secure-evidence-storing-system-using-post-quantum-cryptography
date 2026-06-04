# Project Summary

## What This System Is

A post-quantum digital evidence platform that combines:
- secure evidence encryption/storage
- role-based access control
- admin-managed onboarding
- custody and audit integrity tracking

## Upgraded Capabilities (Current)

- Admin-only user registration with identity fields and Aadhar hashing
- Login via username or generated `pqid`
- JWT access tokens + refresh token rotation via cookie
- Evidence approval workflow (`pending`, `approved`, `rejected`)
- Admin health timelines powered by heartbeat telemetry
- Hash-chain secured audit logs for tamper visibility
- Sensitive-field encryption at ORM layer
- Private key vault outside DB rows

## Core Roles

- `admin`: full user management, evidence approval/rejection, audit and system oversight
- `investigator`: upload/manage own evidence and submit evidence for court visibility
- `court_user`: read-only access to court-accessible evidence

## Main Components

- Backend API: `backend/app/routes/`
- Data models: `backend/app/models/`
- PQC/encryption engine: `backend/app/modules/pqc_engine.py`
- Encrypted key vault: `backend/app/security/key_vault.py`
- React UI: `react-app/src/`

## Operational Scripts

- `backend/migrate_db.py` - schema/data migration hardening
- `backend/init_db.py` - default admin bootstrap
- `backend/setup_demo.py` - optional demo data
- `backend/check_production.py` - production preflight validation

## Deployment Shape

- Dev: Flask on `:5000`, Vite on `:5173`
- Prod: React built to `backend/static`, served by Flask/Gunicorn behind reverse proxy

## Documentation Map

- `README.md` - quick start
- `API_DOCUMENTATION.md` - endpoint contracts
- `ARCHITECTURE.md` - technical design
- `DEPLOYMENT.md` - production setup
- `TESTING.md` - smoke/regression guidance
- `REACT_SETUP.md` - frontend setup
