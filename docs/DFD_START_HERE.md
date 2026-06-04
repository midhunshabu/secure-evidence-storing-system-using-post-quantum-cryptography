# DFD DRAWING - START HERE
## Quick Checklist & Getting Started Guide

---

## WHAT YOU NOW HAVE

✅ **DFD_PRECISE_DRAWING_SPEC.md** - Exact positions (inches), shapes, labels, and data flows  
✅ **CODEBASE_ANALYSIS.md** - All 11 database tables, 45+ endpoints, real data structures  
✅ **DFD_METHODOLOGY.md** - Concepts and theory  

**You're ready to draw RIGHT NOW.**

---

## MATERIALS NEEDED

### Physical
- [ ] Large paper (11" × 17" A3 landscape)  
- [ ] Ruler (12"minimum)
- [ ] Compass or circle template
- [ ] Pencil + eraser
- [ ] Black ink pen (for final version)
- [ ] Colored pens (optional: blue, red, green, orange)

### Digital
- [ ] draw.io (free, no signup) OR Lucidchart (free trial)  
- [ ] Shapes library for DFD (usually built-in)
- [ ] Export to PDF/PNG capability

---

## STEP-BY-STEP: DRAW LEVEL 0 (Start Here)

### Phase 1: Setup (5 minutes)

**If Drawing by Hand:**
1. Place 11"×17" paper in landscape
2. Draw 0.5" margin on all sides
3. Draw light grid lines (1" spacing)
4. Pencil in working area

**If Drawing Digitally:**
1. New document, 11" × 17" landscape
2. Enable guides/grid at 1" intervals
3. Set zoom to fit page

### Phase 2: External Entities (5 minutes)

**Follow DFD_PRECISE_DRAWING_SPEC.md - STEP 1**

Draw THREE rectangles at top:
```
Position 1: Top-left (1" from left, 1" from top)
Size: 2" × 1"
Label: "👤 Admin User"
Inside: "Registration, Approval, User Mgmt"

Position 2: Top-center (5" from left, 1" from top)
Size: 2" × 1"
Label: "👤 Investigator"
Inside: "Upload Evidence, Submit to Court"

Position 3: Top-right (9" from left, 1" from top)
Size: 2" × 1"
Label: "⚖️ Court User"
Inside: "View Evidence, Request Access"
```

### Phase 3: Four Processes (5 minutes)

**Follow DFD_PRECISE_DRAWING_SPEC.md - STEP 2**

Draw FOUR circles at center:
```
Position 1: Top-left (1" from left, 3.5" from top)
Diameter: 1.2" × 0.8"
Label: "1.0 Auth & AuthZ"

Position 2: Top-center-left (3.5" from left, 3.5" from top)
Diameter: 1.2" × 0.8"
Label: "2.0 Evidence Mgmt"

Position 3: Top-center-right (6" from left, 3.5" from top)
Diameter: 1.2" × 0.8"
Label: "3.0 Admin Overview"

Position 4: Top-right (8.5" from left, 3.5" from top)
Diameter: 1.2" × 0.8"
Label: "4.0 Audit & Compliance"
```

### Phase 4: Five Data Stores (5 minutes)

**Follow DFD_PRECISE_DRAWING_SPEC.md - STEP 3**

Draw FIVE double-line boxes at bottom:
```
Position 1: (0.5" from left, 6" from top)
Size: 1.8" × 0.5"
Label: "D1 User Database"
Inside: "users, refresh_tokens"

Position 2: (2.5" from left, 6" from top)
Size: 2" × 0.5"
Label: "D2 Evidence Database"
Inside: "evidence, custody_records, cases"

Position 3: (4.7" from left, 6" from top)
Size: 1.8" × 0.5"
Label: "D3 Audit Logs"
Inside: "audit_logs, heartbeats"

Position 4: (6.7" from left, 6" from top)
Size: 1.8" × 0.5"
Label: "D4 File Storage"
Inside: "/backend/storage/evidence/"

Position 5: (8.7" from left, 6" from top)
Size: 1.5" × 0.5"
Label: "D5 Key Vault"
Inside: "/backend/secure/key_vault/"
```

### Phase 5: Admin Flows (5 minutes)

**Follow DFD_PRECISE_DRAWING_SPEC.md - STEP 4**

Draw ARROWS from Admin to processes:
```
Arrow 1: Admin box → Process 1.0
  From: Admin right edge (2" + 0.5" = 2.5" x-coordinate)
  To: Process 1.0 left edge (1" - 0.6" = center of circle)
  Style: SOLID arrow
  Label: "Credentials / Register"

Arrow 2: Process 1.0 → Admin box
  Style: SOLID arrow (return)
  Label: "JWT Token"

Arrow 3: Admin box → Process 3.0
  Style: SOLID arrow
  Label: "Approval Requests"

Arrow 4: Process 3.0 → Admin box
  Style: SOLID arrow
  Label: "Confirmation / Reports"
```

### Phase 6: Investigator Flows (5 minutes)

```
Arrow 5: Investigator box → Process 2.0
  Label: "Evidence File + Metadata"

Arrow 6: Process 2.0 → Investigator box
  Label: "Encrypted Evidence / Confirmation"
```

### Phase 7: Court User Flows (5 minutes)

```
Arrow 7: Court User box → Process 2.0
  Label: "Access Request"

Arrow 8: Process 2.0 → Court User box
  Label: "Decrypted Evidence (time-limited)"
```

### Phase 8: Database Access Flows (10 minutes)

**Use DOTTED lines (not solid)**

```
Arrow 9: Process 1.0 ↔ D1
  Label (out): "Write: user, keys"
  Label (return): "Read: user record, password hash"
  
Arrow 10: Process 1.0 ↔ D5
  Label (out): "Write: encrypted private keys"
  Label (return): "Read: public key"

Arrow 11: Process 1.0 → D3
  Label: "Write: auth events"

Arrow 12: Process 2.0 ↔ D2
  Label (out): "Write: evidence metadata, custody"
  Label (return): "Read: evidence records"

Arrow 13: Process 2.0 ↔ D4
  Label (out): "Write: encrypted file"
  Label (return): "Read: encrypted file"

Arrow 14: Process 2.0 ↔ D5
  Label (out): "Write: keys (registration)"
  Label (return): "Read: public/private key pair"

Arrow 15: Process 2.0 → D3
  Label: "Write: upload/view/download actions"

Arrow 16: Process 3.0 ↔ D1
  Label (out): "Write: user activation"
  Label (return): "Read: user list"

Arrow 17: Process 3.0 ↔ D2
  Label (out): "Write: approval decision"
  Label (return): "Read: pending evidence"

Arrow 18: Process 3.0 ↔ D3
  Label (out): "Write: admin actions"
  Label (return): "Read: audit logs for reports"

Arrow 19: Process 4.0 ← D3
  Label: "Read: all audit logs (hash-chain)"
```

### Phase 9: Legend & Title (5 minutes)

Add in bottom-right:
```
LEGEND:
○ = Process
▭ = External Entity
═══ = Data Store
─→ = Solid Flow (data)
···→ = Dotted Flow (store access)
↔ = Bidirectional
```

Add at top:
```
Title: PQC Evidence Storing System - Level 0 DFD
Subtitle: Main Processes & Data Repository
Date: April 15, 2026
Version: 1.0
```

### **TOTAL TIME: ~45 minutes**

---

## QUICK CHECKING: Did You Get It Right?

After drawing Level 0, verify:

- [ ] 3 external entities (Admin, Investigator, Court User)
- [ ] 4 processes (1.0, 2.0, 3.0, 4.0)
- [ ] 5 data stores (D1-D5)
- [ ] 19 total data flows (solid + dotted)
- [ ] Every flow has a label describing the data
- [ ] No process has ONLY input (all must output)
- [ ] No external entity talks directly to data store
- [ ] Process numbers are correct (1.0, 2.0, 3.0, 4.0)
- [ ] Store IDs are labeled (D1, D2, D3, D4, D5)
- [ ] Legend is present

---

## NEXT: DRAW LEVEL 1 (Optional but Recommended)

Once Level 0 is done, choose:

### Option A: Detail Authentication (1.0)
**Time:** 30 minutes
**Reference:** DFD_PRECISE_DRAWING_SPEC.md - LEVEL 1 DFD (PROCESS 1.0)
**New page, 5 sub-processes (1.1—1.5), 3 data stores (D1, D3, D5)**

### Option B: Detail Evidence Management (2.0)
**Time:** 30 minutes
**Reference:** DFD_PRECISE_DRAWING_SPEC.md - LEVEL 1 DFD (PROCESS 2.0)
**New page, 4 sub-processes (2.1—2.4), 4 data stores (D1, D2, D4, D5)**

### Option C: Detail Admin Oversight (3.0)
**Time:** 30 minutes
**Reference:** DFD_PRECISE_DRAWING_SPEC.md - LEVEL 1 DFD (PROCESS 3.0)
**New page, 4 sub-processes (3.1—3.4), 3 data stores (D1, D2, D3)**

---

## THEN: DRAW LEVEL 2 (Security-Critical - Recommended)

Choose ONE to detail:

### Option A: Evidence Upload & Encryption (2.1)
**Time:** 30 minutes
**Reference:** DFD_PRECISE_DRAWING_SPEC.md - LEVEL 2 DFD (Process 2.1)
**6 sequential steps + 4 crypto modules (KEM, HKDF, AES, DSA)**

### Option B: Evidence Retrieval & Decryption (2.3)
**Time:** 30 minutes
**Reference:** DFD_PRECISE_DRAWING_SPEC.md - LEVEL 2 DFD (Process 2.3)
**7 sequential steps + 4 crypto modules (same as 2.1 but reverse)**

---

## TOOLS COMPARISON: What to Use

### **draw.io (RECOMMENDED START)**
```
✅ Pros:
  - Free, no login required
  - Works in browser
  - Built-in DFD shapes
  - Easy to save as PDF/PNG
  - Collaboration via web link
  
❌ Cons:
  - Requires learning tool (5 min)
  - No offline mode (unless installed)

👉 HOW TO START:
  1. Go to draw.io
  2. Create → New blank diagram
  3. Select "DFD" from shape library (left sidebar)
  4. Drag circles, rectangles, lines onto canvas
  5. Position using properties panel
  6. Export → PDF when done
```

### **Pencil & Paper (FAST START)**
```
✅ Pros:
  - No tech learning curve
  - Immediate feedback
  - Easy to erase and revise
  
❌ Cons:
  - Must redraw for final version (unless you're artistic)
  - Hard to align if page is small

👉 HOW TO START:
  1. Get 11"×17" paper (A3)
  2. Draw light 1" grid with pencil
  3. Follow positions in DFD_PRECISE_DRAWING_SPEC.md
  4. Use ruler for straight lines
  5. Use compass for circles
  6. Scan & upload when done
```

### **Microsoft Visio (IF AVAILABLE)**
```
✅ Pros:
  - Professional templates
  - Alignment tools
  
❌ Cons:
  - $$ cost
  - Windows only
  - Overkill for this project

👉 SKIP THIS unless you already own it
```

---

## COMMON MISTAKES: Avoid These

❌ **MISTAKE 1: Process without output**
- ✓ FIX: Every circle must have at least one outgoing arrow

❌ **MISTAKE 2: External entity talks to data store**
- ✓ FIX: All store access must go through a process

❌ **MISTAKE 3: No labels on flows**
- ✓ FIX: Every arrow gets a data description label

❌ **MISTAKE 4: Mixing line types (solid vs dotted)**
- ✓ FIX: Solid = process-to-entity/process-to-process
        Dotted = process-to-data-store

❌ **MISTAKE 5: Wrong numbering (1.0.1 instead of 1.1)**
- ✓ FIX: Level 0: X.0
        Level 1: X.1, X.2, X.3...
        Level 2: X.1.1, X.1.2, X.1.3...

---

## REAL DATA FROM CODE

While drawing, keep these FACTS visible:

### Process 1.0 (Auth) Handles:
- **Input:** username, email, password (plaintext over HTTPS only)
- **Output:** JWT access token (1 hour expiry) + Refresh token (7 days)
- **Stores:** users, refresh_tokens, webauthn_credentials
- **Crypto:** Uses ML-KEM-768 (KEM), ML-DSA-65 (Signature)

### Process 2.0 (Evidence) Handles:
- **Input:** Evidence file (any format, multipart upload) + metadata
- **Output:** Encrypted evidence file path + custody record ID
- **Stores:** evidence metadata, custody_records, encrypted files
- **Crypto:** Uses KEM encapsulation, AES-256-GCM encryption, ML-DSA signatures

### Process 3.0 (Admin) Handles:
- **Input:** Approval decisions, user operations, audit queries
- **Output:** Confirmations, audit trails, system health metrics
- **Stores:** All stores (full admin access)
- **Verification:** Hash-chain integrity check (SHA3-256)

### Process 4.0 (Audit) Handles:
- **Input:** Compliance queries
- **Output:** Audit reports with tamper-detection status
- **Stores:** audit_logs (read-only for verification)
- **Verification:** Compares current_hash = SHA3-256(prev_hash | payload)

---

## YOUR CHECKLIST: Ready to Start?

Before you begin drawing:

- [ ] I have DFD_PRECISE_DRAWING_SPEC.md open
- [ ] I have paper/canvas ready (11"×17" or digital)
- [ ] I have a ruler (if on paper)
- [ ] I understand: circles=processes, rectangles=entities, double-lines=stores
- [ ] I know the 4 main processes: 1.0, 2.0, 3.0, 4.0
- [ ] I know the 3 actors: Admin, Investigator, Court User
- [ ] I know the 5 data stores: D1—D5
- [ ] I understand solid arrows = data flows, dotted = store access
- [ ] I'm prepared to spend 45 minutes on Level 0
- [ ] I have a pen/pencil and eraser handy

**✅ IF ALL CHECKED: YOU'RE READY. START NOW.**

---

## HOW TO HANDLE COMPLEXITY

**"This is too detailed!"**
→ Start with Level 0 only (4 processes). Level 1 & 2 are optional.

**"I can't fit everything on one page!"**
→ Use multiple pages:
  - Page 1: Level 0
  - Page 2: Process 1.0 Level 1
  - Page 3: Process 2.0 Level 1
  - Page 4: Process 2.1 Level 2
  → All connected by numbered references

**"The crypto parts are confusing!"**
→ Skip Level 2 details initially. Level 1 is enough to understand data flow.
→ Return to Level 2 (2.1, 2.3) when you want to understand encryption.

**"I want to verify against actual code!"**
→ Reference CODEBASE_ANALYSIS.md sections:
  - API Endpoints match processes
  - Database models match data stores
  - Data flow examples shown
  
---

## NEXT STEPS (In Order)

1. **THIS WEEK:**
   - [ ] Draw Level 0 (45 min)
   - [ ] Verify against checklist above
   - [ ] Scan/export to PDF

2. **NEXT WEEK:**
   - [ ] Choose one Level 1 process (auth, evidence, or admin)
   - [ ] Draw Level 1 detail (30 min)
   - [ ] Connect to Level 0

3. **OPTIONAL - SECURITY FOCUS:**
   - [ ] Draw Level 2 for Process 2.1 (Upload encryption)
   - [ ] Draw Level 2 for Process 2.3 (Retrieval decryption)
   - [ ] This shows post-quantum crypto flow clearly

4. **FINAL:**
   - [ ] Compile all pages into PDF
   - [ ] Add to project documentation: /docs/DFD_DIAGRAMS.pdf
   - [ ] Share with team for review

---

## SUPPORT DOCUMENTS

If you need to reference:

| Question | Reference Document |
|----------|-------------------|
| "What goes in this position?" | DFD_PRECISE_DRAWING_SPEC.md (STEP 1-7) |
| "What data flows here?" | CODEBASE_ANALYSIS.md (Section 2: API Endpoints) |
| "What's in this data store?" | CODEBASE_ANALYSIS.md (Section 1: Database Models) |
| "What's the concept?" | DFD_METHODOLOGY.md (Levels explained) |
| "How do I verify my drawing?" | This document (Checking section) |

---

## You're All Set! 🎉

**Go draw your DFD now.**

Use DFD_PRECISE_DRAWING_SPEC.md as your step-by-step guide.

Target: Finish Level 0 in 45 minutes.

Then Level 1 in 30 minutes.

Then Level 2 (optional) in 30 minutes.

**Total investment: 1.5 hours to complete system understanding.**

---

