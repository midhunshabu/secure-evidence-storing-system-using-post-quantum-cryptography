# DFD VISUAL SYMBOLS REFERENCE
## Quick Visual Guide to Shapes & Notations

---

## DFD SHAPES

### Shape 1: PROCESS (Transformation of Data)

**Visual:**
```
    ╔════════════════╗
    ║      1.0       ║
    ║   Processing   ║
    ╚════════════════╝
```

**How to Draw by Hand:**
- Draw a circle (1"-1.5" diameter) or rounded rectangle
- Can use compass for perfect circle
- Alternatively: oval shape (use oblong template)
- Size: ~1.2" diameter (not too big, not too small)

**Alternative shapes (all acceptable):**
```
Option A: Circle         Option B: Oval          Option C: Bubble
   ╭───╮                  ╭──────╮                ◯◯◯
   │   │ 1.0             │ 2.0  │                Process
   ╰───╯                  ╰──────╯

   Option D: Rectangle    Option E: Rounded Box
   ┌─────────┐            ╭──────────╮
   │  3.0    │            │  4.0     │
   │Process  │            │Process   │
   └─────────┘            ╰──────────╯
```

**Label Format:**
```
Top:   [ID: 1.0]
       (ID in top area or outside)

Center: [Process Name]
        "Authentication"
        or
        "Auth &"
        "AuthZ"
        (Can be 1-2 lines)
```

**Digitally (draw.io):**
- Shape library → Flowchart → Process circle or rectangle
- ID the shape with number prefix (1.0, 1.1, 2.1, etc.)
- Add text inside

---

### Shape 2: EXTERNAL ENTITY (Actor/User)

**Visual:**
```
    ┌─────────────────┐
    │  👤 Admin User  │
    │  (Registration) │
    │  (Approval)     │
    └─────────────────┘
```

**How to Draw by Hand:**
- Draw a rectangle (2" wide × 1" tall)
- Use ruler for straight lines
- Can be rounded corners (for aesthetic)

**Label Format:**
```
Top:    [Icon + Role Title]
        👤 Admin User
        or
        ⚖️ Court User
        or
        👤 Investigator

Inside: [Brief description of what they do]
        (Registration, Approval, User Mgmt)
        or
        (Upload Evidence, Submit to Court)
```

**Digitally:**
- Shape → Rectangle or "Actor" symbol
- Add emoji + text label
- Position outside system boundary (edges)

---

### Shape 3: DATA STORE (Persistent Storage)

**Visual A: Parallel Lines**
```
═══════════════════════════
    D1: User Database
    users | refresh_tokens
═══════════════════════════
```

**Visual B: Cylinder**
```
    ╭─────────────────╮
    │  D2: Evidence   │
    │   Database      │
    ╞═════════════════╡
    ║              ║
    ╰──────────────╯
```

**Visual C: Box with label**
```
    ┌─────────────────────┐
    │ D3: Audit Logs      │
    │                     │
    └─────────────────────┘
```

**How to Draw by Hand (Recommended: Parallel Lines)**
1. Draw two horizontal parallel lines
   - Top line: solid
   - Bottom line: solid
   - Distance between: 0.4"-0.5"

2. Width: 1.5"-2"

3. Label ABOVE lines: "D1", "D2", etc.

4. Inside lines: list the key tables or data items
   ```
   ═══════════════════════════
       users | refresh_tokens
   ═══════════════════════════
   ```

**Label Format:**
```
Above:  [Store ID + Name]
        D1: User Database
        or
        D2: Evidence Database

Inside: [Key tables or data items]
        users, refresh_tokens, webauthn
        or
        evidence, custody_records, cases
```

**Digitally:**
- Shape → Database or Parallel lines icon
- Label below/beside icon
- Leave space for annotations

---

### Shape 4: DATA FLOW (Arrow/Line)

**Visual A: Solid Arrow (Process ↔ Other)**
```
        Data description
              ↓
    ┌──────────────────────→ Process
    │
  Entity

Alternative:        Alternative:       Alternative:
   → → → →  (arrow)  ──●──→    (line)  ═════→ (bold)
```

**Visual B: Dotted Arrow (Process ↔ Data Store)**
```
        Data description
              ↓
    Entity ···· ·····→ Data Store
    
Alternative notations:
    ····→ (dotted arrow)
    - - - → (dashed)
    ~ ~ ~ → (wavy)
```

**How to Draw by Hand:**
1. **Solid Lines:**
   - Use ruler
   - Draw straight line between shapes
   - Add arrowhead (filled triangle ▶)
   - Label ABOVE or BELOW line with description

2. **Dotted Lines:**
   - Use ruler + dashes pattern
   - Draw dashes (- - - - -) between shapes
   - Still use arrowhead
   - Label ABOVE or BELOW line

**Label Format (Solid):**
```
"Authentication Credentials"
         ↓
   User ──────→ Process 1.0
   
"JWT Token"
         ↓
   Process 1.0 ──────→ User
```

**Label Format (Dotted):**
```
"Write: user, keys"
         ↓
   Process 1.0 ····→ D1
   
"Read: password hash"
         ↓
   D1 ····→ Process 1.0
```

