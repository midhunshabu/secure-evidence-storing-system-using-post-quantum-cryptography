# DFD Mermaid Figures

These Mermaid flowcharts are code-backed for the current project state.

For a simpler, standard report-style logical DFD, use `docs/DFD_MERMAID_SIMPLE.md`.

Figure list:

1. Context Diagram - PQC Evidence Storing System
2. Level 0 DFD - Core Processes and Data Stores
3. Level 1 DFD - Process 1.0 Identity and Access Management
4. Level 1 DFD - Process 2.0 Case and Evidence Operations
5. Level 1 DFD - Process 3.0 Administrative Oversight
6. Level 1 DFD - Process 4.0 Audit and Compliance
7. Level 2 DFD - Process 2.1 Upload and Encrypt Evidence
8. Level 2 DFD - Process 2.3 Retrieve, Verify, and Decrypt Evidence

Note:
- I use Mermaid `flowchart` because Mermaid does not have a native DFD diagram type.
- I use 6 logical stores in the corrected diagrams because the codebase has a distinct backup repository in addition to the main DB, file storage, and key vault.

## 1. Context Diagram - PQC Evidence Storing System

```mermaid
flowchart LR
    admin[Admin User]
    inv[Investigator]
    court[Court User]

    sys([PQC Evidence Storing System])

    admin -->|register users, approve cases/evidence, manage access, audit/backup actions| sys
    sys -->|tokens, approval results, reports, integrity status| admin

    inv -->|login, create cases, upload evidence, upload case-book pages, submit to court| sys
    sys -->|tokens, case status, upload confirmations| inv

    court -->|login, request case access, view approved case material| sys
    sys -->|tokens, request status, approved evidence/case-book access| court
```

## 2. Level 0 DFD - Core Processes and Data Stores

```mermaid
flowchart TB
    admin[Admin User]
    inv[Investigator]
    court[Court User]

    p1([1.0 Identity and Access Management])
    p2([2.0 Case and Evidence Operations])
    p3([3.0 Administrative Oversight])
    p4([4.0 Audit and Compliance])

    d1[(D1 Identity Store<br/>users, refresh_tokens,<br/>webauthn_credentials)]
    d2[(D2 Case and Evidence Store<br/>case_files, evidence, custody_records,<br/>case_book_pages, case_access_requests,<br/>case_access_grants)]
    d3[(D3 Audit and Monitoring Store<br/>audit_logs, system_heartbeats)]
    d4[(D4 File Storage<br/>encrypted evidence files,<br/>case-book files)]
    d5[(D5 Key Vault<br/>encrypted PQC private keys)]
    d6[(D6 Backup Repository<br/>DB backups, tamper snapshots,<br/>audit exports)]

    admin -->|user provisioning, approvals, admin actions| p1
    p1 -->|JWT, refresh session, MFA/PQID status| admin

    inv -->|login credentials, PQID, MFA| p1
    p1 -->|JWT, refresh session| inv

    court -->|login credentials, PQID, MFA| p1
    p1 -->|JWT, refresh session| court

    inv -->|case intake, evidence upload, case-book upload, submit to court| p2
    court -->|case access requests, evidence access, case-book viewing| p2
    p2 -->|case updates, upload confirmations| inv
    p2 -->|approved evidence and case-book access| court

    admin -->|approve evidence/cases, assign investigators, manage users, direct grants| p3
    p3 -->|dashboards, queue status, user status| admin

    admin -->|audit review, export, tamper check, backup/restore| p4
    p4 -->|audit reports, integrity results, backup outcomes| admin

    p1 -->|new user available for admin oversight| p3
    p2 -->|pending evidence/case/access items| p3
    p3 -->|approval and grant decisions| p2
    p3 -->|audit/backup requests| p4

    p1 <--> d1
    p1 <--> d5
    p1 --> d3

    p2 <--> d1
    p2 <--> d2
    p2 <--> d4
    p2 <--> d5
    p2 --> d3

    p3 <--> d1
    p3 <--> d2
    p3 <--> d3

    p4 <--> d3
    p4 <--> d6
```

## 3. Level 1 DFD - Process 1.0 Identity and Access Management

```mermaid
flowchart LR
    admin[Admin]
    user[User]

    p11([1.1 Register User and Validate Identity])
    p12([1.2 Generate PQC Keys and Store Vault Bundle])
    p13([1.3 Password Login and PQID Verification])
    p14([1.4 WebAuthn Enrollment and Authentication])
    p15([1.5 Access Token and Refresh Session Lifecycle])

    d1[(D1 Identity Store)]
    d3[(D3 Audit and Monitoring Store)]
    d5[(D5 Key Vault)]

    admin -->|new user profile, role, Aadhaar, PQID approval| p11
    p11 -->|validated registration payload| p12
    p12 -->|public keys, user row ready| d1
    p12 -->|encrypted private key bundle| d5
    p12 -->|registration audit event| d3
    p12 -->|new account + generated PQID| admin

    user -->|username and password| p13
    p13 <-->|user row, refresh state, passkey requirement| d1
    p13 -->|auth attempt audit| d3
    p13 -->|PQID challenge or MFA step| p14
    p13 -->|eligible session| p15

    user -->|passkey credential| p14
    p14 <-->|webauthn_credentials| d1
    p14 -->|webauthn audit| d3
    p14 -->|verified identity| p15

    p15 <-->|refresh token rotation and revocation| d1
    p15 -->|login, refresh, logout audit| d3
    p15 -->|access token, refresh cookie, user profile| user
```

