# ER Diagram Mermaid

This ER diagram reflects the current SQLAlchemy models in the project.

Notes:
- This is a database ER diagram, so filesystem storage and the encrypted key vault are not modeled as tables.
- `AuditLog.resource_id` is polymorphic text, not a foreign key, so those links are not shown as hard ER relationships.

```mermaid
erDiagram
    USER {
        int id PK
        string username UK
        string email UK
        string password_hash
        string role
        text address
        string phone_number
        string pqid UK
        int pqid_failed_attempts
        datetime pqid_locked_until
        boolean is_physically_verified
        text aadhar_number
        string aadhar_hash UK
        string designation
        text court_details
        string station_name
        text pqc_public_key
        text pqc_kem_public_key
        text pqc_sig_public_key
        string pqc_kem_algorithm
        string pqc_sig_algorithm
        text client_auth_sig_public_key
        text current_challenge
        datetime current_challenge_expires_at
        boolean webauthn_required
        string webauthn_user_handle UK
        datetime webauthn_enrolled_at
        boolean is_active
        datetime created_at
        datetime last_login
    }

    REFRESH_TOKEN {
        int id PK
        int user_id FK
        string jti_hash UK
        datetime expires_at
        datetime created_at
        datetime last_used_at
        datetime revoked_at
        string replaced_by_hash
        string created_ip
        string user_agent
    }

    WEBAUTHN_CREDENTIAL {
        int id PK
        int user_id FK
        text credential_id UK
        text public_key
        int sign_count
        text transports
        string device_type
        boolean backed_up
        string fmt
        string aaguid
        datetime created_at
        datetime last_used_at
        boolean is_active
    }

    CASE_FILE {
        string id PK
        string case_number UK
        string quantum_ledger_number UK
        text case_title
        text complainant_name
        text suspect_name
        date incident_date
        text incident_state
        text incident_district
        text incident_location
        text case_summary
        string status
        int assigned_investigator_id FK
        string approval_status
        int approved_by FK
        datetime approved_at
        text approval_notes
        int created_by FK
        datetime created_at
        datetime updated_at
    }

    EVIDENCE {
        string id PK
        text case_id
        text filename
        string file_hash
        int file_size
        string encrypted_data_path
        text encryption_key
        text encryption_iv
        text encryption_tag
        text signature
        text signature_public_key
        string signature_algorithm
        text description
        text evidence_type
        int uploaded_by FK
        string case_file_id FK
        datetime uploaded_at
        string access_level
        text authorized_users
        string approval_status
        int approved_by FK
        datetime approved_at
        text approval_signature
        boolean is_deleted
        datetime deleted_at
    }

    CUSTODY_RECORD {
        int id PK
        string evidence_id FK
        int user_id FK
        string action
        datetime timestamp
        text notes
        string ip_address
        text signature
    }

    CASE_BOOK_PAGE {
        string id PK
        string case_file_id FK
        int page_number
        text filename
        text summary
        string mime_type
        string file_hash
        int file_size
        string stored_path
        int uploaded_by FK
        datetime created_at
    }

    CASE_ACCESS_REQUEST {
        int id PK
        int requested_by FK
        string case_file_id FK
        string requested_case_number
        string requested_quantum_ledger_number
        int requested_duration_minutes
        text reason
        string status
        datetime created_at
        datetime decided_at
        int decided_by FK
        text decision_notes
        datetime granted_expires_at
    }

    CASE_ACCESS_GRANT {
        int id PK
        string case_file_id FK
        int court_user_id FK
        int granted_by FK
        datetime granted_at
        datetime expires_at
        datetime revoked_at
        int revoked_by FK
        text revoke_reason
        int source_request_id FK
        text notes
    }

    AUDIT_LOG {
        int id PK
        int user_id FK
        string action
        string resource_type
        string resource_id
        text details
        string status
        text error_message
        text ip_address
        text user_agent
        text log_signature
        string prev_hash
        string current_hash
        datetime timestamp
    }

    SYSTEM_HEARTBEAT {
        int id PK
        datetime beat_minute UK
        int load_pct
        datetime created_at
    }

    USER ||--o{ REFRESH_TOKEN : has
    USER ||--o{ WEBAUTHN_CREDENTIAL : owns
    USER o|--o{ AUDIT_LOG : creates

    USER ||--o{ CASE_FILE : creates
    USER o|--o{ CASE_FILE : assigned_to
    USER o|--o{ CASE_FILE : approves

    USER ||--o{ EVIDENCE : uploads
    USER o|--o{ EVIDENCE : approves

    USER ||--o{ CUSTODY_RECORD : performs
    USER ||--o{ CASE_BOOK_PAGE : uploads

    USER ||--o{ CASE_ACCESS_REQUEST : submits
    USER o|--o{ CASE_ACCESS_REQUEST : decides

    USER ||--o{ CASE_ACCESS_GRANT : receives
    USER ||--o{ CASE_ACCESS_GRANT : grants
    USER o|--o{ CASE_ACCESS_GRANT : revokes

    CASE_FILE o|--o{ EVIDENCE : contains
    CASE_FILE ||--o{ CASE_BOOK_PAGE : has
    CASE_FILE o|--o{ CASE_ACCESS_REQUEST : requested_for
    CASE_FILE ||--o{ CASE_ACCESS_GRANT : grants_for

    EVIDENCE ||--o{ CUSTODY_RECORD : has

    CASE_ACCESS_REQUEST o|--o{ CASE_ACCESS_GRANT : results_in
```
