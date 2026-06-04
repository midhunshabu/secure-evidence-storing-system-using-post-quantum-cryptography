# Data Flow Diagram (DFD) Methodology for PQC Evidence System

## Overview
This document provides a complete guide to drawing Data Flow Diagrams (DFDs) at different levels for the Post-Quantum Evidence Storing System. DFDs visualize how data flows through different processes and how it's stored.

---

## System Architecture Summary

### Project Purpose
A secure evidence management platform with post-quantum cryptography that handles:
- Evidence encryption/storage
- Role-based access control (Admin, Investigator, Court User)
- Custody chain tracking
- Audit integrity verification

### Key Components
- **Backend API**: Flask REST API (`backend/app/routes/`)
- **Frontend**: React SPA (`react-app/src/`)
- **Encryption Engine**: PQC module using liboqs (Kyber/ML-KEM)
- **Key Vault**: Encrypted private key storage
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **File Storage**: Encrypted evidence files

---

## DFD Levels Explained

### Level -1: Context Diagram
**Purpose**: Shows the entire system as ONE single process box with external entities

**Key Elements**:
- **One Main Process**: "PQC Evidence System" (the entire application)
- **External Entities** (3):
  - 👤 Admin User
  - 👤 Investigator
  - ⚖️ Court User
- **Data Flows**: Shows inputs and outputs between entities and the system

**What to Include**:
- External actors/roles
- Major data exchanges between actors and system (login, evidence upload, access)
- Response data from system

**Example Data Flows**:
- Admin → System: User Management, Evidence Approval
- Investigator → System: Evidence Upload, Submit to Court
- Court User → System: Access Evidence
- System → All: Authentication Tokens, Data Responses

---

### Level 0: Main Processes
**Purpose**: Breaks down the system into 4-6 major functional processes

**Key Elements**:
- **4 Main Processes**:
  1. **1.0 Authentication & Authorization** - User login, registration, token management
  2. **2.0 Evidence Management** - Upload, store, retrieve, decrypt evidence
  3. **3.0 Admin Oversight** - Approve/reject evidence, user management, health monitoring
  4. **4.0 Audit & Compliance** - Audit logging, hash chain integrity

- **5 Data Stores** (D1-D5):
  - D1: User Database (users, refresh_tokens)
  - D2: Evidence Database (evidence, custody_records)
  - D3: Audit Logs (audit_logs, system_heartbeats)
  - D4: File Storage (encrypted evidence files)
  - D5: Key Vault (encrypted private keys)

- **External Entities**: 3 actors (Admin, Investigator, Court User)

**What to Show**:
- Process numbering (1.0, 2.0, 3.0, 4.0)
- Data flows between entities and processes (solid arrows)
- Data flows between processes and stores (dotted arrows)
- Store symbols (parallel lines or rectangles with D prefix)

**Data Flows to Show**:
| From | To | Data |
|------|-----|------|
| Investigator | 2.0 | Evidence File + Metadata |
| 2.0 | D2 | Evidence Records |
| 2.0 | D4 | Encrypted Files |
| 1.0 | D1 | User Registration, Credentials |
| 3.0 | D2 | Approval Decisions |
| All Processes | D3 | Audit Events |

---

### Level 1: Process Decomposition
**Purpose**: Expands each Level 0 process into sub-processes (3-6 per process)

#### Process 1.0: Authentication & Authorization
Breaks into:
- **1.1 Register User** (Admin only) - Create new user account
- **1.2 Generate PQC Keys** - Create KeyPair using liboqs
- **1.3 Login Verification** - Verify username/PQID + password
- **1.4 Token Generation** - Issue JWT access token
- **1.5 Refresh Token Rotation** - Issue new tokens from refresh token

**Data Stores Accessed**: D1 (users), D5 (keys), D3 (audit logs)