## 4. Level 1 DFD - Process 2.0 Case and Evidence Operations

```mermaid
flowchart TB
    admin[Admin]
    inv[Investigator]
    court[Court User]

    p21([2.1 Upload and Encrypt Evidence])
    p22([2.2 Case File, Case Book, and Custody Management])
    p23([2.3 Retrieve, Verify, and Decrypt Evidence])
    p24([2.4 Court Access and Submission Workflow])

    d1[(D1 Identity Store)]
    d2[(D2 Case and Evidence Store)]
    d3[(D3 Audit and Monitoring Store)]
    d4[(D4 File Storage)]
    d5[(D5 Key Vault)]

    inv -->|create case, upload case-book pages| p22
    admin -->|create/inspect case, manage case state| p22
    court -->|view approved case-book pages| p22

    inv -->|evidence file, metadata, PQID| p21
    admin -->|admin evidence upload if needed| p21
    p21 -->|encrypted evidence + metadata| d2
    p21 -->|encrypted payload file| d4
    p21 <-->|user keys and algorithms| d5
    p21 -->|upload event| d3
    p21 -->|custody input| p22

    p22 <-->|case files, custody records, case-book metadata| d2
    p22 <-->|case-book file pages| d4
    p22 -->|case and custody audit| d3
    p22 -->|case status and page listings| inv
    p22 -->|approved case-book view| court

    court -->|access request| p24
    admin -->|approve or deny request, direct grant| p24
    inv -->|submit evidence to court| p24
    p24 <-->|requests, grants, approval status, access level| d2
    p24 -->|submission and grant audit| d3
    p24 -->|grant decision/status| court
    p24 -->|court-release state| p23

    inv -->|view evidence| p23
    court -->|view approved evidence| p23
    admin -->|integrity check or preview| p23
    p23 <-->|role and actor lookup| d1
    p23 <-->|evidence metadata and access state| d2
    p23 <-->|encrypted evidence files| d4
    p23 <-->|private key material| d5
    p23 -->|view, decrypt, integrity audit| d3
    p23 -->|decrypted evidence or verification result| inv
    p23 -->|approved evidence content| court
    p23 -->|integrity result| admin
```

## 5. Level 1 DFD - Process 3.0 Administrative Oversight

```mermaid
flowchart LR
    admin[Admin]

    p31([3.1 Overview, Health, and Pending Queues])
    p32([3.2 Evidence Approval and Rejection])
    p33([3.3 Case Approval, Assignment, and Status Control])
    p34([3.4 User Administration and Identity Checks])

    d1[(D1 Identity Store)]
    d2[(D2 Case and Evidence Store)]
    d3[(D3 Audit and Monitoring Store)]

    admin -->|dashboard queries, health history requests| p31
    p31 <-->|user counts and status| d1
    p31 <-->|case and evidence queue state| d2
    p31 <-->|heartbeats and audit summaries| d3
    p31 -->|overview cards, charts, queue lists| admin

    admin -->|approve or deny evidence| p32
    p32 <-->|evidence row, approval state, custody context| d2
    p32 -->|approval or denial audit| d3
    p32 -->|decision result| admin

    admin -->|approve or reject case, assign investigator, close or reopen case| p33
    p33 <-->|case file state and assignments| d2
    p33 <-->|investigator lookup| d1
    p33 -->|case workflow audit| d3
    p33 -->|case decision result| admin

    admin -->|list users, change role/email, deactivate, purge, view PQID, Aadhaar check| p34
    p34 <-->|users, refresh tokens, webauthn credentials| d1
    p34 -->|user-management audit| d3
    p34 -->|user admin results| admin
```

## 6. Level 1 DFD - Process 4.0 Audit and Compliance

