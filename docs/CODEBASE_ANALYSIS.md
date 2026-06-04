# PQC Evidence Storing System - Complete Codebase Analysis

**Last Updated:** April 15, 2026  
**System Purpose:** Post-Quantum Cryptography-based evidence management system with role-based access control, encryption, and audit compliance.

---

## 1. DATABASE MODELS & RELATIONSHIPS

### Core Tables

#### 1.1 **users** (User)
**Purpose:** User authentication, role management, identity verification  
**Location:** `backend/app/models/user.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | INTEGER | PK | - | Primary key |
| username | STRING(120) | Unique | References from `audit_logs`, `refresh_tokens` | User login identifier |
| email | STRING(120) | Unique | - | Contact email |
| password_hash | STRING(255) | - | - | bcrypt hash (12 rounds) |
| role | STRING(50) | - | - | Values: `admin`, `investigator`, `court_user` |
| address | TEXT | - | - | Physical address (all roles) |
| phone_number | STRING(20) | - | - | Phone for verification |
| pqid | STRING(50) | Unique | - | Post-Quantum ID for MFA |
| pqid_failed_attempts | INTEGER | - | - | Lockout tracking (3 attempts = 24h lockout) |
| pqid_locked_until | DATETIME | - | - | Lockout timestamp |
| is_physically_verified | BOOLEAN | - | - | Court/investigator verification flag |
| aadhar_number | EncryptedText | - | - | Indian national ID (encrypted) |
| aadhar_hash | STRING(64) | Unique | - | SHA-256 hash for deduplication |
| designation | STRING(100) | - | - | Court user job title |
| court_details | TEXT | - | - | Court user assignment info |
| station_name | STRING(100) | - | - | Investigator station assignment |
| pqc_public_key | TEXT | - | - | Legacy KEM public key |
| pqc_secret_key | TEXT | - | - | **NOT STORED** (in key vault) |
| pqc_kem_public_key | TEXT | - | - | Modern ML-KEM/Kyber public key |
| pqc_kem_secret_key | TEXT | - | - | **NOT STORED** (in key vault) |
| pqc_sig_public_key | TEXT | - | - | ML-DSA/Dilithium public key |
| pqc_sig_secret_key | TEXT | - | - | **NOT STORED** (in key vault) |
| client_auth_sig_public_key | TEXT | - | - | Client signature verification key |
| pqc_kem_algorithm | STRING(64) | - | - | Algorithm identifier (e.g., "ML-KEM-768") |
| pqc_sig_algorithm | STRING(64) | - | - | Algorithm identifier (e.g., "ML-DSA-65") |
| current_challenge | TEXT | - | - | MFA challenge (time-bound) |
| current_challenge_expires_at | DATETIME | - | - | Challenge TTL (300s default) |
| webauthn_required | BOOLEAN | - | - | Force passkey enrollment |
| webauthn_user_handle | STRING(128) | Unique | → `webauthn_credentials.user_id` | Passkey user ID |
| webauthn_enrolled_at | DATETIME | - | - | Enrollment timestamp |
| is_active | BOOLEAN | - | - | Account status |
| created_at | DATETIME | - | - | Registration timestamp |
| last_login | DATETIME | - | - | Last successful login |

**Relationships:**
- `audit_logs` (1:M) - User actions logged
- `case_files` (1:M via `created_by`) - Cases created by user
- `evidence` (1:M via `uploaded_by`) - Evidence uploaded
- `webauthn_credentials` (1:M) - Passkey devices
- `refresh_tokens` (1:M) - Active sessions

**Private Key Storage:** All private keys (`pqc_*_secret_key`) are stored in encrypted key vault (`secure/key_vault/user_*.json.enc`) using Fernet encryption with derived master key.

---

#### 1.2 **case_files** (CaseFile)
**Purpose:** Structured case metadata and evidence container  
**Location:** `backend/app/models/case_file.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | STRING(36) | PK | - | UUID v4 |
| case_number | STRING(64) | Unique | - | Investigator-provided case number |
| quantum_ledger_number | STRING(20) | Unique | - | Format: `QLYYSSNNxxxx` (year, state, district, seq) |
| case_title | EncryptedText | - | - | Case name (encrypted) |
| complainant_name | EncryptedText | - | - | Complainant (encrypted) |
| suspect_name | EncryptedText | - | - | Suspect/accused (encrypted) |
| incident_date | DATE | - | - | When incident occurred |
| incident_state | EncryptedText | - | - | State code (2-letter) |
| incident_district | EncryptedText | - | - | District code (2-letter) |
| incident_location | EncryptedText | - | - | Exact incident location |
| case_summary | EncryptedText | - | - | Case narrative (encrypted) |
| status | STRING(20) | Index | - | Values: `open`, `investigation`, `closed` |
| assigned_investigator_id | INTEGER | Index | → `users.id` | Investigator assignment |
| approval_status | STRING(20) | Index | - | Values: `approved`, `pending`, `rejected` |
| approved_by | INTEGER | - | → `users.id` | Admin approver |
| approved_at | DATETIME | - | - | Approval timestamp |
| approval_notes | TEXT | - | - | Admin comments |
| created_by | INTEGER | FK | → `users.id` | Creator user |
| created_at | DATETIME | Index | - | Creation timestamp |
| updated_at | DATETIME | Index | - | Last modification |

**Relationships:**
- `evidence_items` (1:M) - Associated evidence
- `case_book_pages` (1:M) - Case documents
- `court_access_grants` (1:M) - Court user access windows
- `court_access_requests` (1:M) - Pending court requests
- `assigned_investigator_user` - Linked investigator (join)

**Access Control:**
- **Admin:** View/edit all cases
- **Investigator:** View only assigned & approved cases
- **Court User:** View via active `CaseAccessGrant`

---

#### 1.3 **evidence** (Evidence)
**Purpose:** Encrypted evidence file metadata and chain of custody  
**Location:** `backend/app/models/evidence.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | STRING(36) | PK | - | UUID v4 |
| case_id | EncryptedText | Index | - | Case reference (encrypted) |
| case_file_id | STRING(36) | FK, Index | → `case_files.id` | Structured case link |
| filename | EncryptedText | - | - | Original filename (encrypted) |
| file_hash | STRING(64) | Index | - | SHA-256 hash (immutable proof) |
| file_size | INTEGER | - | - | Size in bytes |
| encrypted_data_path | STRING(255) | - | - | Path to encrypted file on disk |
| encryption_key | TEXT | - | - | **KEM Ciphertext** (not raw AES) |
| encryption_iv | TEXT | - | - | AEAD IV (base64) |
| encryption_tag | TEXT | - | - | AEAD authentication tag (base64) |
| signature | TEXT | - | - | Digital signature (base64) |
| signature_public_key | TEXT | - | - | Signer's public key |
| signature_algorithm | STRING(64) | - | - | Algorithm (e.g., "ML-DSA-65") |
| description | EncryptedText | - | - | Evidence description (encrypted) |
| evidence_type | EncryptedText | - | - | Type: image, video, document, etc. |
| uploaded_by | INTEGER | FK | → `users.id` | Uploader user |
| uploaded_at | DATETIME | Index | - | Upload timestamp |
| approval_status | STRING(20) | Index | - | Values: `pending`, `approved`, `rejected` |
| approved_by | INTEGER | FK | → `users.id` | Approver (admin) |
| approved_at | DATETIME | - | - | Approval timestamp |
| approval_signature | TEXT | - | - | Admin's signature on approval |
| access_level | STRING(50) | - | - | Values: `restricted`, `investigator`, `court` |
| authorized_users | TEXT | - | - | JSON list of user IDs with access |
| is_deleted | BOOLEAN | - | - | Soft delete flag |
| deleted_at | DATETIME | - | - | Deletion timestamp |

**Relationships:**
- `custody_chain` (1:M) - Chain of custody records
- `case_file` (M:1) - Parent case

**Encryption Flow:**
1. Client reads file → SHA-256 hash
2. Backend retrieves user's public KEM key
3. KEM Encapsulate → symmetric key
4. AES-256-GCM encrypt file content
5. Dilithium sign payload
6. Store: ciphertext path, KEM envelope, IV, tag, signature

---

#### 1.4 **custody_records** (CustodyRecord)
**Purpose:** Immutable chain of custody audit trail  
**Location:** `backend/app/models/evidence.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | INTEGER | PK | - | Auto-increment |
| evidence_id | STRING(36) | FK, Index | → `evidence.id` | Evidence reference |
| user_id | INTEGER | FK | → `users.id` | Actor user ID |
| action | STRING(50) | - | - | Values: `upload`, `view`, `download`, `transfer`, `approve` |
| timestamp | DATETIME | Index | - | Action time |
| notes | TEXT | - | - | Action context |
| ip_address | STRING(45) | - | - | IPv4/IPv6 address |
| signature | TEXT | - | - | Cryptographic signature |

