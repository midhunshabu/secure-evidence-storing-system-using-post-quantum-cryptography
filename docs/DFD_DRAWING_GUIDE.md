# How to Draw DFDs for PQC Evidence System - Step-by-Step

## Quick Start Guide

Choose your drawing tool:
- **Online & Free**: draw.io, Lucidchart (trial), Miro
- **MS Office**: Visio (paid)
- **Open Source**: yEd, Dia
- **Text-based**: Mermaid.js (used in this project)

---

## Step 1: Draw the Context Diagram (Level -1)

### What You're Creating
A single box representing the entire system with 3 external actors

### Instructions
1. Draw ONE large rounded rectangle in the center
   - Label: "PQC Evidence Storing System"
   - Size: ~4" × 2"

2. Place 3 actors around it:
   - Left: 👤 Admin User (rectangle)
   - Top: 👤 Investigator (rectangle)
   - Right: ⚖️ Court User (rectangle)

3. Draw bi-directional arrows with labels:
   ```
   Admin → System: (User Registration, Evidence Approval)
   System → Admin: (Confirmation, Reports)
   
   Investigator → System: (Evidence Upload, Court Submission)
   System → Investigator: (Access Token, Evidence)
   
   Court User → System: (Evidence Access Request)
   System → Court User: (Approved Evidence)
   ```

4. Add system boundary (optional circle around main box)

### Time: 5 minutes

---

## Step 2: Draw Level 0 DFD

### Layout
```
External Entities (Top)
         ↓
    4 Main Processes (Center, arranged 2×2 or 1×4)
         ↓
    5 Data Stores (Bottom, arranged horizontally)
```

### Instructions

#### 1. Draw 4 Process Boxes (Circles or Rounded Rectangles)
```
┌─────────────────┐      ┌─────────────────┐
│ 1.0 Auth &      │      │ 2.0 Evidence    │
│ AuthZ           │      │ Management      │
└─────────────────┘      └─────────────────┘

┌─────────────────┐      ┌─────────────────┐
│ 3.0 Admin       │      │ 4.0 Audit &     │
│ Oversight       │      │ Compliance      │
└─────────────────┘      └─────────────────┘
```

#### 2. Draw 5 Data Stores (Use Double Horizontal Lines)
```
═════════════════════════════════════════════════════════════
    D1: User DB     D2: Evidence DB    D3: Audit Logs
═════════════════════════════════════════════════════════════

═════════════════════════════════════════════════════════════
    D4: File Storage          D5: Key Vault
═════════════════════════════════════════════════════════════
```

#### 3. Place External Entities (Rectangles)
- Top left: 👤 Admin
- Top center: 👤 Investigator  
- Top right: ⚖️ Court User

#### 4. Draw All Data Flows (Solid Arrows)
```
Admin ──(register/login)──→ 1.0
1.0 ──(auth tokens)──→ Admin

Investigator ──(upload)──→ 2.0
2.0 ──(evidence)──→ Investigator

Court User ──(access)──→ 2.0
2.0 ──(data)──→ Court User

Admin ──(approve/manage)──→ 3.0
3.0 ──(status)──→ Admin
```

#### 5. Draw All Database Flows (Dotted Arrows)
```
1.0 .-.(D1 read/write).-.
1.0 .-.(D5 write).-.
1.0 .-.(D3 write).-.

2.0 .-.(D2 read/write).-.
2.0 .-.(D4 read/write).-.
2.0 .-.(D5 read).-.
2.0 .-.(D3 write).-.

3.0 .-.(D1 read/write).-.
3.0 .-.(D2 read/write).-.
3.0 .-.(D3 write/read).-.

4.0 .-.(D3 read/write).-.
```

#### 6. Label All Flows
Every arrow gets a label describing the data:
- "User credentials"
- "Evidence file + metadata"
- "JWT Token"
- "Evidence records"
- etc.

### Checklist
- [ ] 4 processes numbered 1.0—4.0
- [ ] 5 stores labeled D1—D5
- [ ] 3 external entities
- [ ] All flows labeled
- [ ] No black holes (each process has input/output)
- [ ] Process shapes are consistent

