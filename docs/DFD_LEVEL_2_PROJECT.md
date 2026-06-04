# One Detailed Level 2 DFD for PQC Evidence Storing System

This file contains only one Level 2 DFD.

Use this as the final Level 2 diagram for the project report.

It decomposes `2.0 Case and Evidence Operations` into four detailed subprocesses.

```mermaid
flowchart TB
    inv[Investigator]
    admin[Administrator]
    court[Court User]

    p21((2.1 Upload and Encrypt Evidence))
    p22((2.2 Case File, Case Book, and Custody Management))
    p23((2.3 Retrieve, Verify, and Decrypt Evidence))
    p24((2.4 Court Access and Submission Workflow))

    d1[(D1 Identity Store)]
    d2[(D2 Case and Evidence Store)]
    d3[(D3 Audit and Monitoring Store)]
    d4[(D4 File Storage)]
    d5[(D5 Key Vault)]

    inv -->|evidence file, metadata, PQID| p21
    admin -->|admin evidence upload or review input| p21
    p21 <-->|actor identity and active role| d1
    p21 <-->|case approval state and case link| d2
    p21 <-->|public key and signing key context| d5
    p21 -->|encrypted evidence metadata| d2
    p21 -->|encrypted evidence file| d4
    p21 -->|upload audit log| d3
    p21 -->|custody input| p22
    p21 -->|upload confirmation| inv

    inv -->|case details, case-book pages| p22
    admin -->|case creation, assignment, close or reopen| p22
    court -->|approved case-book view request| p22
    p22 <-->|case files, custody records, page metadata| d2
    p22 <-->|case-book page files| d4
    p22 -->|case and custody audit log| d3
    p22 -->|case status and case-book view| inv
    p22 -->|approved case-book content| court

    inv -->|evidence view request| p23
    admin -->|integrity check or preview request| p23
    court -->|approved evidence access request| p23
    p23 <-->|role and user lookup| d1
    p23 <-->|evidence metadata, access state, court grant| d2
    p23 <-->|encrypted payload file| d4
    p23 <-->|private key material| d5
    p23 -->|view and integrity audit| d3
    p23 -->|decrypted evidence or verification result| inv
    p23 -->|integrity result| admin
    p23 -->|approved evidence content| court

    court -->|case access request| p24
    inv -->|submit evidence to court| p24
    admin -->|approve, deny, or grant access| p24
    p24 <-->|access requests, grants, approval state| d2
    p24 -->|submission and access audit| d3
    p24 -->|grant or denial status| court
    p24 -->|release authorization| p23
```

## Code Basis

This diagram was aligned to the current implementation:

- `backend/app/routes/evidence.py`
- `backend/app/models/case_file.py`
- `backend/app/models/evidence.py`
- `backend/app/models/court_access.py`
- `backend/app/models/user.py`
- `backend/app/security/key_vault.py`
- `backend/app/modules/pqc_engine.py`

## Export Tip

If you want a visual file:

1. Open draw.io
2. Go to `Arrange -> Insert -> Advanced -> Mermaid`
3. Paste the Mermaid block above
4. Restyle entities as rectangles, processes as circles, and data stores as open-ended stores if your report format requires classic DFD notation