**Purpose:** Every evidence access/change logged with user, timestamp, and IP.

---

#### 1.5 **case_book_pages** (CaseBookPage)
**Purpose:** Append-only case history records  
**Location:** `backend/app/models/case_book_page.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | STRING(36) | PK | - | UUID v4 |
| case_file_id | STRING(36) | FK, Index | → `case_files.id` | Case reference |
| page_number | INTEGER | - | - | Sequential page counter (unique per case) |
| filename | EncryptedText | - | - | Original filename (encrypted) |
| summary | EncryptedText | - | - | Page summary/notes |
| mime_type | STRING(80) | - | - | File type (e.g., `application/pdf`) |
| file_hash | STRING(64) | Index | - | SHA-256 hash |
| file_size | INTEGER | - | - | Size in bytes |
| stored_path | STRING(255) | - | - | Disk path to stored file |
| uploaded_by | INTEGER | FK, Index | → `users.id` | Uploader |
| created_at | DATETIME | Index | - | Creation timestamp |

**Unique Constraint:** `(case_file_id, page_number)` - one page per number per case

**Purpose:** Immutable case document repository (PDFs, images, etc.) versioned by page number.

---

#### 1.6 **court_access_requests** (CaseAccessRequest)
**Purpose:** Track court user access requests  
**Location:** `backend/app/models/court_access.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | INTEGER | PK | - | Auto-increment |
| requested_by | INTEGER | FK, Index | → `users.id` | Court user requester |
| case_file_id | STRING(36) | FK, Index | → `case_files.id` | Case reference |
| requested_case_number | STRING(64) | Index | - | Fallback case lookup |
| requested_quantum_ledger_number | STRING(20) | Index | - | Fallback ledger lookup |
| requested_duration_minutes | INTEGER | - | - | Access window (1 - 43200 min) |
| reason | TEXT | - | - | Request justification |
| status | STRING(20) | Index | - | Values: `pending`, `approved`, `denied` |
| created_at | DATETIME | Index | - | Request submission time |
| decided_at | DATETIME | Index | - | Admin decision time |
| decided_by | INTEGER | FK, Index | → `users.id` | Deciding admin |
| decision_notes | TEXT | - | - | Approval/denial reason |
| granted_expires_at | DATETIME | Index | - | When grant expires |

**Relationships:**
- `requester` (N:1) - Court user
- `decider` (N:1) - Admin approver
- `grants` (1:M) - Issued access grants
- `case_file` (N:1) - Linked case

**Status Flow:** `pending` → `approved/denied`, then → `CaseAccessGrant` creation

---

#### 1.7 **case_access_grants** (CaseAccessGrant)
**Purpose:** Active time-limited court access windows  
**Location:** `backend/app/models/court_access.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | INTEGER | PK | - | Auto-increment |
| case_file_id | STRING(36) | FK, Index | → `case_files.id` | Case access target |
| court_user_id | INTEGER | FK, Index | → `users.id` | Grant recipient |
| granted_by | INTEGER | FK | → `users.id` | Granting admin |
| granted_at | DATETIME | Index | - | Grant issuance |
| expires_at | DATETIME | Index | - | Access expiry |
| revoked_at | DATETIME | Index | - | Revocation time (NULL = active) |
| revoked_by | INTEGER | FK | → `users.id` | Revoking admin |
| revoke_reason | TEXT | - | - | Revocation justification |
| source_request_id | INTEGER | FK, Index | → `case_access_requests.id` | Originating request |
| notes | TEXT | - | - | Grant notes |

**Active Grant:** `revoked_at IS NULL AND expires_at > NOW()`

**Relationship:** Each request can spawn multiple grants (rare; usually 1:1)

---

#### 1.8 **audit_logs** (AuditLog)
**Purpose:** Immutable hash-chain integrity audit trail  
**Location:** `backend/app/models/audit_log.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | INTEGER | PK | - | Auto-increment |
| user_id | INTEGER | FK | → `users.id` | Actor (nullable for system events) |
| action | STRING(255) | Index | - | Action name (e.g., `evidence_upload`, `user_deactivate`) |
| resource_type | STRING(50) | - | - | Resource category (evidence, user, system) |
| resource_id | STRING(255) | - | - | Resource identifier |
| details | EncryptedText | - | - | JSON payload (encrypted) |
| status | STRING(20) | - | - | Values: `success`, `failure` |
| error_message | EncryptedText | - | - | Error details (encrypted) |
| ip_address | EncryptedText | - | - | Source IP (encrypted) |
| user_agent | EncryptedText | - | - | HTTP User-Agent (encrypted) |
| log_signature | TEXT | - | - | Cryptographic signature |
| prev_hash | STRING(64) | Index | - | Previous log's SHA3-256 hash |
| current_hash | STRING(64) | Index | - | This log's SHA3-256 hash |
| timestamp | DATETIME | Index | - | Event time |

**Hash Chain Integrity:**
- Before insert: fetch max `current_hash` from previous log (or "GENESIS")
- Compute canonical JSON payload
- `current_hash = SHA3-256(prev_hash | payload)`
- Insert both hashes
- Tampering detection: recompute vs stored hash

**Relationships:**
- `user` (M:1) - Acting user

---

#### 1.9 **refresh_tokens** (RefreshToken)
**Purpose:** JWT token rotation and revocation tracking  
**Location:** `backend/app/models/refresh_token.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | INTEGER | PK | - | Auto-increment |
| user_id | INTEGER | FK, Index | → `users.id` | Token owner |
| jti_hash | STRING(64) | Unique, Index | - | SHA-256(JWT jti) |
| expires_at | DATETIME | Index | - | Token expiry |
| created_at | DATETIME | - | - | Issue timestamp |
| last_used_at | DATETIME | - | - | Last refresh usage |
| revoked_at | DATETIME | - | - | Explicit revocation |
| replaced_by_hash | STRING(64) | Index | - | Successor jti_hash |
| created_ip | STRING(45) | - | - | IP of token creation |
| user_agent | STRING(255) | - | - | Browser/client ID |

**Lifecycle:** Created → Used (last_used_at) → Replaced → Revoked

**Is Revoked:** `revoked_at IS NOT NULL`

---

#### 1.10 **system_heartbeats** (SystemHeartbeat)
**Purpose:** Uptime monitoring and load tracking  
**Location:** `backend/app/models/system_heartbeat.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | INTEGER | PK | - | Auto-increment |
| beat_minute | DATETIME | Unique, Index | - | Minute marker (one per minute) |
| load_pct | INTEGER | - | - | CPU/system load percentage |
| created_at | DATETIME | Index | - | Record creation time |

