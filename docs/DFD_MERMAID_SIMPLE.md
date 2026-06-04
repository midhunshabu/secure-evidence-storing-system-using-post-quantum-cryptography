# Simple Logical DFD Mermaid

This file contains simplified, standard DFD-style Mermaid code for the PQC Evidence Storing System.

Use these as report-friendly diagrams:

- Level 0 DFD = Context Diagram
- Level 1 DFD = Major internal processes and data stores
- Level 2 DFD = Decomposition of one Level 1 process

These diagrams are intentionally logical, not technical:

- They show what data moves through the system
- They avoid implementation details such as AES, KEM, key vault internals, and API endpoints
- They use short labels so they paste more cleanly into draw.io Mermaid import

## 1. Level 0 DFD (Context Diagram)

```mermaid
flowchart LR
    admin[Administrator]
    inv[Investigator]
    court[Court User]
    sys((PQC Evidence Storing System))

    admin -->|user details, approval decisions, audit requests| sys
    sys -->|user status, approval status, audit reports| admin

    inv -->|login details, case details, evidence files| sys
    sys -->|login result, case status, upload confirmation| inv

    court -->|login details, access requests| sys
    sys -->|access status, approved evidence| court
```

## 2. Level 1 DFD

```mermaid
%%{init: {'flowchart': {'curve': 'step'}}}%%
flowchart LR
    admin[Administrator]
    inv[Investigator]
    court[Court User]

    p1((1.0 Authentication))
    p2((2.0 Case and Evidence))
    p3((3.0 Approval and Audit))

    d1[(D1 User Store)]
    d2[(D2 Case and Evidence Store)]
    d3[(D3 Audit Log Store)]

    admin -->|user setup| p1
    inv -->|login data| p1
    court -->|login data| p1
    p1 -->|access status| admin
    p1 -->|access status| inv
    p1 -->|access status| court

    p1 -->|user data| d1
    d1 -->|user records| p1

    inv -->|case details, evidence files| p2
    p2 -->|case status, upload result| inv
    p2 -->|case and evidence data| d2
    d2 -->|case and evidence records| p2

    court -->|access request| p3
    admin -->|approval decision, audit request| p3
    p3 -->|request status, audit report| admin
    p3 -->|approved access| court
    p3 -->|approval update| d2
    d2 -->|request and evidence status| p3

    p1 -->|login log| d3
    p2 -->|activity log| d3
    p3 -->|approval and audit log| d3
```

## 3. Level 2 DFD for Process 2.0 Case and Evidence Management

```mermaid
flowchart LR
    inv[Investigator]
    admin[Administrator]

    p21((2.1 Create or Update Case))
    p22((2.2 Upload Evidence))
    p23((2.3 Record Custody Action))
    p24((2.4 View Evidence Status))

    d2[(D2 Case Store)]
    d3[(D3 Evidence Store)]
    d5[(D5 Audit Log Store)]

    inv -->|case details| p21
    admin -->|case approval or update| p21
    p21 -->|case record| d2
    d2 -->|case data| p21
    p21 -->|case status| inv
    p21 -->|case update log| d5

    inv -->|evidence file, evidence metadata| p22
    p22 -->|evidence record| d3
    d3 -->|stored evidence data| p22
    p22 -->|upload confirmation| inv
    p22 -->|upload log| d5
    p22 -->|custody input| p23

    p23 -->|custody update| d3
    p23 -->|custody log| d5

    inv -->|status request| p24
    admin -->|review request| p24
    d2 -->|case status| p24
    d3 -->|evidence status, custody history| p24
    p24 -->|case status, evidence status| inv
    p24 -->|review data| admin
```

## Draw.io Tip

In draw.io:

1. Go to `Arrange -> Insert -> Advanced -> Mermaid`
2. Paste one Mermaid block at a time
3. After import, restyle shapes manually to match DFD notation if needed

If you want the cleanest classroom-style DFD, use:

- rectangles for external entities
- circles or rounded shapes for processes
- open-ended or parallel-line style boxes for data stores
- labeled arrows for data flow
