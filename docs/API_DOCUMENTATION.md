# API Documentation

Base URL (development):
- `http://localhost:5000/api`

## Authentication Model

- Access token: JWT in `Authorization: Bearer <token>` header
- Refresh token: HttpOnly cookie, rotated via `POST /api/auth/refresh`
- Most endpoints return direct JSON objects; errors are usually:

```json
{"error": "message"}
```

## Health Endpoint

### `GET /api/healthz`
- Auth: none
- Response: `{"status":"ok"}`

## Auth Endpoints

### `POST /api/auth/register`
- Auth: required (admin only)
- Rate limit: `10 per minute`
- Purpose: create a new user with PQC keys and identity fields

Request JSON:

```json
{
  "username": "investigator_01",
  "email": "investigator01@example.com",
  "password": "StrongPass123!",
  "role": "investigator",
  "is_physically_verified": true,
  "aadhar_number": "123456789012",
  "address": "Station Road",
  "phone_number": "9876543210",
  "station_name": "Central Station",
  "designation": "",
  "court_details": "",
  "enroll_webauthn": true
}
```

Role-specific requirements:
- `admin`: `address` required
- `investigator`: `address`, `station_name` required
- `court_user`: `address`, `designation`, `court_details` required

Response `201`:

```json
{
  "message": "User registered successfully",
  "user": {
    "id": 2,
    "username": "investigator_01",
    "email": "investigator01@example.com",
    "role": "investigator",
    "is_active": true,
    "created_at": "2026-02-18T10:00:00",
    "last_login": null
  }
}
```

If `enroll_webauthn` is true, the response is `200` and returns WebAuthn enrollment options instead of tokens:

```json
{
  "mfa_required": true,
  "mfa_type": "webauthn",
  "flow": "enroll",
  "stage": "register",
  "login_token": "eyJ...",
  "options": { "publicKey": "..." },
  "origin": "http://localhost:5173"
}
```

### `POST /api/auth/login-challenge`
- Auth: none
- Rate limit: from `RATELIMIT_LOGIN_CHALLENGE` (default `10 per minute`)
- Purpose: legacy compatibility challenge endpoint

Request:

```json
{"username": "admin"}
```

Response `200`:

```json
{
  "challenge": "hex-string",
  "user_id": 1,
  "user_public_key": "base64"
}
```

### `POST /api/auth/login-verify`
- Auth: none
- Rate limit: from `RATELIMIT_LOGIN_VERIFY` (default `10 per minute`)
- Purpose: primary login endpoint (username **or** `pqid` + password)

Request:

```json
{
  "username": "YOUR_USERNAME",
  "password": "YOUR_PASSWORD"
}
```

Response `200`:

```json
{
  "access_token": "jwt",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "user@example.com",
    "role": "admin",
    "is_active": true,
    "created_at": "2026-02-18T10:00:00",
    "last_login": "2026-02-18T12:00:00"
  }
}
```

Also sets refresh-token cookie.

### `POST /api/auth/refresh`
- Auth: refresh token cookie required (`jwt_required(refresh=True, locations=["cookies"])`)
- Purpose: rotate refresh token + issue new access token

Response `200`:
- Same shape as login (`access_token`, `token_type`, `user`)
- New refresh cookie is set

### `GET /api/auth/verify-token`
- Auth: access token required
- Response `200`:

```json
{
  "valid": true,
  "user": {
    "id": 1,
    "username": "admin",
    "email": "user@example.com",
    "role": "admin",
    "is_active": true,
    "created_at": "2026-02-18T10:00:00",
    "last_login": "2026-02-18T12:00:00"
  }
}
```

### `GET /api/auth/presence`
- Auth: access token required
- Response: `{"status":"ok"}`

### `POST /api/auth/logout`
- Auth: access token required
- Purpose: revoke refresh session (if present) + clear cookies + audit event
- Response: `{"message":"Logged out successfully"}`

## Evidence Endpoints

### `POST /api/evidence/cases`
- Auth: access token required
- Roles: `admin`, `investigator`
- Content type: `application/json`

JSON body:
- `case_number` (required, unique)
- `case_title` (required)
- `complainant_name` (optional)
- `suspect_name` (optional)
- `incident_date` (optional, `YYYY-MM-DD`)
- `incident_location` (optional)
- `status` (optional: `open`, `investigation`, `closed`; default `open`)
- `case_summary` (optional)

Response `201`:

```json
{
  "message": "Case file created successfully",
  "case": {
    "id": "uuid",
    "case_number": "CASE-2026-001",
    "case_title": "Cyber Fraud Investigation",
    "status": "open",
    "created_by": 2,
    "created_at": "2026-02-18T12:00:00"
  }
}
```

### `GET /api/evidence/cases`
- Auth: access token required
- Role behavior: `admin` sees all case files
- Role behavior: `investigator` sees own case files
- Role behavior: `court_user` sees case files that have `court`-accessible evidence

Response:

```json
{
  "count": 1,
  "cases": [
    {
      "id": "uuid",
      "case_number": "CASE-2026-001",
      "case_title": "Cyber Fraud Investigation",
      "status": "open",
      "created_by": 2,
      "created_at": "2026-02-18T12:00:00"
    }
  ]
}
```