**Background Process:** Written every 30 seconds (config: `HEARTBEAT_INTERVAL_SECONDS`)

---

#### 1.11 **webauthn_credentials** (WebAuthnCredential)
**Purpose:** Passkey/FIDO2 enrollment tracking  
**Location:** `backend/app/models/webauthn_credential.py`

| Field | Type | Index | Relationships | Notes |
|-------|------|-------|---------------|-------|
| id | INTEGER | PK | - | Auto-increment |
| user_id | INTEGER | FK, Index | → `users.id` | Credential owner |
| credential_id | TEXT | Unique, Index | - | WebAuthn credential ID (base64url) |
| public_key | TEXT | - | - | CBOR-encoded public key |
| sign_count | INTEGER | - | - | Cloned-credential detector |
| transports | TEXT | - | - | Transport hints (usb, nfc, ble, internal) |
| device_type | STRING(40) | - | - | Device type (platform, cross-platform) |
| backed_up | BOOLEAN | - | - | Cloud backup flag |
| fmt | STRING(40) | - | - | Attestation format |
| aaguid | STRING(36) | - | - | Authenticator AAGUID |
| created_at | DATETIME | - | - | Enrollment time |
| last_used_at | DATETIME | - | - | Last authentication |
| is_active | BOOLEAN | - | - | Credential status |

**Purpose:** Support passwordless login via WebAuthn (FIDO2 standard)

---

## 2. API ENDPOINTS

### Authentication Routes
**Prefix:** `/api/auth`  
**Base URL:** `http://localhost:5000/api/auth`

#### Auth - User Registration
- **Endpoint:** `POST /auth/register`
- **Rate Limit:** Default (300/hour)
- **Auth Required:** No
- **Input:**
  ```json
  {
    "username": "string (unique)",
    "email": "string (unique)",
    "password": "string (12+ chars, mixed case, digits, special)",
    "role": "enum(admin|investigator|court_user)",
    "address": "string",
    "phone_number": "string",
    "is_physically_verified": "boolean",
    "aadhar_number": "string (12 digits, encrypted)",
    "designation": "string (court_user only)",
    "court_details": "string (court_user only)",
    "station_name": "string (investigator only)",
    "enroll_webauthn": "boolean (optional)",
    "pqid": "string (optional, fallback to challenge-based)"
  }
  ```
- **Output:**
  ```json
  {
    "message": "User registered successfully",
    "user": {
      "id": "number",
      "username": "string",
      "email": "string",
      "role": "string",
      "kem_public_key": "string (base64)"
    }
  }
  ```
- **Errors:** 400 (validation), 409 (duplicate email/username), 500 (server error)
- **Process:**
  1. Validate input (password strength, email format, role)
  2. Hash aadhar number (SHA-256) for dedup
  3. Generate PQC keypairs (KEM + Signature)
  4. Store private keys in key vault
  5. Create user record
  6. If `enroll_webauthn`: trigger registration challenge

#### Auth - Login Challenge
- **Endpoint:** `POST /auth/login-challenge`
- **Rate Limit:** 10/minute
- **Auth Required:** No
- **Input:**
  ```json
  { "username": "string" }
  ```
- **Output:**
  ```json
  {
    "mfa_required": true,
    "mfa_type": "pqid|webauthn",
    "flow": "login",
    "stage": "authenticate|register",
    "login_token": "JWT (exp: 5min)",
    "options": { "challenge": "...", "timeout": 60000 }
  }
  ```
- **Process:**
  1. Find user by username
  2. Check WebAuthn enrollment status
  3. Generate challenge (32 bytes)
  4. Issue temp login token (webauthn_login claim, exp 300s)
  5. Return challenge + stage (register/authenticate)

#### Auth - Login Verify
- **Endpoint:** `POST /auth/login-verify`
- **Rate Limit:** 10/minute
- **Auth Required:** No
- **Input:**
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **Output:**
  ```json
  {
    "access_token": "JWT",
    "refresh_token": "JWT",
    "user": { ... }
  }
  ```
- **Process:**
  1. Find user, verify password (bcrypt)
  2. Check for PQID requirement (if required, return MFA challenge)
  3. Issue tokens + refresh

#### Auth - Login PQID
- **Endpoint:** `POST /auth/login-pqid`
- **Rate Limit:** 10/minute
- **Auth Required:** Temp (login_token)
- **Input:**
  ```json
  {
    "login_token": "JWT",
    "pqid": "string"
  }
  ```
- **Output:**
  ```json
  {
    "access_token": "JWT",
    "refresh_token": "JWT",
    "user": { ... }
  }
  ```
- **Process:**
  1. Validate temp login token
  2. Verify PQID (3 failures = 24h lockout)
  3. Clear lockout if correct
  4. Issue full tokens

#### Auth - WebAuthn Verify
- **Endpoint:** `POST /auth/webauthn/verify`
- **Rate Limit:** 10/minute
- **Auth Required:** Temp (login_token with webauthn_login)
- **Input:**
  ```json
  {
    "login_token": "JWT",
    "credential": {
      "id": "string (base64url)",
      "rawId": "string (base64url)",
      "type": "public-key",
      "response": {
        "clientDataJSON": "string",
        "authenticatorData": "string",
        "signature": "string",
        "userHandle": "string (optional)"
      }
    }
  }
  ```
- **Output:**
  ```json
  {
    "access_token": "JWT",
    "refresh_token": "JWT",
    "user": { ... }
  }
  ```
- **Process:**
  1. Parse temp token (webauthn_login claim)
  2. Verify credential against stored credentials
  3. Check sign count (cloned device detection)
  4. Issue full tokens

#### Auth - Refresh Token
- **Endpoint:** `POST /auth/refresh`
- **Rate Limit:** Default (300/hour)
- **Auth Required:** Yes (Refresh token cookie or header)
- **Input:** (empty body)
- **Output:**
  ```json
  {
    "access_token": "JWT (new)"
  }
  ```
- **Process:**
  1. Validate refresh token
  2. Check if revoked
  3. Rotate token (mark old as replaced)
  4. Issue new access token

#### Auth - Verify Token
- **Endpoint:** `GET /auth/verify-token`
- **Rate Limit:** Default
- **Auth Required:** Yes
- **Output:**
  ```json
  {
    "valid": true,
    "user": { "id": "number", "username": "string", "role": "string" }
  }
  ```

#### Auth - Presence (keep-alive)
- **Endpoint:** `GET /auth/presence`
- **Rate Limit:** Default
- **Auth Required:** Yes
- **Output:**
  ```json
  { "status": "ok" }
  ```
- **Purpose:** Client ping to refresh token expiry

#### Auth - Logout
- **Endpoint:** `POST /auth/logout`
- **Rate Limit:** Default
- **Auth Required:** Yes
- **Process:**
  1. Revoke refresh token
  2. Clear JWT blocklist
  3. Delete cookies