#### Process 2.0: Evidence Management
Breaks into:
- **2.1 Upload & Encrypt Evidence** - Validate and encrypt file
- **2.2 Generate Custody Record** - Create chain-of-custody entry
- **2.3 Retrieve & Decrypt Evidence** - Load and decrypt file
- **2.4 Submit Evidence to Court** - Make evidence available to court users

**Data Stores Accessed**: D2, D4, D5

#### Process 3.0: Admin Oversight
Breaks into:
- **3.1 Evidence Approval/Rejection** - Review and approve evidence
- **3.2 User Management** - Create/disable users, manage roles
- **3.3 System Health Monitoring** - View server status, heartbeats
- **3.4 Audit Report Generation** - Generate tamper-detection reports

**Data Stores Accessed**: D1, D2, D3

---

### Level 2: Detailed Sub-Process Flow
**Purpose**: Expands selected Level 1 processes into even more detailed steps

#### 2.1: Upload & Encrypt Evidence (Detailed)
Shows cryptographic flow:
1. **2.1.1 Validate File** - Check file size, extension, type
2. **2.1.2 Retrieve Public Key** - Get uploader's PQC public key
3. **2.1.3 Generate Shared Secret** - KEM encapsulation using uploader's public key
4. **2.1.4 Encrypt File** - Derive AES-256-GCM key, encrypt file with IV/tag
5. **2.1.5 Sign Metadata** - Generate signature over metadata using private key
6. **2.1.6 Store Evidence Record** - Write to database with encrypted metadata

**Shows**:
- Interaction with cryptographic modules (KEM, AES, HKDF, Signature)
- Exact data stores accessed
- Encryption transformations

#### 2.3: Retrieve & Decrypt Evidence (Detailed)
Shows decryption flow:
1. **2.3.1 Verify Access Rights** - Check user role and permissions
2. **2.3.2 Retrieve Metadata** - Load evidence record from D2
3. **2.3.3 Retrieve Encrypted File** - Load encrypted file from D4
4. **2.3.4 Get Private Key** - Unlock private key from vault (D5)
5. **2.3.5 Decrypt KEM Ciphertext** - KEM decapsulation to get shared secret
6. **2.3.6 Decrypt File** - AES-256-GCM decryption
7. **2.3.7 Verify Signature** - Validate file integrity

**Shows**:
- Reverse of encryption process
- Private key usage
- Verification steps

---

## Creating DFD Templates

### Standard DFD Elements

```
┌─────────────────┐
│   Process       │     Circle or rounded rectangle
│    Name         │     Shows transformation of data
│    (P1.0)       │
└─────────────────┘

──────────────────► Data Flow (shows data movement)
- - - - - - - - -> Database Access (dotted for stores)

════════════════════ Multiple related flows

[External Entity]  Rectangle - represents outside actors

═══════════════════ Data Store - parallel lines or rectangle with D prefix
  D1: Store Name
═══════════════════
```

### Numbering Convention
- **Level 0**: 1.0, 2.0, 3.0, 4.0, etc.
- **Level 1**: 1.1, 1.2, 1.3... 2.1, 2.2, 2.3... (sub-process of parent)
- **Level 2**: 2.1.1, 2.1.2, 2.1.3... (sub-process of Level 1 process)
- **Naming**: starts with verb (Upload, Validate, Verify, Generate, Store, etc.)

### Data Flow Labels
Every flow should be labeled with what data moves:

| Flow | Data Description |
|------|------------------|
| Investigator → 2.1 | Evidence file, metadata (case_id, filename, type) |
| 1.0 → Investigator | JWT access token, user profile |
| 2.1 → D4 | Encrypted file (binary blob) |
| 2.1 → D2 | Evidence metadata (KEM ciphertext, IV, tag, signature) |
| 2.3.5 → 2.3.6 | Shared secret (AES key for decryption) |

---

## Data Dictionary

### Key Data Entities

