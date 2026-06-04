# DFD COMPLETE GUIDE - Master Index
## Everything You Need to Draw Professional Data Flow Diagrams

**Last Updated:** April 15, 2026  
**Project:** PQC Evidence Storing System  
**Total Pages:** 5 comprehensive guides + code analysis

---

## 📚 DOCUMENTS YOU HAVE

### 1. **DFD_START_HERE.md** ← Begin Here
**Length:** 10 pages  
**Content:**
- Checklist of materials needed
- Step-by-step Level 0 walkthrough (9 phases)
- Quick checking validation
- Time estimates per level
- Next steps progression
- Common mistakes to avoid

**Best For:** Getting started, first-time DFD readers

---

### 2. **DFD_PRECISE_DRAWING_SPEC.md** ← Your Step-by-Step Guide
**Length:** 25+ pages  
**Content:**
- LEVEL 0: Exact coordinates (inches), shapes, labels, 19 data flows
- LEVEL 1 (Process 1.0): 5 sub-processes with all flows
- LEVEL 1 (Process 2.0): 4 sub-processes with all flows  
- LEVEL 1 (Process 3.0): 4 sub-processes with all flows
- LEVEL 2 (Process 2.1): 6 crypto steps + 4 crypto modules
- LEVEL 2 (Process 2.3): 7 decrypt steps + 4 crypto modules
- Summary tables for all components

**Best For:** While actively drawing, reference each step

---

### 3. **DFD_VISUAL_SYMBOLS.md** ← Symbol & Notation Guide
**Length:** 15 pages  
**Content:**
- All DFD shapes explained (process, entity, store)
- How to draw by hand (tools, techniques)
- How to draw digitally (draw.io steps)
- Solid vs dotted line meanings
- Symbol placement guide
- Spacing rules
- Complete legend template
- Color schemes
- Common errors & fixes

**Best For:** Understanding what each symbol means, making it look professional

---

### 4. **CODEBASE_ANALYSIS.md** ← Real System Details
**Length:** 40+ pages  
**Content:**
- All 11 database models with 150+ fields
- All 45+ API endpoints with contracts
- External integrations (none—self-contained)
- File storage flows
- Background processes
- Frontend components
- Cryptography operations
- Security highlights
- Complete summaries

**Best For:** Verifying your diagrams match actual code, understanding data structures

---

### 5. **DFD_METHODOLOGY.md** ← Theory & Concepts
**Length:** 20 pages  
**Content:**
- Complete system architecture
- Each DFD level explained
- Data dictionary for all stores
- Security considerations
- API endpoints mapped to processes
- Common mistakes
- Validation checklist

**Best For:** Understanding DFD concepts, validating diagrams

---

## 🎯 WHAT TO READ WHEN

### Scenario A: "I have 1 hour, just make me a visual"
1. Read: **DFD_VISUAL_SYMBOLS.md** (10 min)
2. Read: **DFD_START_HERE.md** - materials section (5 min)
3. Start drawing Level 0 using coordinates from **DFD_PRECISE_DRAWING_SPEC.md** (45 min)

### Scenario B: "I need to understand the system deeply"
1. Read: **DFD_METHODOLOGY.md** - system overview (15 min)
2. Read: **CODEBASE_ANALYSIS.md** - Section 1 (database models) (20 min)
3. Read: **CODEBASE_ANALYSIS.md** - Section 2 (API endpoints) (20 min)
4. Then: Draw Level 0 + Level 1 (60 min)

### Scenario C: "I need to understand cryptography"
1. Read: **DFD_PRECISE_DRAWING_SPEC.md** - LEVEL 2 sections (15 min)
2. Read: **CODEBASE_ANALYSIS.md** - Section 9 (cryptography) (10 min)
3. Draw Level 2 for processes 2.1 (upload) and 2.3 (retrieval) (60 min)

### Scenario D: "I'm drawing RIGHT NOW"
1. Open: **DFD_PRECISE_DRAWING_SPEC.md**
2. Have nearby: **DFD_VISUAL_SYMBOLS.md** (for shape references)
3. Keep handy: **DFD_START_HERE.md** checklist (for validation)

---

## 📋 QUICK REFERENCE: All Components

### The 4 Main Processes (Level 0)
```
1.0: Authentication & Authorization (5 sub-processes in L1)
     - User registration, login, JWT token generation, refresh rotation
     
2.0: Evidence Management (4 sub-processes in L1)
     - Upload/encrypt, custody records, retrieve/decrypt, court submission
     
3.0: Admin Oversight (4 sub-processes in L1)
     - Evidence approval, user management, health monitoring, audit queries
     
4.0: Audit & Compliance (not subdivided in this project)
     - Hash-chain verification, tamper detection
```