### Time: 15-20 minutes

---

## Step 3: Draw Level 1 - Authentication Process (1.0)

### What You're Expanding
Breaking down "1.0 Authentication & Authorization" into 5 sub-processes

### Layout
```
External Entity (Admin/User) — Top
         ↓
    5 Sub-processes — Arranged vertically or in flow
         ↓
    3 Data Stores — Bottom (D1, D5, D3)
```

### Instructions

#### 1. Replace Process 1.0 with 5 Sub-processes
```
┌──────────────────────────────────────────────────┐
│ Process 1.0: Authentication & Authorization     │
├──────────────────────────────────────────────────┤
│                                                  │
│  1.1 Register ──→ 1.2 Generate ──→ 1.4 Token   │
│  (Admin Only)    PQC Keys        Generation    │
│                                                  │
│  1.3 Login                                      │
│  Verification ──→ 1.4 Token Generation          │
│                                                  │
│  1.5 Refresh Token Rotation                     │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### 2. Draw Sub-Process Boxes (1.1 through 1.5)
- 1.1 Register User (Admin only)
- 1.2 Generate PQC Keys
- 1.3 Login Verification
- 1.4 Token Generation
- 1.5 Refresh Token Rotation

#### 3. Show Data Flow Between Processes
```
1.1 ──(registration request)──→ 1.2 ──(KeyPair)──→ 1.4
                                                     ↓
                                               Returns JWT
                                                     ↑
1.3 ──(credentials)──→ 1.4 ──────────────────────→↓

1.5 ←── Refresh Token Cookie ←── 1.4
1.5 ──(new tokens)──→ Back to User
```

#### 4. Show Data Store Access
```
1.1 .-.(D1: Write user)-.
1.2 .-.(D5: Write keys)-.
1.3 .-.(D1: Query user)-.
1.4 .-.(D5: Read public key)-.
1.5 .-.(D1: Update refresh token)-.

All processes .-.(D3: Log events)-.
```

#### 5. Label All Flows
- "Username, email, password, role"
- "PQC KeyPair (public + private)"
- "Credentials valid"
- "JWT access token + refresh token"

### Time: 10-15 minutes

---

## Step 4: Draw Level 1 - Evidence Management (2.0)

### What You're Expanding
Breaking down "2.0 Evidence Management" into 4 sub-processes

### Layout
```
Investigator ──→ 2.1 Upload ──→ 2.2 Custody ──→ 2.3 Retrieve ──→ 2.4 Submit to Court
                                                    ↑
                                           Court User Access
```

### Instructions

#### 1. Draw 4 Sub-Processes
```
2.1 Upload & Encrypt Evidence
2.2 Generate Custody Record
2.3 Retrieve & Decrypt Evidence
2.4 Submit Evidence to Court
```

#### 2. Show Sequential Flow
```
Investigator ──(file+metadata)──→ 2.1 ──(encrypted)──→ 2.2
                                                        ↓
Court User ──(access request)──→ 2.3 ←── D2, D4, D5 ──(retrieve)
                                  ↓
                           (decrypted file)
                                  
Investigator ──(submit decision)──→ 2.4 ──(grant access)──→ Database
```

#### 3. Show Database Interactions
```
2.1 .-.(D5: Get public key)-.
    .-.(D2: Write evidence record)-.
    .-.(D4: Write encrypted file)-.
    
2.2 .-.(D2: Write custody record)-.

2.3 .-.(D1: Check authorization)-.
    .-.(D2: Read evidence)-.
    .-.(D4: Read encrypted file)-.
    .-.(D5: Get private key)-.
    .-.(D3: Log access)-.
    
