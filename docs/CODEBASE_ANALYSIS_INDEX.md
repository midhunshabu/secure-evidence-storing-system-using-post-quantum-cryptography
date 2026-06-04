# PQC Evidence System - Codebase Analysis Index

## Quick Links

### Main Analysis Document
📄 **[CODEBASE_ANALYSIS.md](CODEBASE_ANALYSIS.md)** - Complete structured inventory (11 sections)

---

## Document Sections Overview

### 1. **Database Models & Relationships**
All 11 database tables with complete field documentation:
- `users` - Users with PQC keys, PQID, WebAuthn support
- `case_files` - Case metadata container
- `evidence` - Encrypted file tracking
- `custody_records` - Chain of custody audit trail
- `case_book_pages` - Immutable case documents
- `court_access_requests/grants` - Time-limited court access
- `audit_logs` - Hash-chain integrity logs
- `refresh_tokens` - Session management
- `system_heartbeats` - Health monitoring
- `webauthn_credentials` - Passkey credentials

**Total DB Tables:** 11  
**Total Fields Documented:** 150+  
**Relationships:** 20+ defined

---

### 2. **API Endpoints**
Complete REST API mapping:
- **Auth Routes:** 9 endpoints (login, MFA, tokens, logout)
- **Evidence Routes:** 20+ endpoints (upload, download, cases, court access)
- **Admin Routes:** 15+ endpoints (approvals, users, audit, health)

**Total Endpoints:** 45+  
**Input/Output:** Every endpoint documented with req/resp schemas  
**Rate Limits:** Specified per endpoint

---

### 3. **External Data Sources & Integrations**
- **No third-party APIs** (all processing is internal)
- Libraries: liboqs-python, cryptography, webauthn, Flask-JWT, etc.
- Data sources: India state/district codes (hardcoded), system CPU load
- Storage: Local filesystem only (no cloud integration)

---

### 4. **File Storage & Flow**
Complete file lifecycle:
- **Evidence Upload:** Browser → Server (multipart) → Encryption → Storage
- **Evidence Download:** Storage → Decryption → Browser
- **Case Book:** PDF/image pages → Append-only storage
- **Key Vault:** User private keys → Fernet-encrypted files

**Storage Paths:**
- Evidence: `storage/evidence/{hash}.enc`
- Case books: `storage/case_books/{case_id}/page_{num}.{ext}`
- Key vault: `secure/key_vault/user_{id}.json.enc`
- Logs: `logs/app.log`

---

### 5. **Background Processes & Jobs**
- **Heartbeat Thread:** Every 30 seconds (system load recording)
- **API Audit Logging:** On-demand (after each request)
- **Hash-Chain Verification:** On-demand (admin audit check)
- No other scheduled jobs (synchronous architecture)

---

### 6. **Frontend Components & Interaction**
React app structure:
- **Auth Flow:** Login.jsx handles multiple MFA types (password, PQID, WebAuthn)
- **Evidence Flow:** Evidence.jsx handles cases, uploads, downloads, court access
- **Admin Flow:** Admin.jsx handles approvals, users, audit logs
- **State Management:** React hooks + localStorage for JWT

**Frontend-Backend Sync:**
- Axios interceptor with token refresh
- 30-second presence pings (keep-alive)
- Auto-logout on 401

---

### 7. **Data Flow Examples**
Detailed flows with step-by-step process:
1. Authentication (with MFA options)
2. Evidence upload (encryption process)
3. Evidence access (decryption process)

---

### 8. **Cryptographic Operations**
- **KEM:** ML-KEM-768 (or Kyber-768)
- **Signature:** ML-DSA-65 (or Dilithium3)
- **Symmetric:** AES-256-GCM
- **KDF:** HKDF-SHA256
- **Hashing:** SHA-256 (files), SHA3-256 (audit logs)

---

### 9. **Summary Tables**
Quick reference:
- Database table sizes and purposes
- API endpoint count by category
- File storage paths
- Background processes
- Security features

---

### 10. **Security Highlights**
- Post-Quantum Cryptography (NIST standards)
- Encryption-at-rest and in-transit
- Hash-chain integrity audit logs
- WebAuthn/Passkey support
- PQID MFA with lockout
- Role-based access control

---

### 11. **Dependencies**
Full list of:
- Backend libraries (Flask, JWT, PQC, WebAuthn, ORM, etc.)
- Frontend libraries (React, routing, HTTP, hashing, styling)

---

## How to Use This Analysis

### For DFD Creation:
1. Use **Section 1** for data store entities
2. Use **Section 2** for processes
3. Use **Section 7** for data flow arrows
4. Use **Section 9** for summary tables

### For System Documentation:
1. Database schema → Section 1
2. API documentation → Section 2
3. Integration points → Section 3
4. Architecture → Sections 4-6

### For Compliance/Auditing:
1. Audit trail design → Section 5 + Section 1 (audit_logs table)
2. Encryption methods → Section 8
3. Security controls → Section 10

### For Development:
1. API contracts → Section 2
2. File operations → Section 4
3. Frontend integration → Section 6

---

## Key Statistics

| Metric | Count |
|--------|-------|
| Database Tables | 11 |
| API Endpoints | 45+ |
| Models (Python) | 11 |
| Frontend Components | 9 |
| Background Processes | 2 |
| Encryption Algorithms | 4 |
| External APIs | 0 |
| Supported MFA Types | 3 |
| User Roles | 3 |

---

## File Locations

| Item | Path |
|------|------|
| Main Analysis | `/CODEBASE_ANALYSIS.md` |
| Database Models | `backend/app/models/` |
| API Routes | `backend/app/routes/` |
| Frontend App | `react-app/src/App.jsx` |
| API Client | `react-app/src/api.js` |
| Config | `backend/config.py` |

---

**Last Updated:** April 15, 2026  
**Version:** 1.0 (Complete analysis)  
**Status:** Ready for DFD creation
