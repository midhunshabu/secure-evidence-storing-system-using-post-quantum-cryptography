# DFD QUICK REFERENCE CARD
## One-Page Cheat Sheet for Drawing

**Print this page and keep it next to you while drawing!**

---

## WHAT TO DRAW (Level 0)

### TOP OF PAGE (Entities)
```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ 👤 Admin │         │👤 Invest │         │⚖️ Court  │
│  User    │         │gator     │         │ User     │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
```
**Where:** 1" from top, evenly spaced  
**Size:** 2" × 1" each  
**Type:** Rectangle  
**Color (optional):** Light gray

---

### MIDDLE OF PAGE (Processes)
```
    ╭────╮              ╭────╮              ╭────╮              ╭────╮
    │1.0 │              │2.0 │              │3.0 │              │4.0 │
    │Auth│              │Evid│              │Adm │              │Aud │
    ╰────╯              ╰────╯              ╰────╯              ╰────╯
```
**Where:** 3.5" from top, evenly spaced  
**Size:** 1.2" diameter (circles)  
**Type:** Circle or oval  
**Color (optional):** Light blue/purple/orange/green

---

### BOTTOM OF PAGE (Data Stores)
```
════════════          ════════════          ════════════
  D1: Users             D2: Evidence          D3: Audit
════════════          ════════════          ════════════

════════════          ════════════
  D4: Files              D5: Keys
════════════          ════════════
```
**Where:** 6" from top  
**Size:** 1.5"-2" wide × 0.5" tall  
**Type:** Double horizontal lines  
**Color (optional):** Light yellow

---

## DATA FLOWS TO DRAW (19 Total)

### FROM ENTITIES TO PROCESSES (Solid Lines with Arrows)
```
1. Admin → 1.0: "Register/Login credentials"
2. 1.0 → Admin: "JWT Token"

3. Investigator → 2.0: "Evidence File + Metadata"
4. 2.0 → Investigator: "Encrypted Evidence"

5. Court User → 2.0: "Access Request"
6. 2.0 → Court User: "Decrypted Evidence (time-limited)"

7. Admin → 3.0: "Approval Requests"
8. 3.0 → Admin: "Confirmation / Reports"
```

### FROM PROCESSES TO DATA STORES (Dotted Lines)
```
9. 1.0 ↔ D1: "Write: users / Read: credentials"
10. 1.0 ↔ D5: "Write: encrypted keys / Read: public key"
11. 1.0 → D3: "Write: auth events"

12. 2.0 ↔ D2: "Write: metadata / Read: evidence"
13. 2.0 ↔ D4: "Write: encrypted file / Read: file"
14. 2.0 ↔ D5: "Write: keys / Read: key pair"
15. 2.0 → D3: "Write: upload/view/download actions"

16. 3.0 ↔ D1: "Write: user mgmt / Read: users"
17. 3.0 ↔ D2: "Write: approval / Read: pending evidence"
18. 3.0 ↔ D3: "Write: admin actions / Read: audit logs"

19. 4.0 ← D3: "Read: audit logs (verify hash-chain)"
```

---

## DRAWING CHECKLIST

