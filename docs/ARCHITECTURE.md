# Architecture Documentation

## System Overview

The system is a Flask API plus React SPA with post-quantum cryptography for evidence custody.

Runtime components:
- React client (`react-app`) for login, evidence, and admin console
- Flask application (`backend/app`) exposing `/api/*`
- SQLite/PostgreSQL persistence through SQLAlchemy
- File-system encrypted evidence store (`UPLOAD_FOLDER`)
- Encrypted key vault files for user private keys (`KEY_VAULT_DIR`)

## High-Level Flow

1. User authenticates using `POST /api/auth/login-verify` (username or `pqid` + password).
2. Access token is returned; refresh token is set in secure cookie.
3. Investigator/admin uploads evidence.
4. Backend encapsulates shared secret with uploader KEM public key, derives AES key, encrypts file, signs metadata.
5. Evidence row + custody records + audit logs are persisted.
6. Admin approves or denies evidence via admin workflow endpoints.
7. Court users access only `access_level = court` evidence.

## Backend Modules

- `backend/app/__init__.py`: app factory, extensions, CORS, security headers, request audit hook, SPA static serving, heartbeat thread
- `backend/app/routes/auth.py`: auth/login/refresh/logout + admin-only registration
- `backend/app/routes/evidence.py`: upload, list, retrieve/verify, custody chain, submit-to-court
- `backend/app/routes/admin.py`: overview metrics, health timelines, approval queue/actions, user management, audit logs
- `backend/app/modules/pqc_engine.py`: PQC operations (liboqs), AES-GCM encryption/decryption, HKDF key derivation
- `backend/app/security/key_vault.py`: per-user encrypted private-key bundle storage
- `backend/app/utils/encrypted_types.py`: transparent DB column encryption for sensitive text fields

## Security Architecture

### 1. Cryptographic Controls

- KEM: selects strongest available from liboqs (prefers ML-KEM/Kyber variants)
- Signatures: selects strongest available (prefers ML-DSA/Dilithium variants)
- Symmetric encryption: AES-256-GCM
- Key derivation: HKDF-SHA256

### 2. Key Storage Model

- Public keys remain in DB user row.
- Private keys are moved to encrypted vault files:
- Path: `KEY_VAULT_DIR/user_<id>.json.enc`
- Cipher: Fernet key from `KEY_VAULT_MASTER_KEY` (or dev fallback)

### 3. Sensitive Data Encryption in DB

Encrypted ORM fields use `EncryptedText`, including:
- `users.aadhar_number`
- `evidence.case_id`, `evidence.filename`, `evidence.description`, `evidence.evidence_type`
- `audit_logs.details`, `audit_logs.error_message`, `audit_logs.ip_address`, `audit_logs.user_agent`

Encryption key source:
- `APP_DATA_ENCRYPTION_KEY` (required in production)

### 4. Audit Integrity

`audit_logs` forms a hash chain:
- `prev_hash`
- `current_hash = sha3_256(prev_hash + canonical_payload)`

This enables chain verification and tamper detection in admin views.

### 5. HTTP/Session Hardening

- Security headers added at response layer (CSP, frame deny, referrer policy, etc.)
- JWT access token + refresh cookie rotation
- Rate limiting via Flask-Limiter
- Role checks in endpoint decorators/claims

## Data Model

### `users`
- Identity: `username`, `email`, `role`, `is_active`
- Verification: `is_physically_verified`, `aadhar_hash`, address/contact fields
- Access alias: `pqid`
- PQC public keys + challenge fields

### `evidence`
- Metadata: `case_id`, `filename`, `description`, `file_hash`, `file_size`
- Crypto metadata: encrypted payload path, KEM ciphertext, IV/tag, signature
- Workflow: `approval_status`, `approved_by`, `approved_at`, `approval_signature`, `access_level`

### `custody_records`
- Linked actions (`upload`, `view`, `approve`, `deny`, `submit_to_court`) with timestamp, user, IP, optional signature

### `audit_logs`
- Action history with status/error metadata and hash-chain integrity fields

### `refresh_tokens`
- Session tracking for refresh-token rotation/revocation (`jti_hash`, `revoked_at`, replacement chain)

### `system_heartbeats`
- Per-minute heartbeat with server load percentage for health charts

## Frontend Architecture

- Router + auth gate in `react-app/src/App.jsx`
- API client/interceptors in `react-app/src/api.js`
- Modules: Login, Register (admin provisioning flow), Evidence, Admin command console

Build/deploy behavior:
- Dev server on `:5173` with `/api` proxy to backend
- Production build emitted to `backend/static`
- Flask serves SPA routes using catch-all

## Operational Notes

- `migrate_db.py` is the idempotent schema upgrader for legacy databases.
- `check_production.py` validates production posture (DB connectivity, OQS availability, fallback disabled).
- `init_db.py` seeds default local admin.