### The 3 External Entities
```
👤 Admin User:
   - Can register new users
   - Can approve/reject evidence
   - Can deactivate users
   - Can access audit logs

👤 Investigator:
   - Can upload evidence
   - Can view own evidence
   - Can submit to court
   - Can request court access for their cases

⚖️ Court User:
   - Read-only access
   - Only to evidence explicitly granted via CaseAccessGrant
   - Time-limited access (15 min to 30 days)
```

### The 5 Data Stores
```
D1: User Database (PostgreSQL/SQLite)
    - users: 24 fields, role-based access
    - refresh_tokens: session management
    - webauthn_credentials: passkey/FIDO2
    
D2: Evidence Database (PostgreSQL/SQLite)
    - evidence: metadata + crypto params (kem_ciphertext, iv, tag, signature)
    - custody_records: chain of custody (action, user, timestamp)
    - case_files: case metadata + linked evidence
    
D3: Audit Logs (PostgreSQL/SQLite)
    - audit_logs: hash-chain (prev_hash → current_hash)
    - system_heartbeats: CPU load tracking (30s intervals)
    
D4: File Storage (Linux Filesystem)
    - /backend/storage/evidence/
    - Files: {file_hash}.enc (binary encrypted data)
    - Immutable: proof via SHA-256 hash
    
D5: Key Vault (Linux Filesystem)
    - /backend/secure/key_vault/
    - Files: user_{id}.json.enc (Fernet-encrypted JSON)
    - Contains: ML-KEM-768 private + ML-DSA-65 private keys
```

### The 19 Data Flows (Level 0)
```
ENTITY → PROCESS FLOWS (Solid, 8 total):
  1. Admin → 1.0: Credentials
  2. 1.0 → Admin: JWT Token
  3. Investigator → 2.0: Evidence File + Metadata
  4. 2.0 → Investigator: Encrypted Evidence / Confirmation
  5. Court User → 2.0: Access Request
  6. 2.0 → Court User: Decrypted Evidence (time-limited)
  7. Admin → 3.0: Management Requests
  8. 3.0 → Admin: Confirmations / Reports

PROCESS → PROCESS FLOWS (Solid, 3 total):
  9. 1.0 → 3.0: New users for verification
  10. 2.0 → 3.0: Pending evidence (approval queue)
  11. 3.0 → 4.0: Admin decisions logged

PROCESS ↔ STORE FLOWS (Dotted, 8 total):
  12. 1.0 ↔ D1: User registration, credentials verification
  13. 1.0 ↔ D5: Store/retrieve encrypted keys
  14. 1.0 → D3: Log auth events
  15. 2.0 ↔ D2: Evidence metadata, custody records
  16. 2.0 ↔ D4: Encrypted file storage
  17. 2.0 ↔ D5: Get public keys (for encryption)
  18. 2.0 → D3: Log evidence actions
  19. 3.0 ↔ D1: User management
```

---

## 🛠️ DRAWING TOOLS COMPARISON

### Recommended: draw.io
✅ Free online tool  
✅ No login required initially  
✅ Built-in DFD shapes  
✅ Export PDF/PNG  
⏱️ 5-minute learning curve

**Start:** draw.io → Create → Blank → Choose DFD template

### Alternative: Pencil & Paper
✅ No tech learning  
✅ Immediate feedback  
✅ Easy revisions  
✅ Tactile experience

**Materials:** 11"×17" A3 paper, ruler, compass, pencil, pen

### Not Recommended This Time: Visio
❌ Expensive ($$$)  
❌ Windows only  
❌ Overkill for this project

---

## ⏱️ TIME ESTIMATES

| Activity | Time | Best For |
|----------|------|----------|
| Read DFD_START_HERE.md | 20 min | First-timers |
| Draw Level 0 | 45 min | Understanding main architecture |
| Draw Level 1 (one process) | 30 min | Understanding sub-processes |
| Draw Level 1 (all 3 processes) | 90 min | Complete process detail |
| Draw Level 2 (Process 2.1) | 30 min | Encryption flow detail |
| Draw Level 2 (Process 2.3) | 30 min | Decryption flow detail |
| Review & validate all | 15 min | Quality check |
| **COMPLETE PACKAGE** | **~3 hours** | Mastery level |

---

## ✅ VALIDATION CHECKLIST

### Before You Start
- [ ] I have DFD_PRECISE_DRAWING_SPEC.md open
- [ ] I have drawing tools ready (paper/pen OR draw.io)
- [ ] I have DFD_VISUAL_SYMBOLS.md bookmarked for reference
- [ ] I understand: circles=processes, boxes=entities, double-lines=stores
- [ ] I know the 4 processes, 3 entities, 5 stores