---

### Evidence Management Routes
**Prefix:** `/api/evidence`

#### Evidence - List Investigators
- **Endpoint:** `GET /evidence/investigators`
- **Auth Required:** Yes (admin/investigator)
- **Output:**
  ```json
  {
    "count": 5,
    "investigators": [
      { "id": 3, "username": "john_doe", "station_name": "Central Station" }
    ]
  }
  ```

#### Evidence - List Court Users
- **Endpoint:** `GET /evidence/court-users`
- **Auth Required:** Yes (admin only)
- **Output:**
  ```json
  {
    "count": 2,
    "court_users": [
      { "id": 4, "username": "judge_smith", "designation": "Judge", "court_details": "High Court" }
    ]
  }
  ```

#### Evidence - Court Access Requests
- **Endpoint:** `GET /evidence/court-access-requests`
- **Auth Required:** Yes (admin/court_user)
- **Query Params:**
  - `status`: `pending|approved|denied|all`
  - `limit`: 1-250 (default 100)
  - `case_file_id`: UUID (optional filter)
- **Output:**
  ```json
  {
    "count": 3,
    "requests": [ { id, case_number, status, requested_by_username, ... } ]
  }
  ```

#### Evidence - Create Court Access Request
- **Endpoint:** `POST /evidence/court-access-requests`
- **Auth Required:** Yes (court_user)
- **Rate Limit:** 60/hour
- **Input:**
  ```json
  {
    "case_number": "CASE-2026-001 (optional)",
    "quantum_ledger_number": "QL26GGDD0001 (optional)",
    "requested_duration_minutes": 60,
    "reason": "string",
    "pqid": "string"
  }
  ```
- **Output:**
  ```json
  {
    "message": "Court access request submitted to admin",
    "request": { "id": 1, "status": "pending", ... },
    "updated": false
  }
  ```
- **Process:**
  1. Verify PQID
  2. Look up case by number or ledger
  3. Check for existing pending request (update if found)
  4. Create/update `CaseAccessRequest`
  5. Log event

#### Evidence - Approve Court Request
- **Endpoint:** `POST /evidence/court-access-requests/<int:request_id>/approve`
- **Auth Required:** Yes (admin)
- **Input:**
  ```json
  { "duration_minutes": 120 }
  ```
- **Output:**
  ```json
  {
    "message": "Court access approved",
    "grant": { "id": 1, "expires_at": "...", "court_user_id": ... }
  }
  ```
- **Process:**
  1. Find request
  2. Validate case still exists
  3. Create `CaseAccessGrant` with expiry = now + duration
  4. Update request status → `approved`
  5. Log approval

#### Evidence - Deny Court Request
- **Endpoint:** `POST /evidence/court-access-requests/<int:request_id>/deny`
- **Auth Required:** Yes (admin)
- **Input:**
  ```json
  { "reason": "string" }
  ```
- **Output:**
  ```json
  { "message": "Request denied", "request": { ... } }
  ```

#### Evidence - List Case Access Grants
- **Endpoint:** `GET /evidence/cases/<case_file_id>/court-access-grants`
- **Auth Required:** Yes (admin/investigator) - Must be assigned investigator
- **Output:**
  ```json
  {
    "grants": [
      { "id": 1, "court_user_id": 4, "expires_at": "...", "is_active": true }
    ]
  }
  ```

#### Evidence - Create Direct Grant
- **Endpoint:** `POST /evidence/cases/<case_file_id>/court-access-grants`
- **Auth Required:** Yes (admin)
- **Input:**
  ```json
  {
    "court_user_id": 4,
    "duration_minutes": 60
  }
  ```
- **Output:**
  ```json
  { "message": "Grant created", "grant": { ... } }
  ```

#### Evidence - Create Case
- **Endpoint:** `POST /evidence/cases`
- **Auth Required:** Yes (admin/investigator)
- **Rate Limit:** 60/hour
- **Input:**
  ```json
  {
    "case_number": "CASE-2026-001",
    "case_title": "string (encrypted)",
    "complainant_name": "string",
    "suspect_name": "string",
    "incident_date": "2026-01-15",
    "incident_state": "state_code (2-letter)",
    "incident_district": "district_code (2-letter)",
    "incident_location": "string",
    "case_summary": "string",
    "assigned_investigator_id": 3
  }
  ```
- **Output:**
  ```json
  {
    "message": "Case created",
    "case": {
      "id": "uuid",
      "case_number": "string",
      "quantum_ledger_number": "QL26SSNNXXXX (auto-generated)",
      "status": "open"
    }
  }
  ```
- **Process:**
  1. Validate input (case_number unique, state/district codes valid)
  2. Auto-generate `quantum_ledger_number` from state+district+sequence
  3. Create `CaseFile` with approval_status = `approved`
  4. Assign investigator if provided
  5. Log creation

#### Evidence - List Cases
- **Endpoint:** `GET /evidence/cases`
- **Auth Required:** Yes
- **Query Params:**
  - `status`: `open|investigation|closed|all`
  - `assigned_investigator_id`: `number` (admin filter)
  - `limit`: 1-250 (default 100)
- **Output:**
  ```json
  {
    "count": 5,
    "cases": [ { id, case_number, status, approval_status, ... } ]
  }
  ```
- **Access Control:**
  - Admin: see all
  - Investigator: see only assigned + approved
  - Court: see only via grants

#### Evidence - Assign Investigator
- **Endpoint:** `PATCH /evidence/cases/<case_file_id>/assign-investigator`
- **Auth Required:** Yes (admin)
- **Input:**
  ```json
  { "assigned_investigator_id": 3 }
  ```

#### Evidence - Close Case
- **Endpoint:** `PATCH /evidence/cases/<case_file_id>/close`
- **Auth Required:** Yes (investigator/admin handling)
- **Input:**
  ```json
  { "pqid": "string" }
  ```
- **Output:** Updated case with `status: "closed"`

#### Evidence - Reopen Case
- **Endpoint:** `PATCH /evidence/cases/<case_file_id>/reopen`
- **Auth Required:** Yes (admin)

#### Evidence - Upload Evidence File
- **Endpoint:** `POST /evidence/upload`
- **Auth Required:** Yes (investigator/admin)
- **Rate Limit:** 60/hour
- **Content-Type:** multipart/form-data
- **Input:**
  ```
  - file: binary (max 500MB)
  - case_id: string
  - description: string
  - evidence_type: enum(image|video|document|audio|forensic)
  - intake_metadata: JSON {
      gps_location, device_type, case_category,
      intake_timestamp, client_sha3_512,
      seal_for_transport: boolean
    }
  ```
- **Output:**
  ```json
  {
    "message": "Evidence uploaded and encrypted",
    "evidence": {
      "id": "uuid",
      "filename": "encrypted_name",
      "file_hash": "sha256",
      "file_size": 1024000,
      "approval_status": "approved|pending",
      "encryption_key": "KEM ciphertext (base64)"
    }
  }
  ```
- **Process:**
  1. Validate file & case
  2. Calculate client-side hash if provided
  3. Generate file hash (SHA-256)
  4. Retrieve user's KEM public key
  5. KEM Encapsulate → symmetric key
  6. AES-256-GCM encrypt file
  7. Store to disk: `storage/evidence/<hash>.enc`
  8. Dilithium sign full payload
  9. Create `Evidence` record
  10. Log upload
  11. Return encrypted metadata

