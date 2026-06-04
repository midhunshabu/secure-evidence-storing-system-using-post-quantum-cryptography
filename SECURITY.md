# Security Policy

This repository is published as source code only. Runtime data such as evidence
files, case records, local databases, logs, backups, key vault files, and
environment secrets must not be committed.

If you clone or deploy this project:

- Create your own `.env` from `backend/.env.example`
- Use strong unique secrets for every environment
- Keep production databases and uploaded evidence outside Git
- Review access control before using the system with real evidence
- Do not use development fallback cryptography settings in production

If a secret or private file is accidentally committed, rotate the affected
secret immediately and remove it from Git history before publishing.
