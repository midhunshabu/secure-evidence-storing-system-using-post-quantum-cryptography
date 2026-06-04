# Report-Friendly ER Diagram

## Recommended Figure Title

**Entity Relationship Diagram of PQC Evidence Storing System**

## Final Diagram For Report

Use this SVG image for the report. It follows the same clean Chen-style format as the guide sample:

![Entity Relationship Diagram of PQC Evidence Storing System](ER_DIAGRAM_CHEN_CLEAN.svg)

Open directly:

`docs/ER_DIAGRAM_CHEN_CLEAN.svg`

## Why This Version Is Suitable

- Rectangles show entities.
- Ovals show attributes.
- Diamonds show relationships.
- `PK` marks primary key attributes.
- Cardinalities are written as `1` and `N` near the relationship lines.
- Only the important project entities are included, so the diagram is neat and readable.

## Main Entities Included

- `USER`
- `CASE FILE`
- `EVIDENCE`
- `KEY VAULT`
- `CASE ACCESS`
- `CUSTODY RECORD`

Support tables such as refresh tokens, passkey credentials, system heartbeat records, and detailed audit logs are intentionally excluded from the report diagram. They are implementation support tables, and including them would make the ER diagram unnecessarily crowded.

## Mermaid Editing Version

Mermaid cannot render perfect textbook Chen notation, but this version is useful if you need to edit the diagram quickly in Markdown.

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart LR
    USER[USER]
    CASE_FILE[CASE FILE]
    EVIDENCE[EVIDENCE]
    KEY_VAULT[KEY VAULT]
    CASE_ACCESS[CASE ACCESS]
    CUSTODY_RECORD[CUSTODY RECORD]

    u1([user_id PK])
    u2([username])
    u3([email])
    u4([role])
    u5([pqid])
    u6([public_key])

    USER --- u1
    USER --- u2
    USER --- u3
    USER --- u4
    USER --- u5
    USER --- u6

    c1([case_id PK])
    c2([case_number])
    c3([quantum_ledger_no])
    c4([case_title])
    c5([status])
    c6([approval_status])

    CASE_FILE --- c1
    CASE_FILE --- c2
    CASE_FILE --- c3
    CASE_FILE --- c4
    CASE_FILE --- c5
    CASE_FILE --- c6

    e1([evidence_id PK])
    e2([filename])
    e3([file_hash])
    e4([file_size])
    e5([evidence_type])
    e6([access_level])
    e7([uploaded_at])

    EVIDENCE --- e1
    EVIDENCE --- e2
    EVIDENCE --- e3
    EVIDENCE --- e4
    EVIDENCE --- e5
    EVIDENCE --- e6
    EVIDENCE --- e7

    k1([vault_id PK])
    k2([kem_secret])
    k3([sig_secret])
    k4([stored_at])

    KEY_VAULT --- k1
    KEY_VAULT --- k2
    KEY_VAULT --- k3
    KEY_VAULT --- k4

    a1([access_id PK])
    a2([status])
    a3([expires_at])
    a4([reason])

    CASE_ACCESS --- a1
    CASE_ACCESS --- a2
    CASE_ACCESS --- a3
    CASE_ACCESS --- a4

    cr1([custody_id PK])
    cr2([action])
    cr3([timestamp])
    cr4([signature])

    CUSTODY_RECORD --- cr1
    CUSTODY_RECORD --- cr2
    CUSTODY_RECORD --- cr3
    CUSTODY_RECORD --- cr4

    R1{CREATES}
    R2{CONTAINS}
    R3{STORES}
    R4{REQUESTS}
    R5{FOR}
    R6{HAS LOG}
    R7{WRITES}

    USER -- "1" --- R1
    R1 -- "N" --- CASE_FILE

    CASE_FILE -- "1" --- R2
    R2 -- "N" --- EVIDENCE

    USER -- "1" --- R3
    R3 -- "1" --- KEY_VAULT

    USER -- "1" --- R4
    R4 -- "N" --- CASE_ACCESS

    CASE_FILE -- "1" --- R5
    R5 -- "N" --- CASE_ACCESS

    EVIDENCE -- "1" --- R6
    R6 -- "N" --- CUSTODY_RECORD

    USER -- "1" --- R7
    R7 -- "N" --- CUSTODY_RECORD
```

## Code Basis

This diagram is based on:

- `backend/app/models/user.py`
- `backend/app/models/case_file.py`
- `backend/app/models/evidence.py`
- `backend/app/models/case_book_page.py`
- `backend/app/models/court_access.py`
- `backend/app/security/key_vault.py`