#### Evidence - Download Evidence
- **Endpoint:** `GET /evidence/<evidence_id>/content`
- **Auth Required:** Yes
- **Query Params:**
  - `decryption_only`: boolean (skip download, return decryption params)
- **Output:** Binary file stream OR JSON decryption envelope
- **Process:**
  1. Find evidence
  2. Check access (approval_status, active grant, permissions)
  3. Log download in custody chain
  4. Return file bytes OR KEM envelope for client-side decryption

#### Evidence - List Evidence
- **Endpoint:** `GET /evidence/list`
- **Auth Required:** Yes
- **Query Params:**
  - `case_id`: string (filter)
  - `status`: `approved|pending|rejected|all`
  - `limit`: 1-250
- **Output:** Array of evidence metadata

#### Evidence - Get Evidence Details
- **Endpoint:** `GET /evidence/<evidence_id>`
- **Auth Required:** Yes
- **Output:**
  ```json
  {
    "id": "uuid",
    "filename": "encrypted",
    "file_hash": "sha256",
    "file_size": 1024000,
    "description": "encrypted",
    "approval_status": "approved",
    "uploaded_by_username": "investigator_name",
    "custody_chain": [ ... ]
  }
  ```

#### Evidence - Case Book Pages Upload
- **Endpoint:** `POST /evidence/cases/<case_file_id>/case-book/pages`
- **Auth Required:** Yes (investigator handling case)
- **Rate Limit:** 60/hour
- **Input:**
  ```
  - file: binary (PDF, PNG, JPEG only)
  - summary: string
  ```
- **Output:**
  ```json
  {
    "message": "Page added to case book",
    "page": { "id": "uuid", "page_number": 1, ... }
  }
  ```
- **Process:**
  1. Validate file (extension + magic bytes)
  2. Auto-increment page_number for case
  3. Store to disk
  4. Create `CaseBookPage` record

#### Evidence - List Case Book Pages
- **Endpoint:** `GET /evidence/cases/<case_file_id>/case-book`
- **Auth Required:** Yes
- **Output:**
  ```json
  {
    "case_file_id": "uuid",
    "pages": [ { id, page_number, filename, ... } ]
  }
  ```

#### Evidence - Get Case Book Page Content
- **Endpoint:** `GET /evidence/case-book/pages/<page_id>/content`
- **Auth Required:** Yes
- **Output:** Binary file (PDF/image)

---

### Admin Routes
**Prefix:** `/api/admin`  
**Auth Required:** Yes (admin role)

#### Admin - Overview Dashboard
- **Endpoint:** `GET /admin/overview`
- **Output:**
  ```json
  {
    "stats": {
      "total_users": 10,
      "total_cases": 5,
      "pending_evidence": 2,
      "active_court_grants": 3
    },
    "recent_activity": [ ... ],
    "pqc_integrity_status": "ok|warning|critical"
  }
  ```

#### Admin - Approve Evidence
- **Endpoint:** `POST /admin/evidence/<evidence_id>/approve`
- **Input:**
  ```json
  { "notes": "string" }
  ```
- **Output:** Updated evidence record

#### Admin - Deny Evidence
- **Endpoint:** `POST /admin/evidence/<evidence_id>/deny`
- **Input:**
  ```json
  { "reason": "string" }
  ```

#### Admin - Approve Case
- **Endpoint:** `POST /admin/cases/<case_id>/approve`
- **Input:**
  ```json
  { "notes": "string" }
  ```

#### Admin - Reject Case
- **Endpoint:** `POST /admin/cases/<case_id>/reject`
- **Input:**
  ```json
  { "reason": "string" }
  ```

#### Admin - Set User PQID
- **Endpoint:** `POST /admin/users/<int:user_id>/pqid`
- **Input:**
  ```json
  { "pqid": "string" }
  ```

#### Admin - Update User
- **Endpoint:** `PUT /admin/users/<int:user_id>`
- **Input:**
  ```json
  {
    "email": "string (optional)",
    "address": "string (optional)",
    "phone_number": "string (optional)",
    "is_active": "boolean (optional)"
  }
  ```

#### Admin - Deactivate/Delete User
- **Endpoint:** `DELETE /admin/users/<int:user_id>`
- **Endpoint (Permanent):** `DELETE /admin/users/<int:user_id>/purge`
- **Output:** Soft delete or permanent purge

#### Admin - List Users
- **Endpoint:** `GET /admin/users`
- **Query Params:**
  - `role`: `admin|investigator|court_user|all`
  - `is_active`: `true|false|all`
  - `limit`: 1-250

#### Admin - Audit Logs
- **Endpoint:** `GET /admin/audit-logs`
- **Query Params:**
  - `from_date`: ISO datetime
  - `to_date`: ISO datetime
  - `action`: string (filter)
  - `resource_type`: string (filter)
  - `limit`: 1-250
- **Output:** Array of audit entries with hash-chain validation
- **Hash Chain Verification:**
  - Compute expected hash for each log
  - Compare to stored hash
  - Detect tampering

#### Admin - Export Audit Logs
- **Endpoint:** `GET /admin/audit-logs/export`
- **Query Params:** Same as GET
- **Output:** PDF report with hash chain diagram

#### Admin - System Status
- **Endpoint:** `GET /admin/system-status`
- **Output:**
  ```json
  {
    "database": "connected|error",
    "heartbeat": "active|stale",
    "load_average": 0.5,
    "uptime_minutes": 1440,
    "pqc_engine": { "algorithm_kex": "ML-KEM-768", "algorithm_sig": "ML-DSA-65" }
  }
  ```

#### Admin - Health History
- **Endpoint:** `GET /admin/health-history`
- **Query Params:**
  - `date`: YYYY-MM-DD
  - `tz_offset_minutes`: UTC offset
- **Output:** 24-hour uptime chart

#### Admin - Backups
- **Endpoint:** `GET /admin/backups`
- **Output:** List of backup files
- **Endpoint (Create):** `POST /admin/backups`
- **Output:** New backup metadata

---

## 3. EXTERNAL DATA SOURCES & INTEGRATIONS

### Integrated Libraries (No External APIs)

| Library | Purpose | Integration Type |
|---------|---------|------------------|
| **liboqs-python** | Post-Quantum Cryptography | Local library (ML-KEM, ML-DSA) |
| **cryptography** | AES-256-GCM encryption | LocalLibrary |
| **webauthn** | FIDO2/Passkey support | Local library + device |
| **Flask-JWT-Extended** | JWT token management | In-memory/cookie storage |
| **Flask-SQLAlchemy** | ORM database access | SQLite/PostgreSQL |
| **bcrypt** | Password hashing | Local library |
| **reportlab** | PDF generation | Local library |

### External Data References

| Data Source | Purpose | Read/Write |
|-------------|---------|-----------|
| **India State/District Codes** | Geographic case metadata | Read-only (hardcoded: `react-app/src/constants/indiaGeo.js`) |
| **Aadhar Database** | Identity verification (simulated) | Read-only validation |
| **System CPU/Load** | Health monitoring | Read-only (`os.getloadavg()`) |

### No Third-Party APIs
- **No external REST APIs** for evidence, users, or cryptography
- **No cloud storage** integration (files stored locally in `storage/`)
- **No message queues** (synchronous processing only)
- **No email service** (logging-only for now)
- **No SMS provider** (optional PQID delivery not implemented)

---

## 4. FILE STORAGE LOCATIONS & FLOW

