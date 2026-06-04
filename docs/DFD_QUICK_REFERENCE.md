# DFD Quick Reference Guide

## Visual Summary

### Level -1: Context Diagram Elements
```
                    User Roles
                       ▲
                    ┌──┼──┐
         ┌──────────┤  |  ├──────────┐
         │          └──┼──┘          │
         │             │             │
    ┌────▼─┐     ┌─────▼──┐     ┌───▼────┐
    │Admin │     │Investi │     │ Court  │
    │      │     │gator   │     │ User   │
    └────┬─┘     └──┬─────┘     └───┬────┘
         │          │               │
         │ register/│ upload/       │ access/
         │ approve  │ submit        │ view
         │          ▼               │
         └─────────►┌─────────────────┘
                    │
                    │ PQC Evidence
                    │ System (Box)
                    │
                    ◄─────────────────┘
                    │ tokens/
                    │ responses
```

### Level 0: Main Processes & Data Stores

```
PROCESSES:
  1.0 Authentication & Authorization
  2.0 Evidence Management
  3.0 Admin Oversight
  4.0 Audit & Compliance

DATA STORES:
  D1 ═══ User Database (users, refresh_tokens)
  D2 ═══ Evidence DB (evidence, custody_records)
  D3 ═══ Audit Logs (audit_logs, heartbeats)
  D4 ═══ File Storage (encrypted evidence)
  D5 ═══ Key Vault (encrypted keys)
```

---

## Key Data Flows by Process

### 1.0 Authentication & Authorization
```
INPUT:  username, email, password, role
        ↓
PROCESS: Validate → Generate PQC Keys → Hash Password → Issue JWT
        ↓
OUTPUT: access_token, refresh_token, user_profile

DATA STORES:
  D1 ← user registration, password hash
  D5 ← private key (encrypted)
  D3 ← auth events (logged)
```

### 2.0 Evidence Management
```
UPLOAD FLOW:
  evidence_file + metadata
    ↓
  2.1: Validate ← D5(public_key) → Encrypt(KEM+AES) → Sign → D2,D4
  
RETRIEVAL FLOW:
  evidence_id
    ↓
  2.3: Check Access ← D1(role) → Get Metadata ← D2 → Get Encrypted ← D4
       → Get Private Key ← D5 → Decrypt → Verify → Return Evidence
  
COURT SUBMISSION:
  evidence_id + access_duration
    ↓
  2.4: Update Status ← D2 → Grant Access ← D1
```

### 3.0 Admin Oversight
```
APPROVAL:
  evidence_id, decision (approve/reject)
    ↓
  3.1: Verify Admin ← D1 → Update Status ← D2 → Sign Decision
    
USERS:
  username, email, role, details
    ↓
  3.2: Create/Modify ← D1 → Generate Keys ← D5
  
MONITORING:
  (request)
    ↓
  3.3: Aggregate Heartbeats ← D3 → Return System Health
  
AUDIT:
  (request)
    ↓
  3.4: Query Logs ← D3 → Verify Hash Chain → Return Report
```

---

## Cryptographic Data Transformations (Level 2)

### Evidence Upload Encryption (2.1)

```
INPUT: Raw Evidence File (plaintext)

2.1.1: VALIDATE
  - Check: file size, extension, mime type
  - Output: valid_file_object

2.1.2: RETRIEVE PUBLIC KEY (from D5)
  - Lookup: user.pqc_public_key
  - Output: base64_public_key

2.1.3: GENERATE SHARED SECRET (KEM)
  - KEM.encapsulate(public_key) via liboqs
  - Output: 
    ├─ kem_ciphertext (encapsulation)
    └─ shared_secret (raw key material)

2.1.4: ENCRYPT FILE (AES-256-GCM)
  - HKDF_SHA256(shared_secret) → aes_key
  - AES_256_GCM.encrypt(plaintext, aes_key)
  - Output:
    ├─ iv (initialization vector)
    ├─ ciphertext (encrypted evidence)
    └─ tag (authentication tag)

2.1.5: SIGN METADATA
  - canonical_payload = JSON(metadata, sorted)
  - ML_DSA.sign(canonical_payload, private_key)
  - Output: signature_bytes

2.1.6: STORE TO D2, D4
  - D2: Evidence record with KEM ciphertext, IV, tag, signature
  - D4: Encrypted file blob indexed by file_hash

OUTPUT: Evidence stored securely, custody_record created
```