```mermaid
flowchart LR
    admin[Admin]

    p41([4.1 Query Audit Logs and Verify Hash Chain])
    p42([4.2 Export Audit Report])
    p43([4.3 Detect Tampering and Create Integrity Snapshot])
    p44([4.4 List, Download, and Restore Backups])

    d3[(D3 Audit and Monitoring Store)]
    d6[(D6 Backup Repository)]

    admin -->|filters, date range, integrity review| p41
    p41 <-->|audit_logs, chain hashes, heartbeat context| d3
    p41 -->|verified or tampered result set| admin

    admin -->|export request| p42
    p42 <-->|audit log rows and chain status| d3
    p42 -->|PDF export| d6
    p42 -->|downloadable report| admin

    admin -->|tamper analysis request| p43
    p43 <-->|full audit history and baseline records| d3
    p43 <-->|tamper snapshot JSON and baseline file| d6
    p43 -->|manipulated or clean result| admin

    admin -->|backup list, download, restore| p44
    p44 <-->|backup files and tamper snapshots| d6
    p44 -->|restore or download status| admin
```

## 7. Level 2 DFD - Process 2.1 Upload and Encrypt Evidence

```mermaid
flowchart TB
    actor[Investigator or Admin]

    s211([2.1.1 Validate Request, Actor, and Case State])
    s212([2.1.2 Load Public Key and Signing Key Context])
    s213([2.1.3 KEM Encapsulate Shared Secret])
    s214([2.1.4 Derive AES Key and Encrypt File])
    s215([2.1.5 Sign Canonical Metadata and Custody Payload])
    s216([2.1.6 Persist Evidence, Files, Custody, and Audit])

    kem[[KEM Module]]
    hkdf[[HKDF-SHA256]]
    aes[[AES-256-GCM]]
    sig[[Signature Module]]

    d1[(D1 Identity Store)]
    d2[(D2 Case and Evidence Store)]
    d3[(D3 Audit and Monitoring Store)]
    d4[(D4 File Storage)]
    d5[(D5 Key Vault)]

    actor -->|multipart file, metadata, PQID| s211

    s211 <-->|actor row and active role| d1
    s211 <-->|case file assignment and approval status| d2
    s211 -->|validated file bytes + plaintext hash| s212

    s212 <-->|public key and algorithm labels| d1
    s212 <-->|signing private key bundle| d5
    s212 -->|key material ready| s213

    s213 -->|public key| kem
    kem -->|kem_ciphertext + shared_secret| s213
    s213 -->|shared_secret| s214

    s214 -->|shared_secret + salt| hkdf
    hkdf -->|derived AES key| s214
    s214 -->|plaintext bytes + AES key| aes
    aes -->|ciphertext + iv + tag| s214
    s214 -->|ciphertext package| s215

    s215 -->|canonical payload| sig
    sig -->|digital signature| s215
    s215 -->|signed metadata + custody payload| s216

    s216 -->|evidence row + custody record + case link| d2
    s216 -->|encrypted payload file| d4
    s216 -->|audit event| d3
    s216 -->|upload confirmation| actor
```

## 8. Level 2 DFD - Process 2.3 Retrieve, Verify, and Decrypt Evidence

```mermaid
flowchart TB
    actor[Admin, Investigator, or Court User]

    s231([2.3.1 Verify Role, Grant, and Case Eligibility])
    s232([2.3.2 Load Evidence Metadata and Encrypted Payload Reference])
    s233([2.3.3 Verify Stored Signature over Ciphertext Metadata])
    s234([2.3.4 Load Private Key Material])
    s235([2.3.5 KEM Decapsulate Shared Secret])
    s236([2.3.6 Derive AES Key and Decrypt File])
    s237([2.3.7 Hash Check, Record Custody, Audit, and Return Content])

    sig[[Signature Module]]
    kem[[KEM Module]]
    hkdf[[HKDF-SHA256]]
    aes[[AES-256-GCM]]

    d1[(D1 Identity Store)]
    d2[(D2 Case and Evidence Store)]
    d3[(D3 Audit and Monitoring Store)]
    d4[(D4 File Storage)]
    d5[(D5 Key Vault)]

    actor -->|evidence id or content request| s231

    s231 <-->|actor role and identity| d1
    s231 <-->|case assignment, court grant, access level| d2
    s231 -->|authorized request| s232

    s232 <-->|evidence metadata, signature, case link| d2
    s232 <-->|encrypted payload JSON/file| d4
    s232 -->|ciphertext package + signature context| s233

    s233 -->|canonical metadata payload| sig
    sig -->|signature valid or invalid| s233
    s233 -->|verified package| s234
    s233 -->|signature failure audit| d3

    s234 <-->|recipient or uploader private key bundle| d5
    s234 -->|private key + kem ciphertext| s235

    s235 -->|secret key + kem ciphertext| kem
    kem -->|shared_secret| s235
    s235 -->|shared_secret| s236

    s236 -->|shared_secret + salt| hkdf
    hkdf -->|derived AES key| s236
    s236 -->|ciphertext + key + iv + tag| aes
    aes -->|plaintext bytes| s236
    s236 -->|decrypted bytes| s237

    s237 -->|hash and integrity result| d2
    s237 -->|custody view event + audit outcome| d3
    s237 -->|decrypted content or integrity result| actor
```