### Directory Structure

```
backend/
├── storage/                              # File storage root
│   ├── evidence/                         # Encrypted evidence files
│   │   └── {file_hash_256}.enc          # AES-256-GCM encrypted payload
│   └── case_books/                       # Case document pages
│       └── {case_id}/                    # Per-case directory
│           └── page_{number}.pdf        # Case book pages
├── secure/                               # Encrypted key vault
│   └── key_vault/                        # User private keys
│       └── user_{id}.json.enc           # Fernet-encrypted key bundle
└── logs/                                 # Application logs
    └── app.log                           # Rolling log file (10MB per file, 10 backups)

frontend/
├── static/                               # Served static files
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── templates/index.html                  # React app entry point
```

### File Upload Flow

#### Evidence Upload (Investigator → Storage)
```
1. User selects file (binary)
   ↓
2. Client computes SHA-256 or SHA3-512 hash (optional)
   ↓
3. POST /api/evidence/upload
   - File bytes (multipart)
   - Case ID
   - Metadata (GPS, device, category)
   ↓
4. Backend receives:
   - Read file into memory
   - Compute official SHA-256 hash
   - Validate case ownership
   ↓
5. Encryption:
   - Retrieve KEM public key for user
   - Generate random symmetric key (32 bytes)
   - KEM Encapsulate(public_key) → ciphertext (KEM envelope)
   - AES-256-GCM encrypt(file_data, nonce, iv, key)
   ↓
6. Signing:
   - Canonical JSON payload (hash, size, metadata)
   - Dilithium sign(payload)
   ↓
7. Storage:
   - Write encrypted bytes to: storage/evidence/{file_hash}.enc
   - File permissions: 0o600 (owner read/write)
   ↓
8. Database:
   - Insert Evidence record:
     - encrypted_data_path: "storage/evidence/{hash}.enc"
     - encryption_key: KEM ciphertext (base64)
     - encryption_iv: AEAD IV
     - encryption_tag: AEAD tag
     - signature: Signature bytes
   ↓
9. Audit:
   - Log to custody_records: action="upload"
   ↓
10. Response:
   - Return Evidence JSON + KEM envelope for potential client-side verification
```

#### Evidence Download (Storage → User)
```
1. GET /api/evidence/{evidence_id}/content
   ↓
2. Backend:
   - Find Evidence record
   - Verify access:
     * approval_status = "approved"
     * Check custody_records access grants
     * OR admin/investigator on same case
   ↓
3. Read encrypted file: storage/evidence/{file_hash}.enc
   ↓
4. Client-side decryption option (query param ?decryption_only=true):
   - Return KEM envelope + encryption params (IV, tag)
   - Client-side KEM Decapsulate + AES Decrypt
   - OR
   - Server-side decryption:
     - Retrieve user's KEM secret key from key vault
     - KEM Decapsulate(ciphertext) → symmetric key
     - AES-256-GCM decrypt(encrypted_bytes, iv, tag, key)
     - Verify signature
     - Return plain bytes
   ↓
5. Audit:
   - Log to custody_records: action="download"
   - Log to AuditLog
   ↓
6. Response:
   - Binary stream (Content-Type: guessed from filename)
```

#### Case Book Upload (Investigator → Storage)
```
1. POST /api/evidence/cases/{case_id}/case-book/pages
   ↓
2. Validate:
   - File extension (no executables)
   - Magic bytes (PDF: %PDF-, PNG: 89504E47, JPEG: FFD8FF)
   - Mime type
   ↓
3. Storage:
   - Write to: storage/case_books/{case_id}/page_{page_number}.{ext}
   - File permissions: 0o600
   ↓
4. Database:
   - Insert CaseBookPage record:
     - page_number: auto-increment per case
     - stored_path: relative/absolute path
     - file_hash: SHA-256
     - mime_type: detected
   ↓
5. Response:
   - Page metadata
```

#### Case Book Download
```
1. GET /api/evidence/case-book/pages/{page_id}/content
   ↓
2. Verify access (same as Evidence)
   ↓
3. Read from storage/case_books/...
   ↓
4. Return binary with appropriate Content-Type
```

### Key Vault File Format

**Location:** `secure/key_vault/user_{id}.json.enc`

**Content (encrypted with Fernet):**
```json
{
  "user_id": 1,
  "updated_at": "2026-01-15T10:30:00",
  "keys": {
    "pqc_kem_secret_key": "base64-encoded-key-material",
    "pqc_sig_secret_key": "base64-encoded-key-material",
    "pqc_secret_key": "base64-encoded-key (legacy)"
  }
}
```

**Encryption:** Fernet (AES-128-CBC + HMAC-SHA256 + timestamp)  
**Master Key:** Derived from `KEY_VAULT_MASTER_KEY` env var or `JWT_SECRET_KEY` (dev fallback)

---

## 5. BACKGROUND PROCESSES & JOBS

### System Heartbeat
**Type:** Background thread (daemon)  
**Location:** `backend/app/__init__.py`  
**Trigger:** Application startup (if `HEARTBEAT_ENABLED=true`)

**Process Flow:**
```
1. Thread starts: _heartbeat_loop(app, interval_seconds)
2. Every {interval_seconds} (default 30s):
   - Get current system load: os.getloadavg()[0]
   - Calculate load percentage (load1 / 4.0 * 100)
   - Create SystemHeartbeat record:
     * beat_minute: rounded to minute boundary
     * load_pct: calculated load
3. Insert to database
   - On duplicate minute: update load_pct instead
4. Continue until app shutdown or _heartbeat_stop signal
```

**Configuration:**
- `HEARTBEAT_ENABLED`: boolean (default: true)
- `HEARTBEAT_INTERVAL_SECONDS`: int (default: 30)

**Database Impact:**
- Inserts 1 record per minute
- One timezone per server
- Used for up-time charts and load trending in admin dashboard

### API Request Audit Logging
**Type:** Flask after_request hook  
**Trigger:** Every HTTP response (if `AUDIT_API_REQUESTS=true`)

**Process:**
```
1. Check if response is OPTIONS or non-API path → skip
2. Get JWT identity (optional)
3. Extract request details:
   - Method, path, endpoint
   - Status code
   - Query parameters
   - Route variables
   - JWT claims (role)
4. Determine resource_type from path
5. Create AuditLog record:
   - user_id: JWT identity (if authenticated)
   - action: "api_request"
   - status: "success" if < 400, else "failure"
   - details: JSON of request metadata
6. Compute hash-chain (prev_hash, current_hash)
```

**Configuration:**
- `AUDIT_API_REQUESTS`: boolean (default: false) - Can be expensive

### Hash-Chain Integrity Monitoring
**Type:** On-demand (admin endpoint)  
**Location:** `backend/app/routes/admin.py`  
**Endpoint:** `GET /admin/audit-logs`

**Process:**
```
1. Fetch audit log range
2. For each log:
   - Retrieve prev_hash from previous log (or "GENESIS")
   - Recompute canonical JSON payload
   - Compute expected hash: SHA3-256(prev_hash | payload)
   - Compare stored hash vs expected
   - Flag if mismatch (tampering detected)
3. Return logs with integrity indicators
```

### No Other Background Jobs
- **No scheduled exports** (manual admin export only)
- **No automatic cleanup** (soft deletes retained)
- **No email notifications** (logging only)
- **No periodic backups** (manual backup endpoint)

---

## 6. FRONTEND COMPONENTS & BACKEND INTERACTION

