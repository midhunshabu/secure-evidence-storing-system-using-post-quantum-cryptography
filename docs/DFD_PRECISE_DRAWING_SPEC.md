# DFD DRAWING SPECIFICATION - Exact Step-by-Step Guide
## PQC Evidence Storing System - Code-Backed Architecture

**Last Updated:** April 15, 2026  
**Based on:** Complete codebase analysis of all 11 database models and 45+ API endpoints

---

## PREREQUISITE: Canvas Setup

**Paper Size:** A3 or 11"×17" (landscape)  
**Grid/Ruler:** Use grid paper or enable guides in digital tool  
**Tools Needed:** 
- Circles (for processes)
- Rectangles (for entities and stores)
- Parallel horizontal lines (for data stores)
- Arrows (solid for data flows, dotted for store access)
- Labels/text boxes

**Scale:** 1 inch = 1 major component

---

# LEVEL 0 DFD - MAIN PROCESSES & DATA STORES

## STEP 1: Draw External Entities (Top of page)

### 1.1 Admin Actor
**Position:** Top-left corner (1 inch from left, 1 inch from top)
**Shape:** Rectangle (2" × 1")
**Label:** "👤 Admin User"
**Inside text:** "Registration, Approval, User Mgmt"

### 1.2 Investigator Actor
**Position:** Top-center (5 inches from left, 1 inch from top)
**Shape:** Rectangle (2" × 1")
**Label:** "👤 Investigator"
**Inside text:** "Upload Evidence, Submit to Court"

### 1.3 Court User Actor
**Position:** Top-right (9 inches from left, 1 inch from top)
**Shape:** Rectangle (2" × 1")
**Label:** "⚖️ Court User"
**Inside text:** "View Evidence, Request Access"

---

## STEP 2: Draw Four Main Processes (Center of page)

### 2.1 Process 1.0: Authentication & Authorization
**Position:** (1 inch from left, 3.5 inches from top)
**Shape:** Circle or large rounded rectangle
**Diameter:** 1.2" × 0.8"
**Label:** "1.0"
**Inside text:** "Auth &\nAuthZ"

### 2.2 Process 2.0: Evidence Management
**Position:** (3.5 inches from left, 3.5 inches from top)
**Shape:** Circle
**Diameter:** 1.2" × 0.8"
**Label:** "2.0"
**Inside text:** "Evidence\nMgmt"

### 2.3 Process 3.0: Admin Oversight
**Position:** (6 inches from left, 3.5 inches from top)
**Shape:** Circle
**Diameter:** 1.2" × 0.8"
**Label:** "3.0"
**Inside text:** "Admin\nOverview"

### 2.4 Process 4.0: Audit & Compliance
**Position:** (8.5 inches from left, 3.5 inches from top)
**Shape:** Circle
**Diameter:** 1.2" × 0.8"
**Label:** "4.0"
**Inside text:** "Audit &\nCompliance"

---

## STEP 3: Draw Five Data Stores (Bottom of page)

### 3.1 D1: User Database
**Position:** (0.5 inches from left, 6 inches from top)
**Shape:** Two horizontal parallel lines (1.8" × 0.5"), data items between them
**Width:** 1.8"
**Label above:** "D1"
**Inside text:** "users, refresh_tokens, webauthn_credentials"
**Key Fields (show):**
```
id | username | role | pqc_kem_public_key | aadhar_hash
is_active | created_at | last_login
```

### 3.2 D2: Evidence Database
**Position:** (2.5 inches from left, 6 inches from top)
**Shape:** Two horizontal parallel lines (2" × 0.5")
**Width:** 2"
**Label above:** "D2"
**Inside text:** "evidence, custody_records, case_files"
**Key Fields (show):**
```
evidence: id | case_id(enc) | filename(enc) | file_hash | kem_ciphertext | 
          approval_status | uploaded_by | access_level

custody_records: evidence_id | user_id | action | timestamp
```

### 3.3 D3: Audit Logs & Monitoring
**Position:** (4.7 inches from left, 6 inches from top)
**Shape:** Two horizontal parallel lines (1.8" × 0.5")
**Width:** 1.8"
**Label above:** "D3"
**Inside text:** "audit_logs, system_heartbeats"
**Key Fields (show):**
```
audit_logs: id | user_id | action | prev_hash | current_hash | timestamp
system_heartbeats: beat_minute | load_pct
```

### 3.4 D4: File Storage (Encrypted)
**Position:** (6.7 inches from left, 6 inches from top)
**Shape:** Two horizontal parallel lines (1.8" × 0.5")
**Width:** 1.8"
**Label above:** "D4"
**Inside text:** "Encrypted Evidence Files"
**Path:** `/backend/storage/evidence/`
**Format:** `{file_hash}.enc` (binary encrypted data)

### 3.5 D5: Key Vault (Encrypted)
**Position:** (8.7 inches from left, 6 inches from top)
**Shape:** Two horizontal parallel lines (1.5" × 0.5")
**Width:** 1.5"
**Label above:** "D5"
**Inside text:** "Encrypted Private Keys"
**Path:** `/backend/secure/key_vault/`
**Format:** `user_{id}.json.enc` (Fernet encrypted JSON)

---

## STEP 4: Draw Data Flows FROM Entities TO Processes

### Flow 4.1: Admin → Process 1.0 (Authentication)
**From point:** Admin rectangle, right edge center
**To point:** Process 1.0, top-left edge
**Arrow style:** SOLID arrow →
**Label:** "Register/Login credentials"
**Additional info:**
- Username, email, password
- Role (admin, investigator, court_user)
- Physical address, identity fields

### Flow 4.2: Admin → Process 1.0 (Return auth)
**From point:** Process 1.0, top-left edge
**To point:** Admin rectangle, right edge center
**Arrow style:** SOLID arrow ←
**Label:** "JWT access token"
**Additional info:**
- Token with admin claims
- Refresh token in httpOnly cookie

### Flow 4.3: Investigator → Process 2.0 (Upload)
**From point:** Investigator rectangle, right edge center
**To point:** Process 2.0, top-center edge
**Arrow style:** SOLID arrow →
**Label:** "Evidence file + metadata"
**Additional info:**
- Multipart form data
- case_id, filename, description, evidence_type
- File binary content (any size)

### Flow 4.4: Process 2.0 → Investigator (Evidence data)
**From point:** Process 2.0, top-center edge
**To point:** Investigator rectangle, right edge center
**Arrow style:** SOLID arrow ←
**Label:** "Encrypted evidence / Confirmation"
**Additional info:**
- Encrypted file access
- Custody record confirmation
- Evidence ID reference