### After Level 0 DFD
- [ ] 3 external entities (labeled with roles)
- [ ] 4 processes (numbered 1.0-4.0, in circles/ovals)
- [ ] 5 data stores (labeled D1-D5, with double-lines)
- [ ] 19 data flows (solid + dotted, all labeled)
- [ ] Legend present (shapes explained)
- [ ] No process has ONLY input (all have output)
- [ ] No external entity talks directly to store
- [ ] All flows clearly labeled with data types
- [ ] Proper margins/spacing
- [ ] Readable at arm's length

### After Level 1 DFD (any process)
- [ ] Parent process replaced with sub-processes (typically 3-6)
- [ ] Sub-process numbers correct (1.1, 1.2, 1.3... or 2.1, 2.2, 2.3...)
- [ ] All sub-processes have inputs and outputs
- [ ] Data flows between sub-processes shown
- [ ] Same data stores accessed as parent
- [ ] Flow is logical (left-to-right or top-to-bottom)

### After Level 2 DFD (Process 2.1 or 2.3)
- [ ] 5-8 detailed sequential steps
- [ ] Cryptographic modules shown (KEM, HKDF, AES, DSA)
- [ ] Input data types specified
- [ ] Output data types specified
- [ ] Crypto module connections clear
- [ ] Data transformations visible at each step

---

## 🔐 SECURITY ELEMENTS IN YOUR DFD

**Encryption Points (highlight in Level 2):**
- ✓ Evidence files encrypted with AES-256-GCM (Process 2.1)
- ✓ Private keys stored encrypted in vault (D5)
- ✓ Sensitive DB fields encrypted at ORM (D1, D2, D3)
- ✓ User credentials hashed (not stored plaintext)

**Authentication Points:**
- ✓ All flows from users require JWT token (Process 1.0)
- ✓ Access rights verified per user role (D1)
- ✓ Evidence access limited by approval_status (Process 2.3)
- ✓ Court access time-limited (CaseAccessGrant expires_at)

**Audit Trail:**
- ✓ Every action logged to D3 (all processes → D3)
- ✓ Hash-chain integrity (prev_hash → current_hash)
- ✓ Tamper detection (Process 4.0 / Process 3.4)

---

## 📞 TROUBLESHOOTING

### "I can't fit everything on one page!"
→ Use multiple pages:
   - Page 1: Level 0 (main architecture)
   - Page 2: Process 1.0 (auth detail)
   - Page 3: Process 2.0 (evidence detail)
   - Page 4: Process 2.1 (encryption detail)

### "The flows are confusing!"
→ Use different line styles:
   - Solid = User/data interaction
   - Dotted = Database access
   - Double-arrow = Bidirectional

### "I don't understand the crypto!"
→ Start without Level 2:
   - Draw Level 0 + Level 1 first
   - Understand overall flow
   - Return to Level 2 later for deep dive

### "Which process should I detail first?"
→ Recommended order:
   1. Process 1.0 (Authentication) - simplest, most familiar
   2. Process 2.0 (Evidence) - most complex, shows main value
   3. Process 3.0 (Admin) - builds on 1.0 and 2.0

---

## 🎓 LEARNING PATH (RECOMMENDED)

### Week 1: Foundation
- [ ] Read DFD_METHODOLOGY.md (understand concepts)
- [ ] Read CODEBASE_ANALYSIS.md sections 1-2 (understand data)
- [ ] Draw Level 0 DFD (45 min)
- [ ] Validate against checklist above

### Week 2: Detail
- [ ] Read DFD_PRECISE_DRAWING_SPEC.md for Process 1.0
- [ ] Draw Level 1 for Process 1.0 (30 min)
- [ ] Read DFD_PRECISE_DRAWING_SPEC.md for Process 2.0
- [ ] Draw Level 1 for Process 2.0 (30 min)

### Week 3: Security Deep Dive (Optional)
- [ ] Read CODEBASE_ANALYSIS.md section 9 (cryptography)
- [ ] Read DFD_PRECISE_DRAWING_SPEC.md for Process 2.1
- [ ] Draw Level 2 for Process 2.1 (encryption steps)
- [ ] Draw Level 2 for Process 2.3 (decryption steps)

### Week 4: Polish & Present
- [ ] Compile all diagrams into single PDF
- [ ] Add to project documentation: `/docs/DFD_DIAGRAMS.pdf`
- [ ] Create summary document
- [ ] Present to team

---