### React Application Structure
**Location:** `react-app/src/`

```
src/
├── App.jsx                 # Main router & auth state
├── api.js                  # Axios HTTP client
├── main.jsx                # React entry point
├── index.css               # Global styles
├── components/
│   ├── Admin.jsx           # /admin - Admin dashboard
│   ├── Dashboard.jsx       # /dashboard - Main user dashboard
│   ├── Evidence.jsx        # /cases, /cases/created - Case/evidence management
│   ├── Login.jsx           # /login - Authentication UI
│   ├── Register.jsx        # /register - User registration
│   ├── Navbar.jsx          # Navigation header
│   ├── Sidebar.jsx         # Side menu
│   ├── CustomSelect.jsx    # Reusable dropdown
│   ├── LoadingScreen.jsx   # Loading/splash screen
│   └── CursorTrail.jsx     # Visual effect
├── constants/
│   ├── indiaGeo.js         # State/district lookup
│   └── pqid.js             # PQID bypass list
```

### Frontend-Backend API Integration

#### API Client Module (`api.js`)

**HTTP Client Setup:**
```javascript
axios.create({
  baseURL: '/api',
  withCredentials: true,  // Include cookies
  headers: { 'Content-Type': 'application/json' }
})
```

**Request Interceptor:**
- Inject JWT from localStorage: `Authorization: Bearer {token}`

**Response Interceptor:**
- 401 Unauthorized → Attempt token refresh
- If refresh succeeds → Retry original request
- If refresh fails → Clear auth & redirect to /login
- 401 without token → Redirect to /login

#### Auth API Integration

| UI Component | Method | Endpoint | Purpose |
|--------------|--------|----------|---------|
| Login.jsx | `authAPI.loginChallenge()` | POST /auth/login-challenge | Get MFA challenge |
| Login.jsx | `authAPI.loginVerify()` | POST /auth/login-verify | Password authentication |
| Login.jsx | `authAPI.loginPqid()` | POST /auth/login-pqid | Submit PQID |
| Login.jsx | `authAPI.webauthnVerify()` | POST /auth/webauthn/verify | Passkey verification |
| App.jsx | `authAPI.verifyToken()` | GET /auth/verify-token | Startup token validation |
| App.jsx | `authAPI.presence()` | GET /auth/presence | Keep-alive ping (30s interval) |
| Navbar.jsx | `authAPI.logout()` | POST /auth/logout | Logout |
| Any | `authAPI.refresh()` | POST /auth/refresh | Token rotation |

#### Auth State Management

**App.jsx State:**
```javascript
const [isAuthenticated, setIsAuthenticated] = useState(false)
const [user, setUser] = useState(null)
const [loading, setLoading] = useState(true)

// Local storage: 'access_token' (JWT)
```

**On Login Success:**
```javascript
localStorage.setItem('access_token', token)
setUser(userData)
setIsAuthenticated(true)
// Navigate based on user.role
```

**On 401 Response:**
- Remove auth
- Redirect to /login
- Auto-retry after token refresh (if available)

#### Evidence UI Flows

| Screen | Component | Backend Endpoints | Operations |
|--------|-----------|-------------------|-----------|
| Create Case | Evidence.jsx mode="create" | POST /cases | New case creation |
| Created/View Cases | Evidence.jsx mode="created" | GET /cases | List user's cases |
| Upload Evidence | Evidence.jsx | POST /upload | File encrypt & store |
| Case Book | Evidence.jsx | POST /cases/.../case-book/pages | Upload page |
| Court Access | Evidence.jsx | POST /court-access-requests | Request access |
| Evidence Details | Evidence.jsx | GET /evidence/{id} | View metadata |

#### Admin UI Flows

| Screen | Component | Backend Endpoints | Operations |
|--------|-----------|-------------------|-----------|
| Dashboard | Admin.jsx | GET /admin/overview | Summary stats |
| Audit Logs | Admin.jsx | GET /admin/audit-logs | Search & export |
| User Management | Admin.jsx | GET/PUT/DELETE /admin/users | CRUD operations |
| Approvals | Admin.jsx | GET /admin/evidence/pending | Pending queue |
| Court Requests | Admin.jsx | GET /evidence/court-access-requests | Approval workflow |

#### Client-Side Data Processing

**File Upload (Evidence.jsx):**
```javascript
1. User selects file
2. Compute SHA-256/SHA3-512 hash (js-sha3 library)
3. Send to backend:
   - File bytes (multipart)
   - Intake metadata (GPS, device, category)
   - Client-computed hash
4. Backend verifies & encrypts
5. Frontend received encrypted metadata
```

**PQID Input (Login.jsx):**
```javascript
1. Bypass list check: isPqidBypassUser(user)
2. If PQID required: show input field
3. Send PQID string to backend
4. Backend validates (3 strikes = 24h lockout)
```

**Passkey Flow (Login.jsx):**
```javascript
1. Browser supports navigator.credentials
2. Call navigator.credentials.create() (registration)
   - OR .get() (authentication)
3. Serialize credential to JSON (base64url encoding)
4. Send to backend for verification
5. Server validates attestation/assertion
6. Return JWT tokens
```

**State Sync:**
- User info stored in React state
- Tokens in localStorage
- Keep-alive pings every 30s (authAPI.presence())
- Auto-logout on 401

---

## 7. DATA FLOW DIAGRAMS (SUMMARY)

### Authentication Flow
```
User (Browser)
    ↓ Enter credentials
    ↓
Frontend (Login.jsx)
    ↓ POST /auth/login-challenge
    ↓
Backend (auth.py)
    → Find user
    → Check WebAuthn enrollment
    → Generate challenge (32 bytes)
    → Issue temp login token (exp 5min)
    ↓ Return challenge + stage
    ↓
Frontend
    → If stage = "register": navigator.credentials.create()
    → If stage = "authenticate": navigator.credentials.get()
    ↓ Serialize credential
    ↓ POST /auth/webauthn/verify
    ↓
Backend
    → Verify credential against stored credentials
    → Check sign count
    → Issue access + refresh tokens
    ↓ Return tokens + user
    ↓
Frontend
    → Store tokens (localStorage)
    → Set isAuthenticated = true
    → Navigate to /dashboard or /admin
```

### Evidence Upload Flow
```
Investigator (Browser)
    ↓ Select file + enter metadata
    ↓
Frontend (Evidence.jsx)
    → Compute file hash (SHA-256)
    ↓ POST /api/evidence/upload (multipart)
    ↓
Backend (evidence.py)
    → Validate case ownership
    → Calculate official file hash
    → Retrieve KEM public key
    → KEM Encapsulate → symmetric key
    → AES-256-GCM encrypt(file, key)
    → Dilithium sign(payload)
    ↓ Store encrypted file: storage/evidence/{hash}.enc
    ↓ Create Evidence DB record
    ↓ Create CustodyRecord (upload action)
    ↓ Create AuditLog entry
    ↓ Return Evidence metadata + KEM envelope
    ↓
Frontend
    → Display upload confirmation
    → Show encryption details
```