**Bidirectional Flows:**
```
Option A: Two arrows
  Process 1.0 ──────→ D1
  D1 ──────→ Process 1.0

Option B: Double-headed arrow
  Process 1.0 ←────→ D1

Option C: Single line both ways
  Process 1.0 ↔ D1
```

**Digitally:**
- Draw line tool → drag between shapes
- Set line style: solid or dotted
- Add arrow endings
- Add text label to line

---

## COMPLETE VISUAL REFERENCE: Level 0 Example

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│        ┌─────────────┐        ┌──────────────┐        ┌─────────────┐
│        │  👤 Admin   │        │ 👤 Investig  │        │⚖️ Court User│
│        │    User     │        │  ator        │        │             │
│        └──────┬──────┘        └──────┬───────┘        └──────┬──────┘
│               │                      │                      │
│     "Creds"   │          "File+Meta" │         "Access"     │
│               │                      │         "Request"    │
│               ▼                      ▼                      ▼
│          ╭─────────╮          ╭────────────╮          ╭──────────╮
│          │   1.0   │          │    2.0     │          │   2.0    │
│          │  Auth   │          │ Evidence   │          │Evidence  │
│          ╰────┬────╯          ╰────┬───────╯          ╰────┬─────╯
│    "JWT"      │                    │ "Encrypted"           │
│               ▼                    ▼ "Evidence"           ▼
│          ┌─────────┐          ┌──────────┐          ┌────────────┐
│          │ "Token" │          │"Confirma-│          │"Decrypted  │
│          │ ◄─────  │          │ted ID"◄──│          │Evidence"◄──│
│               ▲     ╭──────────╮          ╭──────────╮
│               │     │   3.0    │          │   3.0    │
│       "Mgt"   │     │  Admin   │          │Evidence  │
│      "Query"  │     │Oversight │          │Approval  │
│               │     ╰────┬─────╯          ╰──────────╯
│               │          │
│
│  ════════════════════════════════════════════════════════════════
│     D1: Users        D2: Evidence      D3: Audit      D4: Files
│  ════════════════════════════════════════════════════════════════
│
│  Process connections to stores (dotted):
│     1.0 ····→ D1, D3, D5
│     2.0 ····→ D2, D4, D5, D3
│     3.0 ····→ D1, D2, D3
│
│  LEGEND:
│  ○ = Process    ▭ = Entity    ════ = Store
│  ─→ = Solid     ····→ = Dotted
│
└─────────────────────────────────────────────────────────────────────┘
```

---

## DRAWING TECHNIQUES: By Hand vs Digital

### BY HAND (Pencil & Paper)

**Tools:**
- Ruler (12"+)
- Compass or circle stencil
- Pencil #2
- Eraser
- Eraser stick (for precision)
- Fine-tip pen (final version)

**Steps:**
1. Lightly sketch with pencil (can erase)
2. Use ruler for all straight lines
3. Use compass for circles (set to 0.6" radius = 1.2" diameter)
4. Draw boxes with ruler (align corners)
5. Once satisfied, trace with fine-tip pen
6. Erase pencil marks
7. Scan at 300 DPI

**Pro Tips:**
- Use light pencil pressure (easier to erase)
- Start with positions from DFD_PRECISE_DRAWING_SPEC.md
- Double-check alignment before inking
- Use ruler as straightedge while inking
- Let ink dry before erasing pencil

---

### DIGITAL (draw.io)

**Step-by-Step:**

1. **Start:**
   - Go to draw.io
   - Click "Create New" → Blank diagram
   - Set page size: A3 landscape (11" × 17")

2. **Add Shapes:**
   - Click shape in left panel
   - Click on canvas to place
   - Drag to resize
   - Double-click to edit text
   - Right-click to change formatting

3. **Position Precisely:**
   - Right-click shape → Arrange → Position & Size
   - Enter X & Y coordinates from DFD_PRECISE_DRAWING_SPEC.md
   - Set width & height
   - Click OK

4. **Add Lines:**
   - Click connector tool (arrows)
   - Click start shape → click end shape
   - Edit line style: right-click → Edit style
   - Set to dotted if for data store

5. **Add Labels:**
   - Double-click on line → type label
   - Adjust label position (drag)
   - Use above/below line for clarity

6. **Organize:**
   - Use View → Grid to snap to grid
   - Use Arrange → Align tools
   - Group related shapes: Select all → Ctrl+G

7. **Export:**
   - File → Export as → PDF (recommended)
   - Or PNG if inserting into documents
   - Set DPI: 300 for printing

---

## SYMBOL PLACEMENT GUIDE

### When Drawing, Keep This Layout:
```
TOP ROW:           External Entities
                   (3 rectangles)

MIDDLE ROWS:       Main Processes
                   (4 circles in a line,
                    or 2×2 grid)

BOTTOM ROW:        Data Stores
                   (5 double-line boxes)

ARROWS:            Connect entities → processes → stores
                   Use solid for flows
                   Use dotted for store access