2.4 .-.(D2: Update status)-.
```

#### 4. Label All Input/Output
- "Evidence file + case_id, filename, type"
- "Custody entry: upload, view action"
- "Decrypted evidence data"
- "Access granted"

### Time: 10-15 minutes

---

## Step 5: Draw Level 2 - Evidence Upload Encryption (2.1)

### What You're Expanding
Breaking down "2.1 Upload & Encrypt Evidence" into 6 detailed cryptographic steps

### Layout (Sequential)
```
    INPUT
      ↓
   2.1.1 Validate File
      ↓
   2.1.2 Retrieve Public Key
      ↓
   2.1.3 Generate Shared Secret (KEM)
      ↓
   2.1.4 Encrypt File (AES-256-GCM)
      ↓
   2.1.5 Sign Metadata
      ↓
   2.1.6 Store Evidence Record
      ↓
    OUTPUT
```

### Instructions

#### 1. Draw 6 Process Boxes
Arranged vertically showing flow downward

#### 2. Draw Interaction with Crypto Modules
```
         2.1.3
           ↓
      [KEM ENGINE]
      (liboqs)
           ↓
         2.1.4
           ↓
    [HKDF KEY DERIVATION]
           ↓
    [AES-256-GCM ENCRYPTION]
           ↓
         2.1.5
           ↓
    [SIGNATURE ENGINE]
           ↓
         2.1.6
```

#### 3. Show Input/Output at Each Step
```
2.1.1: IN (file) → OUT (valid_file)

2.1.2: 
  OUT to D5 .-.(get user public key)-.
  IN (public_key_bytes)

2.1.3:
  IN (user_public_key) → [KEM.encapsulate] 
  OUT (kem_ciphertext, shared_secret)

2.1.4:
  IN (shared_secret, raw_file_data)
  → [HKDF] → [AES-256-GCM]
  OUT (iv, ciphertext, tag)

2.1.5:
  IN (metadata_bytes) → [SIGN]
  OUT (signature)

2.1.6:
  Input to D2 .-.(store evidence record)-.
  Input to D4 .-.(store encrypted file)-.
```

#### 4. Label All Data Types
- "Raw file bytes"
- "PQC public key (ML-KEM-768)"
- "KEM ciphertext (1088 bytes)"
- "Shared secret (32 bytes)"
- "AES key (derived via HKDF)"
- "IV, ciphertext, auth tag"
- "Digital signature (ML-DSA)"

### Time: 15-20 minutes

---

## Step 6: Draw Level 2 - Evidence Retrieval Decryption (2.3)

### What You're Expanding
Breaking down "2.3 Retrieve & Decrypt Evidence" into 7 detailed cryptographic steps

### Layout (Sequential)
```
    INPUT (evidence_id from user)
           ↓
    2.3.1 Verify Access Rights
           ↓
    2.3.2 Retrieve Metadata
           ↓
    2.3.3 Retrieve Encrypted File
           ↓
    2.3.4 Get Private Key
           ↓
    2.3.5 Decrypt KEM Ciphertext
           ↓
    2.3.6 Decrypt File
           ↓
    2.3.7 Verify Signature
           ↓
      OUTPUT (plaintext file)
```

### Instructions

#### 1. Draw 7 Process Boxes Vertically

#### 2. Draw Reverse Crypto Transformations
```
         2.3.5
           ↓
    [KEM DECAPSULATE]
    (liboqs)
           ↓
      shared_secret
           ↓
    [HKDF KEY DERIVATION]
           ↓
      AES Key
           ↓
         2.3.6
           ↓
    [AES-256-GCM DECRYPT]
           ↓
      plaintext
           ↓
         2.3.7
           ↓
    [SIGNATURE VERIFY]
```

#### 3. Show Database Queries
```
2.3.1: D1 .-.(check user role)-.
       → access_granted OR access_denied

2.3.2: D2 .-.(SELECT evidence WHERE id=?)-.
       → metadata, kem_ciphertext, iv, tag, signature

2.3.3: D4 .-.(SELECT encrypted_file WHERE id=?)-.
       → encrypted file blob

2.3.4: D5 .-.(SELECT user_N.json.enc)-.
       → [Decrypt with KEY_VAULT_MASTER_KEY]
       → private key object

2.3.7: Create custody record to D2
       Log access to D3