#### User Data (D1)
```
User:
  - id (PK)
  - username (unique)
  - email (encrypted)
  - password_hash
  - role (admin, investigator, court_user)
  - pqc_public_key (base64)
  - aadhar_hash (encrypted, one-way)
  - is_active
  - created_at, last_login
  
RefreshToken:
  - jti_hash (refresh token ID)
  - user_id (FK)
  - revoked_at (nullable)
```

#### Evidence Data (D2)
```
Evidence:
  - id (PK)
  - case_id (encrypted)
  - uploader_id (FK to User)
  - filename (encrypted)
  - file_hash (SHA3-512)
  - file_size
  - evidence_type (encrypted)
  - description (encrypted)
  - approval_status (pending, approved, rejected)
  - approved_by (FK to User, nullable)
  - access_level (private, court, public)
  
  Crypto metadata:
  - kem_ciphertext (KEM encapsulated value)
  - encryption_iv
  - encryption_tag (AES-GCM auth tag)
  - signature (digital signature)
  - signature_algorithm (ML-DSA, etc.)

CustodyRecord:
  - id (PK)
  - evidence_id (FK)
  - action (upload, view, approve, deny, submit_to_court)
  - user_id (FK)
  - timestamp
  - ip_address (encrypted)
  - signature (optional, on sensitive actions)
```

#### Audit Data (D3)
```
AuditLog:
  - id (PK)
  - user_id (FK)
  - action (login, register, upload, approve, decrypt, etc.)
  - resource_type (auth, evidence, user, etc.)
  - resource_id
  - details (JSON, encrypted)
  - status (success, failure)
  - error_message (encrypted, if any)
  - ip_address (encrypted)
  - user_agent (encrypted)
  - prev_hash (SHA3-256 of previous entry)
  - current_hash (SHA3-256 of this entry)
  - timestamp

SystemHeartbeat:
  - id (PK)
  - server_load_percentage
  - timestamp (minute granularity)
```

#### Cryptographic Metadata (D5 Key Vault)
```
Per-user encrypted file (JSON):
{
  "user_id": 1,
  "private_key_pem": "base64-encoded PQC private key",
  "public_key_pem": "base64-encoded PQC public key (backup)",
  "kem_algorithm": "ML-KEM-768",
  "signature_algorithm": "ML-DSA-65",
  "key_created_at": "2026-02-18T10:00:00",
  "key_version": 1
}
```

---

## Security Considerations Shown in DFD

### Encryption Points
- ✓ Evidence files encrypted before storage (at 2.1.4)
- ✓ Sensitive DB fields encrypted at ORM layer (D1, D2, D3)
- ✓ Private keys encrypted in vault (D5)
- ✓ Credentials encrypted in transit (HTTPS implied)

### Authentication & Authorization
- ✓ All user operations require JWT token (from 1.0)
- ✓ Access rights verified before evidence retrieval (2.3.1)
- ✓ Role-based filtering for evidence visibility
- ✓ Admin-only operations (1.1 registration, 3.1 approval)

### Audit Trail
- ✓ All actions logged to D3 (audit_logs)
- ✓ Hash chain maintained (prev_hash → current_hash)
- ✓ Allows tamper detection in 3.4

### Data Flows to Encrypt/Protect
- User credentials: ✓ (hashed passwords, encrypted email)
- Case ID: ✓ (encrypted in DB)
- Evidence description: ✓ (encrypted)
- IP addresses: ✓ (encrypted in audit logs)
- Evidence files: ✓ (AES-256-GCM encryption)

---

## Drawing Your Own DFDs

### Step-by-Step Process

#### For Context Diagram (Level -1):
1. Draw large box in center = "PQC Evidence System"
2. Place 3 actors outside: Admin, Investigator, Court User
3. Draw arrows showing: registration → system, upload → system, access → system
4. Draw response arrows: tokens ← system, evidence ← system

#### For Level 0 DFD:
1. Draw 4 main process boxes (1.0—4.0)
2. List external entities on periphery
3. Draw 5 data stores (D1—D5) at bottom
4. Connect entities → processes (solid lines)
5. Connect processes ↔ data stores (dotted lines)
6. Connect process → process (solid lines) for sequential flows
7. Label all flows with data types

