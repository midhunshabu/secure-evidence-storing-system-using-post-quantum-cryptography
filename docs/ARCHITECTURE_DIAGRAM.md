# High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph U["User Layer"]
        direction LR
        Admin["Admin"]
        Investigator["Investigator"]
        Court["Court User"]
    end

    subgraph F["Frontend Layer"]
        direction LR
        SPA["React SPA<br/>Login | Evidence Dashboard | Admin Console"]
        APIClient["API Client / Interceptors"]
    end

    subgraph B["Backend Layer"]
        direction LR
        Flask["Flask API / App Factory"]
        Auth["Authentication Module"]
        Evidence["Evidence Management Module"]
        AdminMod["Admin & Approval Module"]
        Audit["Audit Logging Module"]
    end

    subgraph S["Security / Crypto Layer"]
        direction LR
        IdentitySec["Identity & Session Security<br/>JWT Access Tokens<br/>Refresh Cookie Rotation<br/>Role-Based Access Control<br/>Security Headers<br/>Rate Limiting"]
        PQC["PQC Engine<br/>ML-KEM / Kyber<br/>ML-DSA / Dilithium<br/>AES-256-GCM<br/>HKDF-SHA256"]
    end

    subgraph D["Data / Storage Layer"]
        direction LR
        DB["SQL Database<br/>users, evidence, custody_records,<br/>audit_logs, refresh_tokens,<br/>system_heartbeats"]
        Vault["Encrypted Key Vault<br/>user private keys"]
        EvidenceStore["Encrypted Evidence Storage<br/>.enc files"]
        CaseBooks["Case Book Storage"]
    end

    Admin --> SPA
    Investigator --> SPA
    Court --> SPA

    SPA --> APIClient
    APIClient -->|Secure REST API| Flask

    Flask --> Auth
    Flask --> Evidence
    Flask --> AdminMod
    Flask --> Audit

    Auth --> IdentitySec
    Flask --> IdentitySec
    Evidence --> PQC

    Auth --> DB
    Auth --> Vault
    Evidence --> DB
    Evidence --> EvidenceStore
    Evidence --> CaseBooks
    Evidence --> Vault
    AdminMod --> DB
    Audit --> DB

    Evidence -. Submit for approval .-> AdminMod
    AdminMod -. Approve / reject .-> Evidence

    style U fill:#eef4ff,stroke:#2f6fed,stroke-width:1.5px,color:#111827
    style F fill:#eefbf3,stroke:#2d8a4d,stroke-width:1.5px,color:#111827
    style B fill:#fff7e8,stroke:#c7841e,stroke-width:1.5px,color:#111827
    style S fill:#f6efff,stroke:#7a3db8,stroke-width:1.5px,color:#111827
    style D fill:#f4f7fb,stroke:#5b6b7a,stroke-width:1.5px,color:#111827
```

## Diagram Notes

- All user roles access the system through the React frontend.
- The React frontend communicates with the Flask backend through secure REST APIs.
- Authentication and authorization are enforced through JWT, refresh cookies, role-based access control, security headers, and rate limiting.
- The evidence module uses the PQC engine to encrypt evidence and sign related metadata before storage.
- Metadata, custody records, audit logs, and session data are stored in the SQL database.
- Court users access only approved or explicitly court-authorized evidence.