```

### Spacing Guide:
```
Legend: 1" = standard process/entity size

Top to entities:              0.5" margin
Entities to processes:        1.5" vertical gap
Processes to stores:          2" vertical gap
Store to bottom margin:       0.5" margin

Left to first entity:         0.5" margin
Entity width:                 2" typical
Gap between entities:         0.5"-1"
Right margin:                 0.5"

TOTAL HEIGHT NEEDED:          ~6-6.5"
TOTAL WIDTH NEEDED:           ~10"
(Fits on 11" × 17" A3 landscape with margins)
```

---

## LINE STYLES QUICK REFERENCE

### FLOW LINES (Solid)
```
Description: Data moving between system entities
Usage: Entity → Process, Process → Process, Process ← Entity
Symbol: ──────→ or ←──────
Color: Black (or dark blue)
Width: Standard (1pt)
Label: Above/below line
Names: "Credentials", "JWT Token", "Evidence File", etc.
```

### STORE ACCESS (Dotted)
```
Description: Data persistence operations
Usage: Process ↔ Data Store
Symbol: ·····→ or ←····· or also ····↔····
Color: Black (or gray)
Width: Standard (1pt)
Style: Dashed/dotted pattern
Label: "Write: ...", "Read: ..."
Names: "INSERT user", "SELECT evidence", etc.
```

### OPTIONAL: Cross-Process (Solid)
```
Description: Data passed between processes
Usage: Process → Process (rare in Level 0)
Symbol: ──────→
Color: Black
Label: "Evidence pending", "Queue item", etc.
Use: Only if processes directly hand off work
```

---

## SYMBOL LEGEND (To Include on DFD)

Add this box to your diagram (usually bottom-right):

```
╔══════════════════════════════════╗
║          LEGEND                 ║
├──────────────────────────────────┤
│ ○      = Process                │
│        (Transformation)          │
│                                  │
│ ▭      = External Entity        │
│        (Actor, User, Role)       │
│                                  │
│ ════   = Data Store             │
│        (Database, File, etc.)    │
│                                  │
│ ──→    = Data Flow              │
│        (Solid line)              │
│                                  │
│ ····→  = Store Access           │
│        (Dotted line)             │
│                                  │
│ ↔      = Bidirectional          │
│        (Both directions)         │
│                                  │
│ D1, D2 = Store ID               │
│ 1.0, 2.0 = Process ID           │
╚══════════════════════════════════╝
```

---

## COMMON SYMBOL ERRORS & FIXES

| Error | Wrong | Better |
|-------|-------|--------|
| Process too big | ◯◯◯ (3" dia) | ◯ (1.2" dia) |
| No label on flow | ──→ | ──"Data Type"──→ |
| Solid line for store | Entity ──→ D1 | Entity ····→ D1 |
| Unclear shapes | Squiggle lines | Clear circles/boxes |
| Crossing flows | Messy overlaps | Route around edges |
| No legend | Unmarked | ◯ = Process, etc. |
| Entity talks to store | Actor ──→ D1 | Actor ──→ Process ····→ D1 |

---

## QUICK CHECKLIST: Verify Your Symbols

After drawing Level 0, check:

- [ ] 3 rectangular boxes (entities) at top
- [ ] 4 circular/oval shapes (processes) in middle
- [ ] 5 double-line boxes (stores) at bottom
- [ ] All process boxes labeled with IDs (1.0, 2.0, 3.0, 4.0)
- [ ] All store boxes labeled with IDs (D1-D5)
- [ ] Arrow heads pointing in correct direction
- [ ] Solid lines between entities and processes
- [ ] Dotted lines between processes and stores
- [ ] Every line has a label
- [ ] Legend present in corner
- [ ] No lines crossing unnecessarily
- [ ] Readable at arm's length away

**✅ ALL CHECKED? YOUR SYMBOLS ARE CORRECT.**

---

## MAKING IT LOOK PROFESSIONAL

### Use Color (Optional but Recommended)

**Color Scheme:**
```
Processes:        Light Blue (#E3F2FD)
  - 1.0 Auth:     Blue
  - 2.0 Evidence: Purple
  - 3.0 Admin:    Orange
  - 4.0 Audit:    Green

Entities:         Light Gray (#ECEFF1)
Data Stores:      Light Yellow (#FFFDE7)
Flows:            Black text, thin black lines

Stores:           Slightly darker tint of process
```

### Typography
```
Process labels:   12pt, Bold, centered
Entity labels:    12pt, Bold
Store labels:     11pt, Regular + ID in bold
Flow labels:      10pt, Italic (lighter appearance)
Legend:           9pt, Regular
```

### Spacing & Alignment
```
Use grid: Enable draw.io grid or draw grid by hand
Align vertically: All top entities same Y, all processes same Y, etc.
Align horizontally: Spread evenly across page
Margin: 0.5" on all sides

Optimal: Entities spread across top, stores spread across bottom
         Processes centered vertically, evenly spaced horizontally
```

---

## DONE! 

You now know exactly what to draw and how to draw it.

**Open DFD_PRECISE_DRAWING_SPEC.md and START DRAWING.**