### Flow 4.5: Court User → Process 2.0 (Access request)
**From point:** Court User rectangle, left edge center
**To point:** Process 2.0, right edge (lower half)
**Arrow style:** SOLID arrow →
**Label:** "Case access request"
**Additional info:**
- Case ID or Quantum Ledger Number
- Duration in minutes (1-43200)
- Reason for access

### Flow 4.6: Process 2.0 → Court User (Evidence)
**From point:** Process 2.0, right edge (lower half)
**To point:** Court User rectangle, left edge center
**Arrow style:** SOLID arrow ←
**Label:** "Decrypted evidence (time-limited)"
**Additional info:**
- Plaintext evidence file
- Custody record confirmation
- Access expiry timestamp

### Flow 4.7: Admin → Process 3.0 (Management requests)
**From point:** Admin rectangle, bottom-left
**To point:** Process 3.0, top edge
**Arrow style:** SOLID arrow →
**Label:** "Approve/Reject, User Mgmt, Query requests"
**Additional info:**
- Evidence approval decision
- User activation/deactivation
- Audit log queries
- Health monitoring requests

### Flow 4.8: Process 3.0 → Admin (Responses)
**From point:** Process 3.0, top edge
**To point:** Admin rectangle, bottom-left
**Arrow style:** SOLID arrow ←
**Label:** "Confirmations, Reports, System Health"
**Additional info:**
- Approval confirmations
- Audit reports with hash-chain verification
- System heartbeat data

---

## STEP 5: Draw Data Flows FROM PROCESSES TO DATA STORES (Dotted Lines)

### Flow 5.1: Process 1.0 ↔ D1 (User Database)
**From point:** Process 1.0, bottom edge center
**To point:** D1, top edge center
**Arrow style:** DOTTED line (bidirectional ↔)
**Label (outbound):** "Write: new user, PQC keys"
**Label (return):** "Read: user, password hash"
**Operations:**
- INSERT into users table
- UPDATE last_login, refresh_tokens
- SELECT for login verification

### Flow 5.2: Process 1.0 ↔ D5 (Key Vault)
**From point:** Process 1.0, bottom-right edge
**To point:** D5, top-left edge
**Arrow style:** DOTTED line (bidirectional ↔)
**Label (outbound):** "Write: encrypted private keys"
**Label (return):** "Read: public key for authentication"
**Operations:**
- WRITE user_{id}.json.enc with private KEM/Sig keys
- READ .json.enc to retrieve public keys

### Flow 5.3: Process 1.0 → D3 (Audit Logs)
**From point:** Process 1.0, bottom edge
**To point:** D3 top edge (slightly right)
**Arrow style:** DOTTED line → (one direction)
**Label:** "Write: auth events (login, register, challenge)"
**Operations:**
- INSERT into audit_logs: action=login_success, login_failed, etc.
- Hash-chain: compute SHA3-256(prev_hash | payload)

### Flow 5.4: Process 2.0 ↔ D2 (Evidence Database)
**From point:** Process 2.0, bottom edge
**To point:** D2, top edge
**Arrow style:** DOTTED line (bidirectional ↔)
**Label (outbound):** "Write: evidence metadata, custody records"
**Label (return):** "Read: evidence, case, access control"
**Operations:**
- INSERT evidence with encryption metadata
- INSERT custody_records for each access
- SELECT for evidence retrieval (apply role filter)
- UPDATE approval_status

### Flow 5.5: Process 2.0 ↔ D4 (File Storage)
**From point:** Process 2.0, bottom-right edge
**To point:** D4, top edge
**Arrow style:** DOTTED line (bidirectional ↔)
**Label (outbound):** "Write: encrypted evidence file"
**Label (return):** "Read: encrypted file blob"
**Operations:**
- WRITE binary encrypted file to disk: {file_hash}.enc
- READ encrypted file for decryption