```

#### 4. Label Data at Each Step
- "User ID + evidence ID"
- "User role (investigator, court_user, etc.)"
- "Evidence metadata from DB"
- "Encrypted file blob"
- "PQC private key (ML-KEM-768 private)"
- "Shared secret (successfully recovered)"
- "AES key (HKDF-derived)"
- "Plaintext evidence file"
- "Signature status (valid/invalid)"

### Time: 15-20 minutes

---

## Complete Diagram Summary

Once done, you'll have:

| Diagram | Shows | Time |
|---------|-------|------|
| Context (Level -1) | System as one box, 3 actors | 5 min |
| Level 0 | 4 processes, 5 stores | 15-20 min |
| Level 1 Auth (1.0) | 5 sub-processes | 10-15 min |
| Level 1 Evidence (2.0) | 4 sub-processes | 10-15 min |
| Level 1 Admin (3.0) | 4 sub-processes | 10-15 min |
| Level 2 Upload (2.1) | 6 crypto steps | 15-20 min |
| Level 2 Retrieve (2.3) | 7 crypto steps | 15-20 min |

**Total Time: ~1.5—2 hours for complete set**

---

## Tools Comparison

### draw.io (Recommended for Learning)
- ✅ Free, no login required
- ✅ Built-in DFD shapes
- ✅ Auto-export to PDF/PNG
- ✅ Collaborative
- ⏱️ Slight learning curve

### LucidChart
- ✅ Excellent pre-built templates
- ✅ Real-time collaboration
- ❌ Paid (free trial available)
- ⏱️ Steeper learning curve

### Mermaid.js (Text-based, GitHub-native)
- ✅ Version control friendly
- ✅ Can embed in markdown
- ✅ Free
- ⏱️ Less visual editing

### Visio (Enterprise)
- ✅ Professional output
- ✅ Lots of templates
- ❌ Expensive
- ❌ Windows only

---

## Tips for Professional-Looking DFDs

1. **Color Code by Process Level**
   - Level 0: Uniform color
   - Level 1: Slightly lighter shade of parent
   - Level 2: Even lighter

2. **Consistent Spacing**
   - Align processes in rows/columns
   - Leave space between elements
   - Use alignment grids

3. **Clear Labeling**
   - Process names are verbs: "Upload", "Verify", "Encrypt"
   - Data flow labels describe content, not technical names
   - Store labels: "D1: User Database"

4. **Use Legends**
   - Process (circle/box)
   - Data Store (parallel lines)
   - Data Flow (arrow with label)
   - External Entity (rectangle)

5. **Flow Direction**
   - Generally top-to-bottom
   - Left-to-right for sequential processes
   - Consistent throughout diagram

---

## Validation Questions

After drawing each diagram, ask:

### Context Level:
- [ ] Is there exactly ONE process? ✓
- [ ] Are all actors identified? ✓
- [ ] Do all actors have bi-directional flows? ✓

### Level 0:
- [ ] Are there 4 processes? ✓
- [ ] Are there 5 data stores? ✓
- [ ] Can I trace authentication flow? ✓
- [ ] Can I trace evidence upload flow? ✓
- [ ] Can I trace evidence retrieval flow? ✓

### Level 1:
- [ ] Does each process decompose into 3-6 sub-processes? ✓
- [ ] Is numbering correct (1.1, 1.2, 1.3...)? ✓
- [ ] Do sub-processes show logical sequence? ✓

### Level 2:
- [ ] Are cryptographic transformations clear? ✓
- [ ] Can I understand KEM and AES-GCM separately? ✓
- [ ] Are data types labeled at each step? ✓

---

## Next Actions

1. **Draw Context** (5 min) - Get stakeholder buy-in
2. **Draw Level 0** (20 min) - Establish main processes
3. **Draw Level 1** (45 min) - Detail each main process
4. **Draw Level 2** for 2.1 and 2.3 (40 min) - Show crypto
5. **Review** (10 min) - Validate against actual code
6. **Document** (10 min) - Add to project documentation

Total investment: ~2 hours → Complete system understanding