### `POST /api/evidence/upload`
- Auth: access token required
- Roles: `admin`, `investigator`
- Rate limit: from `RATELIMIT_EVIDENCE_UPLOAD` (default `60 per hour`)
- Content type: `multipart/form-data`

Form fields:
- `file` (required)
- `case_id` (required, must match an existing case file `case_number`)
- `description` (optional)

Allowed file extensions:
- `txt, pdf, png, jpg, jpeg, gif, zip, docx, xlsx, mp4, mov`

Response `201`:

```json
{
  "message": "Evidence uploaded successfully",
  "evidence": {
    "id": "uuid",
    "case_id": "CASE-2026-001",
    "case_file_id": "uuid",
    "filename": "sample.pdf",
    "file_hash": "sha256",
    "file_size": 1234,
    "description": "notes",
    "evidence_type": "pdf",
    "access_level": "investigator",
    "approval_status": "pending",
    "approved_by": null,
    "approved_at": null,
    "uploaded_at": "2026-02-18T12:00:00",
    "is_deleted": false
  }
}
```

### `GET /api/evidence/list`
- Auth: access token required
- Role behavior: `admin` sees all non-deleted evidence
- Role behavior: `investigator` sees own non-deleted evidence
- Role behavior: `court_user` sees evidence where `access_level == "court"`

Response:

```json
{
  "count": 1,
  "evidence": [
    {
      "id": "uuid",
      "case_id": "CASE-2026-001",
      "case_file_id": "uuid",
      "filename": "sample.pdf",
      "file_hash": "sha256",
      "file_size": 1234,
      "description": "notes",
      "evidence_type": "pdf",
      "access_level": "court",
      "approval_status": "approved",
      "approved_by": 1,
      "approved_at": "2026-02-18T13:00:00",
      "uploaded_at": "2026-02-18T12:00:00",
      "is_deleted": false
    }
  ]
}
```

### `GET /api/evidence/<evidence_id>`
- Auth: access token required
- Rate limit: from `RATELIMIT_EVIDENCE_GET` (default `300 per hour`)
- Purpose: decrypt + verify integrity/signature checks for authorized user

Response `200`:

```json
{
  "evidence": {"id": "uuid", "case_id": "CASE-2026-001"},
  "encrypted_content": "preview...",
  "signature_valid": true,
  "integrity_valid": true,
  "is_accessible": true
}
```

### `GET /api/evidence/<evidence_id>/custody-chain`
- Auth: access token required
- Response:

```json
{
  "evidence_id": "uuid",
  "custody_chain": [
    {
      "id": 12,
      "action": "upload",
      "timestamp": "2026-02-18T12:00:00",
      "user_id": 2,
      "notes": null,
      "ip_address": "127.0.0.1"
    }
  ]
}
```

### `POST /api/evidence/<evidence_id>/submit-to-court`
- Auth: access token required
- Roles: `investigator` (own evidence) or `admin`
- Effect: sets `access_level = "court"` and records custody action

Response:

```json
{
  "message": "Evidence submitted to court successfully",
  "evidence": {"id": "uuid", "access_level": "court"}
}
```

## Admin Endpoints

All admin endpoints require admin role.

### `GET /api/admin/overview`
- Returns high-level counts + PQC algorithm info + load/activity percentages.

### `GET /api/admin/health-history`
Query params:
- `date` (optional, `YYYY-MM-DD`)
- `tz_offset_minutes` (optional integer)

Returns hourly health/load timeline and summary for selected day.

### `GET /api/admin/health-history/minutes`
Query params:
- `date` (`YYYY-MM-DD`)
- `hour` (`0-23`)
- `tz_offset_minutes` (optional integer)

Returns minute-level load data for one hour.

### `GET /api/admin/evidence/pending`
- Returns pending evidence approvals.

### `GET /api/admin/evidence/by-status?status=pending|approved|rejected`
- Returns evidence list filtered by approval status.

### `POST /api/admin/evidence/<evidence_id>/approve`
- Approves evidence, signs approval, sets court access.

### `POST /api/admin/evidence/<evidence_id>/deny`
Request JSON optional:

```json
{"reason":"metadata mismatch"}
```

- Rejects evidence and records denial custody event.

### `GET /api/admin/users`
- Returns user list with `last_activity_at`.

### `PUT /api/admin/users/<user_id>`
Request fields (any subset):
- `email`
- `role` (`admin|investigator|court_user`)
- `is_active` (boolean)

### `DELETE /api/admin/users/<user_id>`
- Soft-deactivates user and revokes active refresh sessions.

### `GET /api/admin/audit-logs`
Query params:
- `action`
- `user_id`
- `resource_type`
- `limit` (default `1000`)
- `date` (`YYYY-MM-DD`)
- `tz_offset_minutes`

Returns logs enriched with:
- `user` info
- `integrity_badge`
- `sha3_hash`
- `chain_status` (`verified|tampered`)

### `GET /api/admin/audit-logs/export`
- Exports all logs as JSON.

### `GET /api/admin/system-status`
- Returns totals, recent activity, and compatibility count keys used by dashboard.

## Common HTTP Statuses

- `200` success
- `201` created
- `400` bad input
- `401` unauthorized/invalid credentials/session
- `403` permission denied
- `404` not found
- `409` conflict (duplicates, integrity mismatch, already-approved state)
- `500` internal error