### Flow 5.6: Process 2.0 ↔ D5 (Key Vault)
**From point:** Process 2.0, bottom-right edge
**To point:** D5, top edge
**Arrow style:** DOTTED line (bidirectional ↔)
**Label (outbound):** "Write: new keys (if multi-key)"
**Label (return):** "Read: public/private keys (paired)"
**Operations:**
- READ user_{id}.json.enc during upload (get uploader's public key)
- READ user_{id}.json.enc during download (get recipient's private key for decryption)
- WRITE new key upon user registration

### Flow 5.7: Process 2.0 → D3 (Audit Logs)
**From point:** Process 2.0, bottom edge
**To point:** D3, top edge (right of 5.3)
**Arrow style:** DOTTED line →
**Label:** "Write: evidence actions (upload, view, download, approve)"
**Operations:**
- INSERT evidence_upload, evidence_view, evidence_download
- Compute hash-chain integrity

### Flow 5.8: Process 3.0 ↔ D1 (User Database)
**From point:** Process 3.0, bottom-left edge
**To point:** D1, top-right edge
**Arrow style:** DOTTED line (bidirectional ↔)
**Label (outbound):** "Write: user activation, deactivation, approval"
**Label (return):** "Read: user list, role verification"
**Operations:**
- UPDATE is_active, approval_status
- SELECT users filtered by role
- UPDATE aadhar verification status

### Flow 5.9: Process 3.0 ↔ D2 (Evidence Database)
**From point:** Process 3.0, bottom edge
**To point:** D2, top-right edge
**Arrow style:** DOTTED line (bidirectional ↔)
**Label (outbound):** "Write: approval decisions, signatures"
**Label (return):** "Read: pending evidence, case status"
**Operations:**
- UPDATE evidence.approval_status = approved/rejected
- UPDATE evidence.approved_by = admin_id
- INSERT approval_signature
- SELECT pending evidence for admin review

### Flow 5.10: Process 3.0 ↔ D3 (Audit Logs)
**From point:** Process 3.0, bottom-right edge
**To point:** D3, top-right edge
**Arrow style:** DOTTED line (bidirectional ↔)
**Label (outbound):** "Write: admin actions"
**Label (return):** "Read: audit logs for verification/reports"
**Operations:**
- INSERT admin_approve, user_deactivate, etc.
- SELECT audit_logs with hash-chain verification
- Compute: expected_hash = SHA3-256(prev_hash | payload)
- Compare: expected_hash vs stored current_hash

### Flow 5.11: Process 4.0 ← D3 (Audit Logs)
**From point:** D3, bottom-left edge
**To point:** Process 4.0, bottom edge
**Arrow style:** DOTTED line ←
**Label:** "Read: all audit logs for compliance"
**Operations:**
- SELECT ALL audit_logs ORDER BY created_at
- Verify SHA3-256 hash chain (detect tampering)
- Generate compliance reports

### Flow 5.12: Process 4.0 → D3 (System Events)
**From point:** Process 4.0, bottom edge
**To point:** D3, bottom-right edge
**Arrow style:** DOTTED line →
**Label:** "Write: tamper alerts, verification status"
**Operations:**
- INSERT audit_log if hash mismatch detected
- Update system_heartbeats if running verification

---

## STEP 6: Add Process-to-Process Flows (Optional)

### Flow 6.1: Process 1.0 → Process 3.0 (User provisioning)
**From point:** Process 1.0, right edge
**To point:** Process 3.0, left edge (top half)
**Arrow style:** SOLID line →
**Label:** "New user created (awaiting admin verification)"

### Flow 6.2: Process 2.0 → Process 3.0 (Approval queue)
**From point:** Process 2.0, right edge
**To point:** Process 3.0, left edge (bottom half)
**Arrow style:** SOLID line →
**Label:** "Pending evidence (requires approval)"

### Flow 6.3: Process 3.0 → Process 4.0 (Compliance link)
**From point:** Process 3.0, bottom-right edge
**To point:** Process 4.0, top-left edge
**Arrow style:** SOLID line →
**Label:** "Admin decisions logged"

---

## STEP 7: Add Legend (Bottom-right corner)

**Box:** 2" × 2"
**Position:** Bottom-right of page

**Legend Content:**
```
┌─ LEGEND ──────────────────────┐
│                               │
│  ○  = Process (transformation)│
│  ▭  = External Entity (actor) │
│  ═══ = Data Store (persistent)│
│  ─→  = Solid Flow (data)      │
│  ···→ = Dotted Flow (store)   │
│  ↔   = Bidirectional flow     │
│                               │
│  D1, D2... = Data Store IDs   │
│  1.0, 2.0... = Process IDs    │
└───────────────────────────────┘
```

---

## STEP 8: Add Title and Metadata

**Top of page:**
- **Title:** "PQC Evidence Storing System - Level 0 DFD"
- **Subtitle:** "Main Processes & Data Repository"
- **Date:** April 15, 2026
- **Version:** 1.0

**Bottom-left:**
- **Author/Team:**
- **System Boundary:** (draw dashed box around processes if desired)

---

# LEVEL 1 DFD - PROCESS 1.0 (Authentication & Authorization)

## NEW PAGE - Portrait Orientation

---

## STEP 1: Draw Context Box (Top of page)

**Position:** Top center (4" from left, 0.5" from top)
**Shape:** Large rectangle
**Size:** 6" × 1"
**Label:** "Process 1.0: Authentication & Authorization"
**Subtitle:** "Sub-processes for user identity and access token management"

---

## STEP 2: Draw External Entities (Left & Right edges)

### 2.1 Admin/User (Left)
**Position:** Left edge (0.5" from left, 2.5" from top)
**Shape:** Rectangle (1.5" × 0.8")
**Label:** "👤 Admin/User"
**Flows to/from:** Will connect to sub-processes

### 2.2 PQC Engine (Right)
**Position:** Right edge (8" from left, 2.5" from top)
**Shape:** Rectangle (1.5" × 0.8")
**Label:** "[PQC Engine]"
**Inside:** "KEM, DSA\nliboqs"
**Note:** Cryptographic module (not user, not process)

---

## STEP 3: Draw 5 Sub-Processes (Center, arranged vertically)

### 3.1 Process 1.1: Register User
**Position:** (2.5" from left, 1.5" from top)
**Shape:** Circle
**Size:** 1" diameter
**Label:** "1.1"
**Inside:** "Register\nUser"

### 3.2 Process 1.2: Generate PQC Keys
**Position:** (5" from left, 1.5" from top)
**Shape:** Circle
**Size:** 1" diameter
**Label:** "1.2"
**Inside:** "Generate\nPQC Keys"

### 3.3 Process 1.3: Login Verification
**Position:** (2.5" from left, 3" from top)
**Shape:** Circle
**Size:** 1" diameter
**Label:** "1.3"
**Inside:** "Login\nVerify"

### 3.4 Process 1.4: Token Generation
**Position:** (5" from left, 3" from top)
**Shape:** Circle
**Size:** 1" diameter
**Label:** "1.4"
**Inside:** "Generate\nJWT Token"

### 3.5 Process 1.5: Refresh Token Rotation
**Position:** (3.75" from left, 4.5" from top)
**Shape:** Circle
**Size:** 1" diameter
**Label:** "1.5"
**Inside:** "Refresh\nToken"

---

## STEP 4: Draw SUB-PROCESS to SUB-PROCESS Flows

### Flow 4.1: User → 1.1 (Registration Input)
**From:** Admin/User box, right edge
**To:** Process 1.1, left edge
**Arrow:** SOLID →
**Label:** "username, email, password, role, identity fields"
**Includes:**
- address, phone_number
- is_physically_verified flag
- aadhar_number (12 digits)
- designation (court only), station_name (investigator only)

### Flow 4.2: 1.1 → 1.2 (Proceed to keygen)
**From:** Process 1.1, right edge
**To:** Process 1.2, bottom-left edge
**Arrow:** SOLID →
**Label:** "Validated user data, role"

### Flow 4.3: 1.2 → PQC Engine (Generate keys)
**From:** Process 1.2, right edge
**To:** PQC Engine, left edge
**Arrow:** SOLID →
**Label:** "Generate ML-KEM-768, ML-DSA-65 keys"
**Includes:**
- algorithm selection (prefers strongest available)
- random seed for key generation

### Flow 4.4: PQC Engine → 1.2 (Keys generated)
**From:** PQC Engine, left edge
**To:** Process 1.2, right edge
**Arrow:** SOLID ←
**Label:** "KeyPair: (public_key, private_key)"
**Includes:**
- KEM public key (for encapsulation by others)
- KEM private key (for decapsulation)
- Signature public key (for verification)
- Signature private key (for signing)

### Flow 4.5: 1.2 → 1.4 (Ready to issue token)
**From:** Process 1.2, bottom-right edge
**To:** Process 1.4, top edge
**Arrow:** SOLID →
**Label:** "PQC KeyPair created"

### Flow 4.6: User → 1.3 (Login Attempt)
**From:** Admin/User box, right edge (lower)
**To:** Process 1.3, left edge
**Arrow:** SOLID →
**Label:** "username/pqid, password"
**Includes:**
- Username OR PQID (alternative login)
- Password plaintext
- (Optional) PQID signature if using challenge-response

### Flow 4.7: 1.3 → 1.4 (Credentials verified)
**From:** Process 1.3, right edge
**To:** Process 1.4, left edge (lower)
**Arrow:** SOLID →
**Label:** "Credentials valid, user_id, role"

### Flow 4.8: 1.4 → User (JWT Token)
**From:** Process 1.4, left edge (upper)
**To:** Admin/User box, right edge
**Arrow:** SOLID ←
**Label:** "access_token (JWT), refresh_token (cookie)"
**Includes:**
- JWT expires_in: 1 hour (default)
- Refresh token TTL: 7 days
- httpOnly, Secure cookie flags

### Flow 4.9: User → 1.5 (Refresh request)
**From:** Admin/User box, right edge (bottom)
**To:** Process 1.5, left edge
**Arrow:** SOLID →
**Label:** "refresh_token cookie"

### Flow 4.10: 1.5 → 1.4 (Request new token)
**From:** Process 1.5, right edge
**To:** Process 1.4, bottom edge
**Arrow:** SOLID →
**Label:** "refresh_token jti_hash, rotation"

### Flow 4.11: 1.4 → 1.5 (New tokens issued)
**From:** Process 1.4, bottom edge
**To:** Process 1.5, right edge
**Arrow:** SOLID ←
**Label:** "new access_token, new refresh_token"

### Flow 4.12: 1.5 → User (Rotated Token)
**From:** Process 1.5, right edge (bottom)
**To:** Admin/User box, right edge
**Arrow:** SOLID ←
**Label:** "new access_token, new refresh_token"

---

## STEP 5: Draw Data Store Accesses (Bottom, Dotted Lines)

### Box with Data Stores:
**Position:** Bottom of page (3" from top)
**Shows:** D1, D3, D5 (the ones Process 1.0 uses)

### 5.1: 1.1 ↔ D1 (Write new user)
**From:** Process 1.1, bottom edge
**To:** D1, top-left edge
**Arrow:** DOTTED ↔
**Label (out):** "INSERT user: username, email, role, is_physically_verified"
**Label (return):** "user_id, confirmation"

### 5.2: 1.2 ↔ D5 (Store encrypted keys)
**From:** Process 1.2, bottom edge
**To:** D5, top-center edge
**Arrow:** DOTTED ↔
**Label (out):** "WRITE user_{id}.json.enc with private keys"
**Label (return):** "Key vault URL confirmation"
**Includes:**
- Fernet encryption with KEY_VAULT_MASTER_KEY
- JSON structure: {user_id, private_key_pem, public_key_pem, algorithm, version}

### 5.3: 1.3 ↔ D1 (Verify credentials)
**From:** Process 1.3, bottom edge
**To:** D1, top-right edge
**Arrow:** DOTTED ↔
**Label (out):** "SELECT user WHERE username=? OR pqid=?"
**Label (return):** "user record (id, password_hash, role, pqid_failed_attempts)"
**Includes:**
- Lookup by username OR pqid
- Check is_active flag
- Check pqid_locked_until for lockout

### 5.4: 1.4 ↔ D1 (Update JWT session)
**From:** Process 1.4, bottom edge
**To:** D1, top edge (center-right)
**Arrow:** DOTTED ↔
**Label (out):** "INSERT/UPDATE refresh_tokens, UPDATE users.last_login"
**Label (return):** "jti_hash, expires_at confirmation"
**Includes:**
- jti_hash = SHA256(JWT jti)
- created_ip, user_agent stored
- last_used_at tracked

### 5.5: 1.5 ↔ D1 (Validate refresh token)
**From:** Process 1.5, bottom edge
**To:** D1, top edge (center-left)
**Arrow:** DOTTED ↔
**Label (out):** "SELECT refresh_tokens WHERE jti_hash=?"
**Label (return):** "Token status (revoked_at, expires_at)"
**Includes:**
- Check revoked_at IS NULL
- Check expires_at > NOW()
- Check replaced_by_hash for rotation chain

### 5.6: All → D3 (Log auth events)
**From:** All processes (1.1, 1.3, 1.4, 1.5), bottom edge
**To:** D3
**Arrow:** DOTTED →
**Label:** "INSERT audit_logs: action, status, error (if any)"
**Includes:**
- action: register, login_attempt, login_success, login_failure, token_refresh
- status: success, failure
- error_message (encrypted if failure)
- prev_hash, current_hash (hash-chain integrity)

---

## STEP 6: Add Detailed Legends

### Left sidebar: "Data Inputs"
```
USERNAME
EMAIL
PASSWORD (plaintext)
ROLE
IDENTITY:
  - address
  - phone_number
  - aadhar_number
  - designation
  - station_name
PQID
```

### Right sidebar: "Data Outputs"
```
JWT ACCESS TOKEN:
  - exp: 1 hour
  - sub: user_id
  - role: admin/investigator/...

REFRESH TOKEN:
  - exp: 7 days
  - jti: unique ID
  - httpOnly: true
  - Secure: true

KEYPA IR (stored in D5):
  - ML-KEM-768 (public/private)
  - ML-DSA-65 (public/private)
```

---

# LEVEL 1 DFD - PROCESS 2.0 (Evidence Management)

## NEW PAGE - Landscape, portrait rotation

---

## STEP 1: Draw Main Flow (3 sections left-to-right)

### Section A: Evidence Upload (Left third)
### Section B: Custody & Status (Center third)
### Section C: Evidence Retrieval (Right third)

---

## STEP 2: Draw External Entities (Top)

### 2.1 Investigator (left)
**Position:** (1" from left, 0.5" from top)
**Shape:** Rectangle (1.5" × 0.8")

### 2.2 Court User (right)
**Position:** (8.5" from left, 0.5" from top)
**Shape:** Rectangle (1.5" × 0.8")

### 2.3 Admin (center-top)
**Position:** (5" from left, 0.5" from top)
**Shape:** Rectangle (1.5" × 0.8")
**Label:** "Admin\n(Approval)"

---

## STEP 3: Draw 4 Main Sub-Processes

### 3.1 Process 2.1: Upload & Encrypt Evidence
**Position:** (1.5" from left, 2" from top)
**Shape:** Circle (1.2" diameter)
**Label:** "2.1"

### 3.2 Process 2.2: Generate Custody Record
**Position:** (3.75" from left, 2" from top)
**Shape:** Circle (1.2" diameter)
**Label:** "2.2"

### 3.3 Process 2.3: Retrieve & Decrypt Evidence
**Position:** (6" from left, 2" from top)
**Shape:** Circle (1.2" diameter)
**Label:** "2.3"

### 3.4 Process 2.4: Submit Evidence to Court
**Position:** (3.75" from left, 4.5" from top)
**Shape:** Circle (1.2" diameter)
**Label:** "2.4"

---

## STEP 4: Draw UPLOAD Flow (2.1 - Section A)

### Flow A.1: Investigator → 2.1
**From:** Investigator box, bottom-right edge
**To:** Process 2.1, top-left edge
**Arrow:** SOLID →
**Label:** "Evidence file (multipart) + metadata"
**Details:**
- form field: file (binary, any type)
- form field: case_id (encrypted transfer)
- form field: case_file_id (UUID)
- form field: evidence_type (image/video/document)
- form field: description
- form field: custody_notes

### Flow A.2: 2.1 → 2.2
**From:** Process 2.1, right edge
**To:** Process 2.2, left edge
**Arrow:** SOLID →
**Label:** "File validated, metadata prepared"
**Details:**
- file_hash (SHA-256)
- KEM ciphertext from encapsulation
- IV, tag from AES-256-GCM
- Digital signature from ML-DSA

### Flow A.3: 2.2 → Investigator
**From:** Process 2.2, top-left edge
**To:** Investigator box, bottom-right edge
**Arrow:** SOLID ←
**Label:** "Confirmation: evidence_id, custody_record_id"
**Details:**
- evidence UUID
- upload timestamp
- approval_status: "pending"

---

## STEP 5: Draw CUSTODY & APPROVAL Flow (2.2, 2.4)

### Flow B.1: 2.2 → Admin
**From:** Process 2.2, right edge
**To:** Admin box, bottom-center edge
**Arrow:** SOLID →
**Label:** "Pending evidence (approval queue)"
**Details:**
- List of pending evidence
- Metadata summary
- Uploader identity

### Flow B.2: Admin → 2.4
**From:** Admin box, bottom-center edge
**To:** Process 2.4, top edge
**Arrow:** SOLID →
**Label:** "Approval decision (approve/reject)"
**Details:**
- evidence_id
- decision: approved / rejected
- approval_notes
- admin_id
- Admin signature (optional)

### Flow B.3: 2.4 → Admin (Confirmation)
**From:** Process 2.4, top edge
**To:** Admin box, bottom-center edge
**Arrow:** SOLID ←
**Label:** "Status updated, signature stored"

---

## STEP 6: Draw RETRIEVAL Flow (2.3 - Section C)

### Flow C.1: Court User → 2.3
**From:** Court User box, bottom-left edge
**To:** Process 2.3, top-right edge
**Arrow:** SOLID →
**Label:** "Access request: evidence_id, case_id"
**Details:**
- evidence_id or
- case_number or
- quantum_ledger_number
- access_grant_id (time-limited)

### Flow C.2: 2.3 → Court User
**From:** Process 2.3, top-right edge
**To:** Court User box, bottom-left edge
**Arrow:** SOLID ←
**Label:** "Decrypted evidence file"
**Details:**
- plaintext evidence content
- access_expires_at (timestamp)
- signed receipt (audit)

### Flow C.3: Investigator ↔ 2.3 (Alternative)
**From:** Investigator box, bottom-center
**To:** Process 2.3, left edge
**Arrow:** SOLID ↔
**Label:** "Retrieve own evidence"
**Details:**
- Can retrieve own uploaded evidence
- Shares same decryption process as court_user

---

## STEP 7: Draw Data Store Accesses (Bottom half)

### Data Stores Row:
**Position:** (y = 5.5")
- D1 (left): User verification
- D2 (center-left): Evidence metadata  
- D4 (center-right): File storage
- D5 (right): Key vault

### 7.1: 2.1 ↔ D1 (Verify uploader)
**Label (out):** "SELECT users WHERE id=? (uploader)"
**Label (return):** "user record, role verification"

### 7.2: 2.1 → D2 (Write evidence metadata)
**Label (out):** "INSERT evidence: case_id, filename, file_hash, kem_ciphertext, iv, tag, signature"
**Details:**
- kem_ciphertext: KEM encapsulation (1088 bytes for ML-KEM-768)
- iv: AES initialization vector (12 bytes, random)
- tag: AEAD authentication tag (16 bytes, from AES-GCM)
- signature: ML-DSA signature (4595 bytes for ML-DSA-65)

### 7.3: 2.1 → D4 (Write encrypted file)
**Label (out):** "WRITE binary file to disk: {file_hash}.enc"
**Details:**
- Encrypted file path: /backend/storage/evidence/{file_hash}.enc
- File content: AES-256-GCM ciphertext
- Indexed by SHA-256 hash

### 7.4: 2.1 ↔ D5 (Get uploader's public key)
**Label (out):** "READ user_{id}.json.enc (Fernet decrypt)"
**Label (return):** "pqc_kem_public_key for KEM encapsulation"
**Details:**
- Unlock with KEY_VAULT_MASTER_KEY
- Extract pqc_kem_public_key (for KEM.encapsulate)
- Only use public key in upload process

### 7.5: 2.2 ↔ D2 (Write custody record)
**Label (out):** "INSERT custody_records: evidence_id, user_id, action='upload', timestamp"
**Label (return):** "custody_record_id confirmation"

### 7.6: 2.3 ↔ D1 (Check access rights)
**Label (out):** "SELECT users WHERE id=?, check role & access_level"
**Label (return):** "user record with access permissions"
**Details:**
- Investigator: can retrieve own evidence
- Court user: must have active CaseAccessGrant
- Admin: unrestricted

### 7.7: 2.3 ↔ D2 (Get evidence metadata)
**Label (out):** "SELECT evidence WHERE id=? AND approval_status='approved'"
**Label (return):** "evidence record with kem_ciphertext, iv, tag, signature"

### 7.8: 2.3 ↔ D4 (Read encrypted file)
**Label (out):** "READ {file_hash}.enc from disk"
**Label (return):** "AES-256-GCM ciphertext bytes"

### 7.9: 2.3 ↔ D5 (Get recipient's private key)
**Label (out):** "READ user_{id}.json.enc (Fernet decrypt)"
**Label (return):** "pqc_kem_private_key for KEM.decapsulate"
**Details:**
- Unlock with KEY_VAULT_MASTER_KEY
- Extract pqc_kem_private_key
- CRITICAL: Only done for authorized users

### 7.10: All (2.1, 2.2, 2.3, 2.4) → D3 (Audit trail)
**Label:** "INSERT audit_logs: action=upload/view/download/approve, status, timestamp"
**Details:**
- prev_hash from last audit log
- current_hash = SHA3-256(prev_hash | payload)
- Hash-chain enables tamper detection

### 7.11: 2.4 ↔ D2 (Update approval status)
**Label (out):** "UPDATE evidence SET approval_status='approved', approved_by=?, signature=?"
**Label (return):** "Confirmation"

---

# LEVEL 1 DFD - PROCESS 3.0 (Admin Oversight)

## NEW PAGE

---

## STEP 1: Draw Admin Context

### 1.1 Admin Entity (Top)
**Position:** (5" from left, 0.5" from top)
**Shape:** Rectangle (2" × 0.8")
**Label:** "👤 Admin User"

---

## STEP 2: Draw 4 Sub-Processes (2x2 grid)

### 2.1 Process 3.1: Evidence Approval/Rejection
**Position:** (1.5" from left, 2" from top)
**Shape:** Circle (1.2")
**Label:** "3.1"

### 2.2 Process 3.2: User Management
**Position:** (4" from left, 2" from top)
**Shape:** Circle (1.2")
**Label:** "3.2"

### 2.3 Process 3.3: System Health Monitoring
**Position:** (1.5" from left, 4" from top)
**Shape:** Circle (1.2")
**Label:** "3.3"

### 2.4 Process 3.4: Audit Report Generation
**Position:** (4" from left, 4" from top)
**Shape:** Circle (1.2")
**Label:** "3.4"

---

## STEP 3: Draw Admin Flows

### 3.1: Admin → 3.1 (Review pending evidence)
**Arrow:** SOLID →
**Label:** "Pending evidence list"

### 3.2: 3.1 → Admin (Approval result)
**Arrow:** SOLID ←
**Label:** "Evidence approved/rejected"

### 3.3: Admin → 3.2 (User operations)
**Arrow:** SOLID →
**Label:** "Create/activate/deactivate users"

### 3.4: 3.2 → Admin (User status)
**Arrow:** SOLID ←
**Label:** "User created, roles assigned"

### 3.5: Admin → 3.3 (Health query)
**Arrow:** SOLID →
**Label:** "Get system status"

### 3.6: 3.3 → Admin (Health report)
**Arrow:** SOLID ←
**Label:** "System load, uptime, heartbeats"

### 3.7: Admin → 3.4 (Audit query)
**Arrow:** SOLID →
**Label:** "Generate audit report"

### 3.8: 3.4 → Admin (Compliance report)
**Arrow:** SOLID ←
**Label:** "Audit logs with hash-chain verification"

---

## STEP 4: Draw Data Store Accesses (Bottom)

### 4.1: 3.1 ↔ D2 (Evidence approval)
**Label (out):** "SELECT evidence WHERE approval_status='pending'"
**Label (return):** "UPDATE evidence SET approval_status='approved', approved_by=?"

### 4.2: 3.2 ↔ D1 (User management)
**Label (out):** "SELECT users OR INSERT new user OR UPDATE is_active"
**Label (return):** "USER records"

### 4.3: 3.3 ↔ D3 (Health check)
**Label (out):** "SELECT system_heartbeats ORDER BY beat_minute DESC LIMIT 1"
**Label (return):** "load_pct, timestamp"

### 4.4: 3.4 ↔ D3 (Audit verification)
**Label (out):** "SELECT audit_logs ORDER BY created_at"
**Label (return):** "Full audit trail"
**Details:**
- Verify: expected_hash = SHA3-256(prev_hash | payload)
- Compare: expected_hash vs stored current_hash
- Flag any mismatches

### 4.5: 3.1 → D3 (Log approval)
**Label:** "INSERT audit_log: action=evidence_approval, status=success"

### 4.6: 3.2 → D3 (Log user changes)
**Label:** "INSERT audit_log: action=user_create/deactivate"

---

# LEVEL 2 DFD - PROCESS 2.1 (Evidence Upload & Encryption)

## NEW PAGE - Detail flow with cryptographic steps

---

## STEP 1: Draw Header

**Title:** "Process 2.1: Upload & Encrypt Evidence - Detailed Cryptographic Flow"
**Subtitle:** "Post-Quantum Key Encapsulation + AES-256-GCM Encryption"

---

## STEP 2: Draw 6 Detailed Sub-Steps (Vertical cascade)

### 2.1: 2.1.1 - Validate File
**Position:** (4" from left, 1" from top)
**Shape:** Box (not circle, showing sequential processing)
**Size:** 2" × 0.6"
**Inside:**
```
2.1.1
Validate File
- Check size, extension
- Scan for malware
- Verify MIME type
```

### 2.2: 2.1.2 - Retrieve Public Key
**Position:** (4" from left, 1.8" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.1.2
Retrieve Public Key
- Query D5 (key vault)
- Get uploader's KEM public key
- Algorithm: ML-KEM-768
```

### 2.3: 2.1.3 - Generate Shared Secret
**Position:** (4" from left, 2.6" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.1.3
Generate Shared Secret
- KEM.encapsulate(public_key)
- Output: KEM ciphertext + shared_secret
```

### 2.4: 2.1.4 - Encrypt File
**Position:** (4" from left, 3.4" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.1.4
Encrypt File (AES-256-GCM)
- HKDF-SHA256(shared_secret) → AES key
- Generate random IV (12 bytes)
- AES.encrypt(file, key, IV)
- Output: IV, ciphertext, tag
```

### 2.5: 2.1.5 - Sign Metadata
**Position:** (4" from left, 4.2" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.1.5
Sign Metadata
- Canonical JSON of evidence metadata
- ML-DSA.sign(payload, private_key)
- Output: Signature (4595 bytes)
```

### 2.6: 2.1.6 - Store Records
**Position:** (4" from left, 5" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.1.6
Store Evidence Record
- Write to D2 (metadata)
- Write to D4 (file)
- Log to D3 (audit)
```

---

## STEP 3: Draw Crypto Module Boxes (Right side)

### 3.1 KEM Module (liboqs)
**Position:** (7.5" from left, 2.6" from top)
**Shape:** Rectangle with dashed border (1.8" × 0.8")
**Inside:**
```
[KEM ENGINE]
liboqs ML-KEM
- encapsulate(pk)
  → (ct, ss)
- decapsulate(ct, sk)
  → ss
```

### 3.2 HKDF Module
**Position:** (7.5" from left, 3.4" from top)
**Shape:** Rectangle with dashed border (1.8" × 0.8")
**Inside:**
```
[HKDF-SHA256]
Key Derivation
- Input: shared_secret (32 bytes)
- Output: AES-256 key (32 bytes)
```

### 3.3 AES Module
**Position:** (7.5" from left, 4.2" from top)
**Shape:** Rectangle with dashed border (1.8" × 0.8")
**Inside:**
```
[AES-256-GCM]
Symmetric Encryption
- Mode: GCM (Galois)
- IV: 12 bytes random
- Tag: 16 bytes auth
```

### 3.4 Signature Module
**Position:** (7.5" from left, 5" from top)
**Shape:** Rectangle with dashed border (1.8" × 0.8")
**Inside:**
```
[ML-DSA-65]
Digital Signature
- Algorithm: Dilithium
- Signature size: 4595 bytes
```

---

## STEP 4: Draw Connections to Crypto Modules

### 4.1: 2.1.3 → KEM
**Arrow:** SOLID →
**Label:** "public_key (1184 bytes)"

### 4.2: KEM → 2.1.3
**Arrow:** SOLID ←
**Label:** "kem_ciphertext (1088 bytes), shared_secret (32 bytes)"

### 4.3: 2.1.4 → HKDF
**Arrow:** SOLID →
**Label:** "shared_secret"

### 4.4: HKDF → 2.1.4
**Arrow:** SOLID ←
**Label:** "aes_key (32 bytes)"

### 4.5: 2.1.4 → AES
**Arrow:** SOLID →
**Label:** "plaintext file, aes_key, IV"

### 4.6: AES → 2.1.4
**Arrow:** SOLID ←
**Label:** "ciphertext, tag (16 bytes)"

### 4.7: 2.1.5 → Signature
**Arrow:** SOLID →
**Label:** "metadata_json, private_sig_key"

### 4.8: Signature → 2.1.5
**Arrow:** SOLID ←
**Label:** "signature (4595 bytes)"

---

## STEP 5: Draw Data Store Flows (Left side)

### 5.1: 2.1.2 → D5
**Arrow:** DOTTED ←
**Label:** "Query user_{uploader_id}.json.enc"

### 5.2: 2.1.2 ← D5
**Arrow:** DOTTED →
**Label:** "pqc_kem_public_key (1184 bytes)"

### 5.3: 2.1.6 → D2
**Arrow:** DOTTED →
**Label:** "INSERT evidence (case_id, filename, file_hash, kem_ciphertext, iv, tag, signature)"

### 5.4: 2.1.6 → D4
**Arrow:** DOTTED →
**Label:** "WRITE {file_hash}.enc (binary ciphertext)"

### 5.5: 2.1.6 → D3
**Arrow:** DOTTED →
**Label:** "INSERT audit_log (action=evidence_upload)"

---

## STEP 6: Add Data Specifications Tables (Bottom)

### Table 1: Input Data
```
┌─ INPUT (from 2.1.1) ──────────────────────┐
│ Original Evidence File:                   │
│  - file_hash: SHA-256(content)           │
│  - file_size: variable                   │
│  - mime_type: video/image/document/etc   │
│                                          │
│ Metadata:                                 │
│  - case_id (string, will encrypt)        │
│  - uploaded_by (user_id)                 │
│  - evidence_type (string)                │
│  - description (string)                  │
└──────────────────────────────────────────┘
```

### Table 2: Output Data (Stored in D2)
```
┌─ OUTPUT (Stored in D2 Evidence Row) ──────┐
│ kem_ciphertext (1088 bytes)              │
│ encryption_iv (12 bytes, base64)         │
│ encryption_tag (16 bytes, base64)        │
│ signature (4595 bytes, base64)           │
│ file_hash (64 hex chars)                 │
│ approval_status: 'pending'               │
│ access_level: 'restricted'               │
└──────────────────────────────────────────┘
```

### Table 3: File Storage (D4)
```
┌─ FILE STORAGE (D4) ────────────────────────┐
│ Disk Path: /backend/storage/evidence/     │
│ Filename: {file_hash}.enc                 │
│ Format: Binary AES-256-GCM ciphertext    │
│ Size: ~= original_size + 16 bytes (tag)  │
│ Access: Read-only by decryption processes │
└────────────────────────────────────────────┘
```

---

## STEP 7: Add Encryption Algorithm Details (Right sidebar)

```
CRYPTOGRAPHIC PARAMETERS
────────────────────────────
KEM: ML-KEM-768
  - Key size: 1184 bytes
  - Ciphertext: 1088 bytes
  - Shared secret: 32 bytes
  
HKDF:  HKDF-SHA256
  - Hash: SHA-256
  - Output: 32 bytes (for AES-256)
  
AES:  AES-256-GCM
  - Cipher: AES block cipher
  - Mode: GCM (Galois Counter Mode)
  - Key: 256 bits (32 bytes)
  - IV: 96 bits (12 bytes, random)
  - Auth Tag: 128 bits (16 bytes)
  
Signature: ML-DSA-65
  - Algorithm: Dilithium
  - Signature size: 4595 bytes
  - Public key: 2592 bytes
  - Private key: 4032 bytes
```

---

# LEVEL 2 DFD - PROCESS 2.3 (Evidence Retrieval & Decryption)

## NEW PAGE - Reverse crypto flow

---

## SECTION 1: Title & Overview

**Title:** "Process 2.3: Retrieve & Decrypt Evidence - Detailed Flow"
**Subtitle:** "Post-Quantum KEM Decapsulation + AES-256-GCM Decryption"
**Key Point:** "Reverse of 2.1 encryption process"

---

## SECTION 2: Seven Sequential Steps (Vertical)

### 2.1: 2.3.1 - Verify Access Rights
**Position:** (4" from left, 1" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.3.1
Verify Access Rights
- Query D1: user role
- Check evidence.access_level
- Compare: user role vs access_level
- Result: grant or deny
```

### 2.2: 2.3.2 - Retrieve Evidence Metadata
**Position:** (4" from left, 1.8" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.3.2
Retrieve Metadata
- Query D2 evidence record
- Extract: kem_ciphertext, iv, tag
- Extract: signature, file_hash
```

### 2.3: 2.3.3 - Retrieve Encrypted File
**Position:** (4" from left, 2.6" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.3.3
Retrieve Encrypted File
- Query D4: read {file_hash}.enc
- Read AES-256-GCM ciphertext
- Obtain encrypted bytes
```

### 2.4: 2.3.4 - Get Private Key
**Position:** (4" from left, 3.4" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.3.4
Get Private Key
- Query D5: user_{recipient_id}.json.enc
- Fernet decrypt with KEY_VAULT_MASTER_KEY
- Extract pqc_kem_private_key
```

### 2.5: 2.3.5 - Decrypt KEM Ciphertext
**Position:** (4" from left, 4.2" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.3.5
Decrypt KEM Ciphertext
- KEM.decapsulate(kem_ct, private_key)
- Recover: shared_secret (32 bytes)
- Note: MUST match original sender's
```

### 2.6: 2.3.6 - Decrypt File (AES-GCM)
**Position:** (4" from left, 5" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.3.6
Decrypt File (AES-GCM)
- HKDF-SHA256(shared_secret) → AES key
- AES.decrypt(ciphertext, key, IV, tag)
- Verify tag (fail if mismatch)
- Output: plaintext file
```

### 2.7: 2.3.7 - Verify Signature
**Position:** (4" from left, 5.8" from top)
**Shape:** Box (2" × 0.6")
**Inside:**
```
2.3.7
Verify Signature
- ML-DSA.verify(sig, metadata, pub_key)
- Compare computed vs received signature
- Result: verified or tampered
```

---

## SECTION 3: Crypto Module Boxes (Right)

### 3.1 KEM Decapsulation
**Position:** (7.5" from left, 4.2" from top)
**Label:** "[KEM Decapsulate]"

### 3.2 HKDF (same as upload)
**Position:** (7.5" from left, 5" from top)

### 3.3 AES Decryption
**Position:** (7.5" from left, 5.8" from top)
**Label:** "[AES-256-GCM Decrypt]"

### 3.4 Signature Verification
**Position:** (7.5" from left, 6.6" from top)
**Label:** "[ML-DSA Verify]"

---

## SECTION 4: Data Flows (Left side)

### 4.1: 2.3.1 ← D1 (Access check)
**Arrow:** DOTTED ←
**Label:** "user record (role)"

### 4.2: 2.3.2 ← D2 (Evidence metadata)
**Arrow:** DOTTED ←
**Label:** "evidence record (kem_ct, iv, tag, sig)"

### 4.3: 2.3.3 ← D4 (Encrypted file)
**Arrow:** DOTTED ←
**Label:** "{file_hash}.enc (binary)"

### 4.4: 2.3.4 ← D5 (Private key)
**Arrow:** DOTTED ←
**Label:** "user_{id}.json.enc (Fernet encrypted)"

### 4.5: 2.3.7 → D3 (Audit log)
**Arrow:** DOTTED →
**Label:** "INSERT audit_log (action=evidence_download)"

---

## SECTION 5: Output Specification

```
┌─ OUTPUT (Returned to User) ────────────────┐
│ Plaintext Evidence File:                  │
│  - content: decrypted binary data        │
│  - mime_type: original MIME type         │
│  - filename: original filename (encrypted) │
│  - access_expires_at: timestamp          │
│                                          │
│ Integrity Status:                        │
│  - signature_verified: true/false        │
│  - hash_match: true/false               │
│  - decryption_status: success/failure     │
└────────────────────────────────────────────┘
```

---

# SUMMARY TABLE: Complete DFD Components

## All Processes (Levels 0, 1, 2)

| Level | Process ID | Name | Sub-processes | Purpose |
|-------|-----------|------|---------------|---------|
| 0 | 1.0 | Authentication & AuthZ | - | User login, registration, tokens |
| 0 | 2.0 | Evidence Management | - | Upload, encrypt, decrypt, retrieve |
| 0 | 3.0 | Admin Oversight | - | Approvals, user management, health |
| 0 | 4.0 | Audit & Compliance | - | Audit logging, tamper detection |
| 1 | 1.1 | Register User | - | Admin-only user creation |
| 1 | 1.2 | Generate PQC Keys | - | ML-KEM-768, ML-DSA-65 generation |
| 1 | 1.3 | Login Verification | - | Verify credentials |
| 1 | 1.4 | Token Generation | - | Issue JWT access & refresh tokens |
| 1 | 1.5 | Refresh Token Rotation | - | Rotate & validate refresh tokens |
| 1 | 2.1 | Upload & Encrypt | 6 steps (2.1.1—2.1.6) | KEM + AES encryption |
| 1 | 2.2 | Generate Custody Record | - | Create chain-of-custody entry |
| 1 | 2.3 | Retrieve & Decrypt | 7 steps (2.3.1—2.3.7) | KEM + AES decryption |
| 1 | 2.4 | Submit to Court | - | Grant time-limited access |
| 1 | 3.1 | Evidence Approval | - | Admin approve/reject |
| 1 | 3.2 | User Management | - | Create/activate/deactivate users |
| 1 | 3.3 | Health Monitoring | - | Query system heartbeats |
| 1 | 3.4 | Audit Report Gen | - | Hash-chain verification |
| 2 | 2.1.1-2.1.6 | Upload Encryption Steps | Validate→Keys→KEM→AES→Sign→Store | Detailed crypto flow |
| 2 | 2.3.1-2.3.7 | Retrieval Decryption Steps | AuthZ→Read→Read→GetKeys→KEM→AES→Verify | Detailed crypto flow |

---

## All Data Stores

| Store ID | Name | Location | Key Tables | Access Pattern |
|----------|------|----------|-----------|-----------------|
| D1 | User Database | PostgreSQL/SQLite | users, refresh_tokens, webauthn_credentials | Frequent reads, periodic writes |
| D2 | Evidence Database | PostgreSQL/SQLite | evidence, custody_records, case_files | Frequent reads/writes |
| D3 | Audit Logs | PostgreSQL/SQLite | audit_logs, system_heartbeats | Append-only writes, periodic reads |
| D4 | File Storage | Local Filesystem | Evidence files (encrypted) | Sequential writes, random reads |
| D5 | Key Vault | Local Filesystem | user_{id}.json.enc (Fernet) | Rare reads (on auth/retrieval) |

---

## All External Entities

| Actor ID | Role | Permissions | Typical Flows |
|----------|------|-----------|--------------|
| Admin | admin | All operations | Register users, approve evidence, access audit logs |
| Investigator | investigator | Limited write | Upload evidence, view own evidence, submit to court |
| Court User | court_user | Read-only | View approved, granted evidence only |

---

END OF DFD SPECIFICATION