### Evidence Access Flow
```
Court User (Browser)
    ↓ Request case access
    ↓
Frontend
    → POST /api/evidence/court-access-requests
    ↓
Backend
    → Create CaseAccessRequest (status: pending)
    → Notify admin
    ↓ Response: request submitted
    ↓
Admin (Browser)
    → Review pending requests
    → POST /api/evidence/court-access-requests/{id}/approve
    ↓
Backend
    → Create CaseAccessGrant (expires_at)
    → Update CaseAccessRequest (status: approved)
    ↓ Grant issued
    ↓
Court User
    → GET /api/evidence/cases
    → See granted case in list
    → GET /api/evidence/{case_id} (allowed!)
    → View Evidence list
    → GET /api/evidence/{evidence_id}/content
    ↓
Backend
    → Check CaseAccessGrant (active, not revoked, not expired)
    → Decrypt file (or return KEM envelope)
    → Log in CustodyRecord (download action)
    ↓ Return file
```

---

## 8. CRYPTOGRAPHIC OPERATIONS SUMMARY

### Key Generation (User Registration)
```
Backend receives register request
    ↓
pqc_engine.generate_keypair(algorithm_type="kex")
    → pqc.KeyEncapsulation(kex_algorithm)
    → Generate keypair
    → Return (public_key_b64, secret_key_b64, algorithm)
    → Store secret in key_vault
    → Store public in Database
    ↓
pqc_engine.generate_keypair(algorithm_type="sig")
    → pqc.Signature(sig_algorithm)
    → Generate keypair
    → Return (public_key_b64, secret_key_b64, algorithm)
    → Store secret in key_vault
    → Store public in Database
```

### Evidence Encryption (Upload)
```
1. KEM Encapsulation:
   - pqc.KeyEncapsulation(recipient_public_key)
   - kem.encap(recipient_public_key)
   - Returns: (ciphertext, shared_secret)
   - Ciphertext stored in DB (encryption_key field)

2. Symmetric Encryption (AES-256-GCM):
   - HKDF-SHA256(shared_secret, salt, info, length=32)
   - Generate nonce (12 bytes, random)
   - Encrypt(file_data, aes_key, nonce, associated_data)
   - Returns: (ciphertext, authentication_tag)

3. Signing:
   - Canonical payload = JSON(hash, size, metadata, ...)
   - pqc.Signature(signer_private_key)
   - sig.sign(payload)
   - Returns: signature (base64)

4. Storage:
   - encrypted_data_path = "storage/evidence/{file_hash}.enc" (ciphertext)
   - encryption_key = base64(kem_ciphertext)
   - encryption_iv = base64(nonce)
   - encryption_tag = base64(aead_tag)
   - signature = base64(signature_bytes)
   - signature_public_key = signer's public key
```

### Evidence Decryption (Download)
```
1. Retrieve encryption params:
   - Load Evidence record
   - Get encryption_key (KEM ciphertext)
   - Get encryption_iv (nonce)
   - Get encryption_tag (authentication tag)

2. KEM Decapsulation:
   - pqc.KeyEncapsulation(...)
   - kem.decap(ciphertext, recipient_secret_key)
   - Returns: shared_secret (same as encapsulation)

3. Symmetric Decryption:
   - HKDF-SHA256(shared_secret, salt, info, length=32)
   - Decrypt(ciphertext, aes_key, nonce, authentication_tag)
   - Returns: plaintext (file_data)

4. Signature Verification:
   - Load signature_public_key from Evidence
   - pqc.Signature(...)
   - sig.verify(payload, signature, public_key)
   - Returns: true/false
```

### Algorithms Used
- **KEM:** ML-KEM-768 (or Kyber-768) - 32-byte symmetric key output
- **Signature:** ML-DSA-65 (or Dilithium3) - Quantum-resistant digital signatures
- **Symmetric:** AES-256-GCM - Authenticated encryption
- **KDF:** HKDF-SHA256 - Key derivation
- **Hashing:** SHA-256 (files), SHA3-256 (audit logs)

---

## 9. SUMMARY TABLES

### Database at a Glance
| Table | Records | Purpose |
|-------|---------|---------|
| users | ~10 | User accounts & PQC keys |
| case_files | ~5 | Cases container |
| evidence | ~50 | Encrypted file metadata |
| custody_records | ~200 | Access audit trail |
| case_book_pages | ~30 | Case documents |
| court_access_requests | ~20 | Court requests |
| case_access_grants | ~15 | Active court access |
| audit_logs | ~10K | Complete audit trail (hash-chain) |
| refresh_tokens | ~20 | Active sessions |
| system_heartbeats | ~1440 | 24-hour uptime |
| webauthn_credentials | ~5 | Passkey enrollments |

### API Endpoints Summary
- **Auth:** 9 endpoints (login, logout, token refresh, MFA)
- **Evidence:** 20+ endpoints (upload, download, cases, court access)
- **Admin:** 15+ endpoints (approvals, users, audit, backups, health)
- **Total:** ~45 public endpoints

### File Storage
- **Evidence files:** `storage/evidence/{hash}.enc` (encrypted)
- **Case book pages:** `storage/case_books/{case_id}/page_{num}.{ext}`
- **Key vault:** `secure/key_vault/user_{id}.json.enc` (Fernet-encrypted)
- **Logs:** `logs/app.log` (rotating, max 10MB per file)

### Background Processes
- **Heartbeat:** Every 30 seconds (system load recording)
- **No other scheduled jobs** (synchronous architecture)

---

## 10. SECURITY HIGHLIGHTS

### Encryption-at-Rest
- Private keys: Fernet (AES-128-CBC + HMAC) in key vault
- Evidence files: AES-256-GCM after KEM encapsulation
- Database fields: EncryptedText() columns (AES-256-CBC by default in schema)
- Sensitive DB fields: aadhar_number, ip_address, user_agent in audit logs

### Encryption-in-Transit
- HTTPS enforced (Strict-Transport-Security header)
- JWT tokens in Authorization header or secure cookies
- CORS restricted to configured origins
- CSP headers (script-src 'self', etc.)

### Authentication & Authorization
- WebAuthn/Passkeys required for new enrollments
- PQID MFA for sensitive operations (3 strikes = 24h lockout)
- JWT + Refresh token rotation
- Role-based access (admin, investigator, court_user)

### Audit & Compliance
- Hash-chain integrity for audit logs (SHA3-256)
- Custody records for every evidence access
- Sensitive details encrypted in audit logs
- Request auditing (optional, per API)

### Post-Quantum Cryptography
- ML-KEM-768 for key encapsulation (symmetric key derivation)
- ML-DSA-65 for digital signatures (evidence integrity)
- NIST-standardized algorithms (not pre-standardized)
- Fallback: RSA-2048 for development (insecure mode only)

---

## 11. DEPENDENCIES

**Backend (`requirements.txt`):**
```
Flask==2.3.3
Flask-SQLAlchemy==3.0.5
Flask-JWT-Extended==4.4.4
Flask-CORS==4.0.0
Flask-Limiter==3.8.0
bcrypt==4.0.1
cryptography==41.0.7
python-dotenv==1.0.0
PyJWT==2.8.0
Werkzeug==2.3.7
liboqs-python              ← Post-Quantum Crypto
gunicorn==22.0.0
psycopg2-binary==2.9.9
redis==5.0.8               (optional, for rate limiting)
webauthn==2.2.0            ← FIDO2/Passkey
reportlab==4.1.0
```

**Frontend (`react-app/package.json`):**
```
react
react-router-dom           ← Routing
axios                      ← HTTP client
js-sha3                    ← SHA3 hashing
lucide-react              ← Icons
TailwindCSS               ← Styling
```

---

This analysis provides a complete map of the PQC evidence management system, suitable for creating detailed dataflow diagrams, architecture documentation, and system design specifications.
