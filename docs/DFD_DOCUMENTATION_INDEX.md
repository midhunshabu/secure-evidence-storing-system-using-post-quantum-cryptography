# PQC Evidence System - DFD Documentation Index

## 📚 Complete DFD Documentation Set

This folder contains everything you need to understand and draw Data Flow Diagrams for the PQC Evidence Storing System.

---

## 📖 Documentation Files

### 1. **DFD_METHODOLOGY.md** ← START HERE
**What it covers:**
- Complete system architecture summary
- All 4 DFD levels explained (Context, L0, L1, L2)
- Data dictionary for all 5 data stores
- Security considerations in the system
- 27-column API → Process mapping table
- Common mistakes to avoid

**Best for:** Understanding what each DFD level should contain
**Read time:** 15-20 minutes

---

### 2. **DFD_QUICK_REFERENCE.md** ← REFERENCE WHILE DRAWING
**What it covers:**
- ASCII art visual summaries
- Quick data flows by process
- Cryptographic transformation details
- Data store schema summary
- Workflow by role (Admin, Investigator, Court User)
- Security checkpoint matrix
- Common DFD patterns
- Drawing tips and templates

**Best for:** Quick lookup while drawing, visual learners
**Read time:** 10-15 minutes (reference as needed)

---

### 3. **DFD_DRAWING_GUIDE.md** ← IMPLEMENTATION GUIDE
**What it covers:**
- Step-by-step instructions for each DFD level
- What to draw at each stage
- Time estimates per diagram
- Tool recommendations with pros/cons
- Professional tips for visual appearance
- Validation checklist for each level
- Next actions roadmap

**Best for:** Hands-on drawing, beginners
**Read time:** 20-30 minutes (while actively drawing)

---

## 🎯 Quick Start

### For Different Audiences

#### I'm a **Project Manager**
→ Read: DFD_METHODOLOGY.md (Context → Level 0)
→ Focus on: 4 main processes, 5 data stores, 3 actors
→ Time: 5 min

#### I'm a **Developer**
→ Read: DFD_METHODOLOGY.md (all levels) + DFD_QUICK_REFERENCE.md
→ Focus on: Level 1 details, data flows, security checkpoints
→ Time: 30 min

#### I'm a **Security Engineer**
→ Read: DFD_QUICK_REFERENCE.md (Security Checkpoints section)
→ Focus on: Level 2 crypto flows, encryption details, key management
→ Time: 20 min

#### I'm a **Analyst/BA**
→ Read: DFD_DRAWING_GUIDE.md
→ Focus on: Step-by-step drawing instructions, validation checklist
→ Time: 2 hours (actual drawing)

---

## 🏗️ DFD Levels at a Glance

```
Level -1: CONTEXT (1 hour to understand)
   └─ System as ONE box, 3 external actors
   └─ Shows main input/output flows
   └─ Audience: Executives, Stakeholders

Level 0: MAIN PROCESSES (2 hours to draw)
   ├─ 1.0 Authentication & Authorization
   ├─ 2.0 Evidence Management
   ├─ 3.0 Admin Oversight
   ├─ 4.0 Audit & Compliance
   └─ 5 Data Stores: D1, D2, D3, D4, D5
   └─ Audience: Project Managers, Architects

Level 1: SUB-PROCESSES (3-4 hours to draw)
   ├─ 1.0 breaks into: 1.1, 1.2, 1.3, 1.4, 1.5
   ├─ 2.0 breaks into: 2.1, 2.2, 2.3, 2.4
   ├─ 3.0 breaks into: 3.1, 3.2, 3.3, 3.4
   └─ 4.0 breaks into: 4.1, 4.2, 4.3
   └─ Audience: Developers, QA, Business Analysts

Level 2: CRYPTOGRAPHIC DETAIL (2-3 hours to draw)
   ├─ 2.1 Upload: 6 detailed steps
   ├─ 2.3 Retrieve: 7 detailed steps
   ├─ Shows: KEM, AES-GCM, HKDF, Signatures
   └─ Audience: Security Engineers, Architects
```

---

## 🔐 Key Processes Summary

### Authentication & Authorization (1.0)
```
Input:  username, password, role
Output: JWT access token, refresh token
Stores: D1 (users), D5 (keys), D3 (audit)
```

### Evidence Management (2.0)
```
Input:  evidence file + metadata (upload) OR evidence_id (retrieve)
Output: encrypted file stored OR decrypted file returned
Stores: D2, D4 (file storage), D5 (keys)
Key:    Uses KEM + AES-256-GCM encryption
```

### Admin Oversight (3.0)
```
Input:  approve/reject decisions, user mgmt requests, query requests
Output: approvals applied, users created, reports generated
Stores: D1, D2, D3
```

### Audit & Compliance (4.0)
```
Input:  audit queries
Output: audit reports with hash-chain integrity verification
Stores: D3 (audit logs with prev_hash, current_hash)
Key:    Tamper detection via hash chain
```

---

## 📊 Data Stores Quick Reference

| Store | Purpose | Key Tables | Encryption |
|-------|---------|-----------|-----------|
| **D1** | User Data | users, refresh_tokens | Email, aadhar_hash, pqc_keys |
| **D2** | Evidence | evidence, custody_records | case_id, filename, description |
| **D3** | Audit | audit_logs, system_heartbeats | All sensitive fields, prev_hash |
| **D4** | File Storage | Encrypted evidence files | AES-256-GCM |
| **D5** | Key Vault | Encrypted PQC keys | Fernet encryption |