## 📏 QUICK REFERENCE: COORDINATES

### Level 0 Standard Positions (11"×17" A3 landscape)

**External Entities (Top, y=1"):**
```
Admin:       x=1" (left)        width=2" height=1"
Investigator: x=5" (center)     width=2" height=1"
Court User:   x=9" (right)      width=2" height=1"
```

**Main Processes (Middle, y=3.5"):**
```
1.0: x=1"   (left)      diameter=1.2"×0.8"
2.0: x=3.5" (center-l)  diameter=1.2"×0.8"
3.0: x=6"   (center-r)  diameter=1.2"×0.8"
4.0: x=8.5" (right)     diameter=1.2"×0.8"
```

**Data Stores (Bottom, y=6"):**
```
D1: x=0.5"   width=1.8"
D2: x=2.5"   width=2"
D3: x=4.7"   width=1.8"
D4: x=6.7"   width=1.8"
D5: x=8.7"   width=1.5"
```

(Full coordinates for each flow in DFD_PRECISE_DRAWING_SPEC.md Steps 1-5)

---

## 🚀 NEXT ACTIONS

**Pick ONE:**

### Option A: "I want to understand the system" (Best Overall)
→ Follow: **DFD_START_HERE.md** (45 min) + Draw Level 0 + Draw one Level 1

### Option B: "I have limited time" (Quick Start)
→ Follow: **DFD_VISUAL_SYMBOLS.md** (10 min) + Draw Level 0 (45 min)

### Option C: "I want to understand cryptography" (Security Focus)
→ Follow: **DFD_PRECISE_DRAWING_SPEC.md** Level 2 (30 min) + Draw 2.1 & 2.3 (60 min)

### Option D: "I need to present this to stakeholders" (Professional)
→ Follow: Complete path (3 hours) + Export all to PDF + Compile into presentation

---

## 📄 DOCUMENT MAP

```
You are here ↓

DFD_COMPLETE_GUIDE.md (This file)
├─ START HERE
│  └─ DFD_START_HERE.md ..................... Materials + Level 0 walkthrough
│
├─ WHILE DRAWING
│  ├─ DFD_PRECISE_DRAWING_SPEC.md ......... Exact positions + all levels
│  └─ DFD_VISUAL_SYMBOLS.md ............... Shape definitions + techniques
│
├─ UNDERSTANDING
│  ├─ DFD_METHODOLOGY.md .................. Concepts + theory
│  └─ CODEBASE_ANALYSIS.md ............... Real system details
│
└─ REFERENCE
   ├─ DFD_DOCUMENTATION_INDEX.md (OLD) ... Navigation guide
   └─ DFD_DRAWING_GUIDE.md (OLD) ......... Steps + tools

USE THE NEW ONES (above) - they're more detailed!
```

---

## ⭐ QUICK START (RIGHT NOW)

**If you have 1 hour:**
1. Open: **DFD_START_HERE.md** (read materials + level 0 steps)
2. Open: **DFD_PRECISE_DRAWING_SPEC.md** (reference while drawing)
3. Get: Paper/pen or open draw.io
4. Draw: Level 0 (45 min following steps)
5. Validate: Use checklist in DFD_START_HERE.md

**If you have 5 minutes:**
1. Bookmark: **DFD_PRECISE_DRAWING_SPEC.md**
2. Remember: 4 circles (processes), 3 boxes (entities), 5 double-lines (stores)
3. Remember: Solid arrows (flows), Dotted arrows (store access)
4. Return when you have time

---

## 📧 Questions?

| Question | Answer Location |
|----------|-----------------|
| How do I draw a circle? | DFD_VISUAL_SYMBOLS.md → Shape 1 |
| What goes where? | DFD_PRECISE_DRAWING_SPEC.md → Step-by-step |
| What does this symbol mean? | DFD_VISUAL_SYMBOLS.md → Complete reference |
| What are the real data types? | CODEBASE_ANALYSIS.md → Sections 1-2 |
| How do I validate? | DFD_START_HERE.md → Checking section |
| What are the cryptographic flows? | DFD_PRECISE_DRAWING_SPEC.md → Level 2 DFD |
| Should I use Level 1 or Level 2? | DFD_METHODOLOGY.md → Levels table |

---

**YOU'RE READY. START DRAWING NOW.** 🎨

Open **DFD_PRECISE_DRAWING_SPEC.md** and begin with Level 0.

Follow the exact positions and labels.

Validate using the checklist in **DFD_START_HERE.md**.

Finish in ~45 minutes.

Then expand to Level 1 (30 min each process) and Level 2 (30 min each).

**Total mastery time: 3 hours.**