### Setup
- [ ] Paper: 11"×17" A3 landscape
- [ ] Tools: Ruler, compass (or circle template), pencil, eraser, pen
- [ ] Margins: 0.5" on all sides
- [ ] Grid: Optional but helpful (1" grid lines)

### Components
- [ ] 3 rectangular boxes (top) = entities
- [ ] 4 circular shapes (middle) = processes
- [ ] 5 double-line boxes (bottom) = stores
- [ ] All labeled with IDs (1.0, 2.0, D1, D2, etc.)

### Lines
- [ ] 8 solid arrows (entity ↔ process)
- [ ] 11 dotted arrows (process ↔ store)
- [ ] Every line has a label describing data

### Validation
- [ ] No entity connects directly to store
- [ ] Every process has input AND output
- [ ] Process IDs correct: 1.0, 2.0, 3.0, 4.0
- [ ] Store IDs correct: D1, D2, D3, D4, D5
- [ ] All flows labeled
- [ ] Legend present (bottom right)
- [ ] Title + date (top right)

---

## LEGEND BOX (Copy to your diagram)

```
╔══════════════════════════╗
║      LEGEND             ║
├──────────────────────────┤
│ ○ = Process             │
│ ▭ = External Entity     │
│ ════ = Data Store       │
│ ──→ = Data Flow        │
│ ····→ = Store Access    │
╚══════════════════════════╝
```

---

## COORDINATES (If Using Digital Tool)

## ENTITIES (Top, y=1")
- Admin: x=1", width=2"
- Investigator: x=5", width=2"
- Court User: x=9", width=2"

## PROCESSES (Middle, y=3.5")
- 1.0: x=1", diameter=1.2"
- 2.0: x=3.5", diameter=1.2"
- 3.0: x=6", diameter=1.2"
- 4.0: x=8.5", diameter=1.2"

## STORES (Bottom, y=6")
- D1: x=0.5", width=1.8"
- D2: x=2.5", width=2"
- D3: x=4.7", width=1.8"
- D4: x=6.7", width=1.8"
- D5: x=8.7", width=1.5"

---

## QUICK TIPS

✓ Use light pencil first (can erase)  
✓ Use ruler for all straight lines  
✓ Use compass for perfect circles  
✓ Double-check alignment before inking  
✓ Leave space between flows (don't cross)  
✓ Label flows ABOVE or BELOW line, not on top  
✓ Make circles roughly same size  
✓ Make boxes roughly same size  
✓ Center text in shapes  
✓ Use consistent line weights  

---

## COMMON MISTAKES (Don't Do These)

❌ Process with only input (no output)  
❌ Entity talking directly to data store  
❌ Solid line for store access (use dotted!)  
❌ Dotted line for entity flow (use solid!)  
❌ Wrong numbering: 1.0.1 instead of 1.1  
❌ No labels on flows  
❌ Tiny text (hard to read)  
❌ Huge shapes (takes too much space)  
❌ Crossing flows (route around edges)  
❌ Missing legend or title  

---

## REAL SYSTEM FACTS

**Database Tables:** users, evidence, custody_records, audit_logs, refresh_tokens, webauthn_credentials, case_files, case_book_pages, court_access_requests, court_access_grants, system_heartbeats

**Encryption:** ML-KEM-768 (KEM), ML-DSA-65 (Signature), AES-256-GCM, HKDF-SHA256

**User Roles:** admin, investigator, court_user

**Evidence Lifecycle:** Upload (pending) → Approve (approved) → Submit to Court → Access (time-limited)

**Audit:** Every action logged + hash-chain (SHA3-256) for tamper detection

---

## TIME TRACKER

- [ ] Materials setup: 5 min
- [ ] Draw entities (top): 5 min
- [ ] Draw processes (middle): 5 min
- [ ] Draw stores (bottom): 5 min
- [ ] Draw entity→process flows: 5 min
- [ ] Draw process→store flows: 10 min
- [ ] Add labels: 5 min
- [ ] Add legend & title: 5 min
- [ ] Validate & final check: 5 min

**TOTAL: ~45 minutes**

---

## NEXT ACTIONS

**After Level 0:**
1. Scan & save as PDF
2. Show to colleague (feedback)
3. Choose one Level 1 process to detail (Process 1.0 recommended)
4. Draw Level 1 in 30 min using DFD_PRECISE_DRAWING_SPEC.md

**After Level 1:**
1. Have complete Process 1.0 detail
2. Choose Process 2.0 (evidence) if interested in cryptography detail
3. Optional: Draw Level 2 for Process 2.1 (upload encryption flow)

---

## DOCUMENTS TO REFERENCE

**While Drawing Level 0:**
- DFD_START_HERE.md (this spec but with explanations)
- DFD_PRECISE_DRAWING_SPEC.md (exact coordinates for EVERY element)
- This card (quick reminders)

**Understanding Components:**
- DFD_VISUAL_SYMBOLS.md (how each shape works)
- CODEBASE_ANALYSIS.md (real system details)

**Validating Your Work:**
- DFD_START_HERE.md (validation checklist)
- DFD_METHODOLOGY.md (what Level 0 should contain)

---

## PRINT THIS, KEEP NEARBY, START DRAWING NOW! 

**Open DFD_PRECISE_DRAWING_SPEC.md and follow Step 1—Step 9.**

**Target: Finish in 45 minutes.**

**Difficulty: Beginner-friendly (literally just drawing shapes + lines).**

