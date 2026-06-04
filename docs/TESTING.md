# Testing Guide

This project currently has no committed automated test suite under `backend/tests` or `react-app` unit tests. Use the smoke/regression workflow below after upgrades.

## 1. Environment Bring-Up

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python migrate_db.py
python init_db.py
python run.py
```

In another terminal:

```bash
cd react-app
npm install
npm run dev
```

## 2. API Smoke Tests

### Health check

```bash
curl -s http://localhost:5000/api/healthz
```

Expected:

```json
{"status":"ok"}
```

### Login and token capture

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login-verify \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_ADMIN_USERNAME","password":"YOUR_ADMIN_PASSWORD"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
```

### Verify token

```bash
curl -s http://localhost:5000/api/auth/verify-token \
  -H "Authorization: Bearer $TOKEN"
```

### Admin users list

```bash
curl -s http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer $TOKEN"
```

### Evidence upload

```bash
echo 'test evidence payload' > /tmp/evidence.txt
curl -s -X POST http://localhost:5000/api/evidence/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "case_id=CASE-2026-001" \
  -F "description=smoke test" \
  -F "file=@/tmp/evidence.txt"
```

### Approval queue

```bash
curl -s "http://localhost:5000/api/admin/evidence/by-status?status=pending" \
  -H "Authorization: Bearer $TOKEN"
```

## 3. Frontend Smoke Tests

1. Open `http://localhost:5173`
2. Login with your locally provisioned admin account
3. Confirm Admin console modules load (Overview, Health, Alerts, Users, PQC)
4. Upload evidence from Evidence page
5. Approve or deny from Admin approvals panel
6. Confirm audit rows appear in Alert Center

## 4. Production Readiness Test

Run preflight checker:

```bash
cd backend
python check_production.py
```

Must pass before production deploy.

## 5. Regression Checklist After Backend Changes

- Auth: login works with username and `pqid`
- Auth: refresh rotates token and keeps session alive
- Auth: logout clears refresh cookie
- Evidence: upload works for investigator/admin
- Evidence: list access obeys role filters
- Evidence: retrieve enforces integrity/signature checks
- Evidence: submit-to-court changes access level
- Admin: overview counts update
- Admin: approve/deny writes custody + audit records
- Admin: user deactivation revokes refresh sessions
- Admin: audit logs include `chain_status`
- Admin: health history endpoints return hourly/minute points

## 6. Frontend Validation Commands

```bash
cd react-app
npm run lint
npm run build
```

`npm run build` must complete and output to `backend/static`.