---

## 🔄 Critical Data Flows

### Authentication Flow
```
User → (credentials) → 1.0 → (JWT token) → APP
```

### Evidence Upload Flow
```
Investigator → (file) → 2.1 → (validate) → (encrypt with public key) → D2/D4
```

### Evidence Retrieval Flow
```
CourtUser → (access) → 2.3 → (decrypt with private key) → (plaintext) → CourtUser
```

### Admin Approval Flow
```
Admin → (approve) → 3.1 → (sign) → D2 → (audit log) → D3
```

---

## 🛠️ Tools Recommended

### For Drawing DFDs
1. **draw.io** - Free, no login, built-in DFD shapes
2. **Lucidchart** - Professional, trial available
3. **Mermaid.js** - Text-based, version control friendly
4. **Microsoft Visio** - Enterprise, Windows only

### For Storing DFDs
1. **GitHub** - Version control (use PNG exports + Mermaid source)
2. **Google Drive** - Easy sharing
3. **Project Management Tool** - Confluence, Jira, Azure DevOps

---

## ✅ Validation Checklist

### Context Level
- [ ] Exactly 1 process box (system)
- [ ] 3 external entities (actors)
- [ ] Bi-directional flows with labels

### Level 0
- [ ] 4 processes numbered 1.0—4.0
- [ ] 5 data stores labeled D1—D5
- [ ] All flows labeled with data types
- [ ] No black holes (input/output on all processes)
- [ ] External entities don't directly touch stores

### Level 1
- [ ] Each process has 3-6 sub-processes
- [ ] Numbering: 1.1, 1.2, 1.3... 2.1, 2.2...
- [ ] Sequential flow shows logical order
- [ ] Store access appropriate per sub-process

### Level 2
- [ ] Cryptographic transformations clear
- [ ] Data types labeled at each step
- [ ] Shows KEM, AES-GCM behavior
- [ ] Input/output matches parent Level 1 process

---

## 📝 Examples Included

### Level 1 Breakdowns Shown
1. **Authentication (1.0)** → 1.1 through 1.5
2. **Evidence Upload (2.0)** → 2.1 through 2.4
3. **Admin Oversight (3.0)** → 3.1 through 3.4

### Level 2 Breakdowns Shown
1. **Upload & Encryption (2.1)** → 2.1.1 through 2.1.6
2. **Retrieve & Decryption (2.3)** → 2.3.1 through 2.3.7

---

## 🎓 Learning Path

### Day 1: Understand
1. Read DFD_METHODOLOGY.md (Context + Level 0 sections)
2. Review DFD diagrams in sections above
3. Understand 4 processes + 5 stores

### Day 2: Draw Level 0
1. Read DFD_DRAWING_GUIDE.md (Step 2)
2. Draw Context + Level 0 DFDs
3. Validate against checklist

### Day 3: Draw Level 1
1. Read DFD_DRAWING_GUIDE.md (Steps 3-4)
2. Draw Level 1 for processes 1.0 and 2.0
3. Validate data flows

### Day 4: Draw Level 2
1. Read DFD_DRAWING_GUIDE.md (Steps 5-6)
2. Draw Level 2 for 2.1 (upload) and 2.3 (retrieve)
3. Understand cryptographic transformations

### Day 5: Review & Refine
1. Review all diagrams
2. Check against actual code (backend/app/routes/)
3. Update if needed
4. Export to PDF/PNG for documentation

**Total time commitment: ~8-10 hours** (including hands-on drawing)

---

## 🔗 Related Project Files

- **Backend Routes**: `backend/app/routes/` (auth.py, evidence.py, admin.py)
- **Models**: `backend/app/models/` (user.py, evidence.py, audit_log.py)
- **Encryption Engine**: `backend/app/modules/pqc_engine.py`
- **Security**: `backend/app/security/key_vault.py`
- **Frontend**: `react-app/src/` (components, api.js)

---

## 🚀 Next Steps

1. Choose your drawing tool (recommend: **draw.io**)
2. Start with Context Diagram (5 min)
3. Progress to Level 0 (20 min)
4. Expand to Level 1 processes(45 min)
5. Detail Level 2 for critical flows (40 min)
6. Document findings and share with team

---

## 💡 Tips for Success

- ✅ Draw incrementally - don't try all levels at once
- ✅ Use color coding - different colors per process level
- ✅ Validate early - check against code frequently
- ✅ Get feedback - share with team members
- ✅ Document assumptions - note decisions made
- ✅ Keep copies - save each version (L0-v1, L0-v2, etc.)
- ✅ Reference code - have routes.py open while drawing

---

## 📞 Questions?

Refer to:
1. **What should Level X show?** → DFD_METHODOLOGY.md
2. **How do I draw this?** → DFD_DRAWING_GUIDE.md
3. **What data moves here?** → DFD_QUICK_REFERENCE.md
4. **Where's the example?** → Look for Mermaid diagrams in methodology

---

## 📄 Document Versions

- **DFD_METHODOLOGY.md** - v1.0 (2026-02-23): Comprehensive guide
- **DFD_QUICK_REFERENCE.md** - v1.0 (2026-02-23): Quick lookup tables
- **DFD_DRAWING_GUIDE.md** - v1.0 (2026-02-23): Step-by-step instructions
- **DFD_DOCUMENTATION_INDEX.md** - v1.0 (2026-02-23): This file

---

## License

These DFD guides are part of the PQC Evidence Storing System documentation.
Adapt and use as needed for your purposes.