### Evidence Retrieval Decryption (2.3)

```
INPUT: evidence_id from authorized_user

2.3.1: VERIFY ACCESS
  - Check: user.role vs evidence.access_level
  - Create: custody_record with action="view"
  - Output: access_granted OR access_denied

2.3.2-2.3.3: RETRIEVE METADATA & ENCRYPTED FILE
  - Query D2: SELECT evidence WHERE id=?
  - Query D4: SELECT encrypted_file WHERE id=?
  - Output:
    ├─ kem_ciphertext
    ├─ iv
    ├─ tag
    ├─ signature
    └─ encrypted_file_blob

2.3.4: GET PRIVATE KEY (from D5)
  - Unlock: user_N.json.enc with KEY_VAULT_MASTER_KEY
  - Decrypt Fernet: private_key_pem
  - Output: private_key_object

2.3.5: KEM DECAPSULATION
  - KEM.decapsulate(kem_ciphertext, private_key) via liboqs
  - Output: shared_secret (MUST match original)

2.3.6: DECRYPT FILE (AES-256-GCM)
  - HKDF_SHA256(shared_secret) → aes_key
  - AES_256_GCM.decrypt(ciphertext, aes_key, iv, tag)
  - Output: plaintext_file_data (or error if tag mismatch)

2.3.7: VERIFY SIGNATURE
  - ML_DSA.verify(signature, canonical_payload, public_key)
  - Output: signature_valid OR signature_invalid

OUTPUT: Evidence returned to user OR error logged
```

---

## Data Store Schema (Summary)

### D1: User Database
```
users:
  id | username | email(enc) | password_hash | role | pqc_public_key | 
  aadhar_hash(enc) | is_active | created_at | last_login | ... [15+ cols]

refresh_tokens:
  id | user_id | jti_hash | revoked_at
```

### D2: Evidence Database
```
evidence:
  id | uploader_id | case_id(enc) | filename(enc) | file_hash | 
  file_size | evidence_type(enc) | description(enc) | 
  kem_ciphertext | encryption_iv | encryption_tag | signature |
  approval_status | approved_by | access_level | created_at | ...

custody_records:
  id | evidence_id | action | user_id | timestamp | ip_address(enc) | signature
```

### D3: Audit Logs
```
audit_logs:
  id | user_id | action | resource_type | resource_id | 
  details(enc) | status | error_message(enc) | ip_address(enc) |
  user_agent(enc) | prev_hash | current_hash | created_at

system_heartbeats:
  id | server_load_percentage | created_at
```

### D4: File Storage
```
Directory structure: /backend/storage/evidence/
  └─ {file_hash}.enc
     (encrypted evidence file, referenced by evidence.id)
```

### D5: Key Vault
```
Directory structure: /backend/secure/key_vault/
  └─ user_{id}.json.enc
     
Decrypted JSON structure:
  {
    "user_id": 1,
    "private_key_pem": "base64(...)",
    "public_key_pem": "base64(...)",
    "kem_algorithm": "ML-KEM-768",
    "signature_algorithm": "ML-DSA-65",
    "key_created_at": "2026-02-18T...",
    "key_version": 1
  }
```

---

## Process Flowchart by Role

### Admin Workflow
```
Login (1.3) 
  ↓
Get JWT (1.4)
  ↓
View Admin Dashboard (3.0)
  ├─ 3.2: User Management → Create users (1.1)
  ├─ 3.1: Evidence Approval → Review pending (2.0)
  │        └─ Approve (Update D2, Sign, Log to D3)
  ├─ 3.3: Health Monitoring → Aggregate D3 heartbeats
  └─ 3.4: Audit Reports → Query D3 hash chain
```