#### For Level 1 DFDs:
1. Take one Level 0 process (e.g., 2.0)
2. Break into 4-6 sub-processes (2.1, 2.2, 2.3, 2.4)
3. Show flows between sub-processes
4. Show which data stores each sub-process accesses
5. Number in sequence: sub-process 1 → 2 → 3, etc.

#### For Level 2 DFDs:
1. Take one Level 1 process (e.g., 2.1)
2. Break into 5-8 detailed steps
3. Show cryptographic transformations
4. Show interaction with specialized modules (KEM, AES, HKDF)
5. Clearly show data types at each stage

### Tools for Drawing DFDs
- **Mermaid.js** (used in this documentation)
- Microsoft Visio
- LucidChart
- Draw.io (free, online)
- Creately
- Gliffy

---

## Example API Endpoints Mapped to Processes

| Endpoint | Level 0 | Level 1 | Level 2 |
|----------|---------|---------|---------|
| `POST /api/auth/register` | 1.0 | 1.1 | 1.1.1 - Validate, 1.1.2 - Hash PW |
| `POST /api/auth/login-verify` | 1.0 | 1.3 | 1.3.1 - Query DB, 1.3.2 - Verify PW |
| `POST /api/auth/refresh` | 1.0 | 1.5 | 1.5.1 - Validate Token, 1.5.2 - Issue New |
| `POST /api/evidence/upload` | 2.0 | 2.1 | 2.1.1 - Validate through 2.1.6 |
| `GET /api/evidence/<id>` | 2.0 | 2.3 | 2.3.1 - Verify Access through 2.3.7 |
| `POST /api/evidence/<id>/submit-to-court` | 2.0 | 2.4 | (sub-steps) |
| `POST /api/admin/evidence/<id>/approve` | 3.0 | 3.1 | 3.1.1 - Validate, 3.1.2 - Sign Approval |
| `GET /api/admin/users` | 3.0 | 3.2 | 3.2.1 - Query, 3.2.2 - Format Response |
| `GET /api/admin/health` | 3.0 | 3.3 | 3.3.1 - Query Heartbeats |
| `GET /api/admin/audit-logs` | 3.0 | 3.4 | 3.4.1 - Query Logs, 3.4.2 - Verify Chain |

---

## Common Mistakes to Avoid

1. ❌ **Not labeling flows** - Always describe what data moves
2. ❌ **Mixing levels** - Keep Level 0, Level 1, Level 2 separate
3. ❌ **Forgetting data stores** - Show D1 through D5 clearly
4. ❌ **Showing implementation details at wrong level** - Crypto internals at Level 2 only
5. ❌ **Incorrect numbering** - 1.0 → 1.1, 1.2 (not 1.0.1, 1.0.2)
6. ❌ **Black hole processes** - Every process needs input AND output
7. ❌ **Missing external entities** - Should be outside the system boundary

---

## Summary Table: DFD Levels

| Level | Purpose | Shows | # Processes | # Stores | Audience |
|-------|---------|-------|------------|----------|----------|
| -1 (Context) | Overview | Actors & system as one box | 1 | 0 | Executives, Stakeholders |
| 0 | Main flows | Major processes & stores | 4 | 5 | Project managers, Architects |
| 1 | Sub-processes | Process decomposition | 16-20 | 5 | Developers, QA |
| 2 | Details | Cryptographic flow, validation steps | 40-50 | 5 | Security engineers, Developers |

---

## Next Steps

1. Start with Context Diagram to understand the big picture
2. Create Level 0 to see 4 main areas of functionality
3. Focus on Level 1 for each process to understand data flow
4. Use Level 2 for security-critical processes (encryption, approval)
5. Validate against actual code in `backend/app/routes/`
6. Update DFDs when business logic changes