### Investigator Workflow
```
Login (1.3)
  ↓
Get JWT (1.4)
  ↓
Dashboard (2.0)
  ├─ 2.1: Upload Evidence
  │   ├─ Validate file
  │   ├─ Encrypt with own public key (D5)
  │   ├─ Store to D2, D4
  │   └─ Log to D3
  │
  ├─ 2.3: View Own Evidence
  │   ├─ Decrypt with private key
  │   └─ View details
  │
  └─ 2.4: Submit to Court
      ├─ Update access_level in D2
      └─ Grant court_user access
```

### Court User Workflow
```
Login (1.3)
  ↓
Get JWT (1.4)
  ↓
Evidence List (2.3)
  ├─ Filter: access_level = "court"
  │
  └─ 2.3: View Approved Evidence
      ├─ Decrypt with court_user private key
      ├─ Verify signatures
      └─ View evidence
```

---

## Security Checkpoints in DFD

| Checkpoint | Process | Check | Store |
|------------|---------|-------|-------|
| User Authentication | 1.0/1.3 | Verify password hash | D1 |
| Public Key Retrieval | 2.1/2.3 | User ownership validation | D5 |
| File Encryption | 2.1 | KEM + AES-256-GCM | D4 |
| File Decryption | 2.3 | Signature verification | D4 |
| Role Authorization | 2.3/3.1 | Role ∈ admin/investigator/court_user | D1 |
| Evidence Approval | 3.1 | Admin signature applied | D2 |
| Audit Integrity | 3.4 | Hash chain validation | D3 |
| Refresh Token | 1.5 | Token rotation & JTI tracking | D1 |

---

## Common DFD Patterns in This System

### Pattern 1: Encryption & Store
```
User Input
  ↓
Validate
  ↓
Retrieve Public Key ← D5
  ↓
Encrypt (KEM + AES)
  ↓
Sign Metadata
  ↓
Store ← D2, D4, D3
  ↓
Return ID
```

### Pattern 2: Retrieve & Decrypt
```
Request with ID
  ↓
Check Authorization ← D1
  ↓
Retrieve Metadata ← D2
  ↓
Retrieve Encrypted File ← D4
  ↓
Retrieve Private Key ← D5
  ↓
Decrypt (KEM + AES)
  ↓
Verify Signature
  ↓
Return Plaintext ← Log to D3
```

### Pattern 3: Admin Decision
```
Admin Request with ID
  ↓
Verify Admin Role ← D1
  ↓
Fetch Resource ← D2
  ↓
Validate Decision Data
  ↓
Apply Signature
  ↓
Update Resource ← D2
  ↓
Create Audit Record ← D3
  ↓
Return Confirmation
```

---

## Drawing Tips

### Use Color Coding
- **Blue**: Authentication processes (1.0)
- **Purple**: Evidence processes (2.0)
- **Orange**: Admin processes (3.0)
- **Green**: Audit processes (4.0)
- **Red**: Sensitive data flows (encryption keys)
- **Yellow**: Cryptographic modules

### Labeling Best Practices
```
✓ Good:
  Investigator → "evidence file + case_id, filename, type"
  2.1 → D4: "encrypted_file_blob (AES-256-GCM)"
  
✗ Avoid:
  Investigator → "data"
  2.1 → D4: "file"
```

### Alignment
- Keep processes in vertical center
- Place external entities on left/right edges
- Place data stores at bottom
- Flows flow top-to-bottom or left-to-right

---

## Validation Checklist

Before considering your DFD complete:

- [ ] All external entities identified (Admin, Investigator, Court User)
- [ ] All main processes present (1.0—4.0)
- [ ] All data stores present (D1—D5)
- [ ] All flows labeled with data type
- [ ] No black holes (every process has input AND output)
- [ ] No miracles (no data appears without source)
- [ ] Data stores accessed appropriately for each process
- [ ] Numbering consistent (1.0, 1.1, 1.2, etc.)
- [ ] External entities don't talk to data stores directly
- [ ] Flows show direction with arrows

