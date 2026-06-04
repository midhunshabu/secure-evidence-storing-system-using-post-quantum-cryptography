# Secure Evidence Storing System using Post-Quantum Cryptography

A secure digital evidence management system designed to preserve evidence
integrity, custody history, and controlled access using modern cryptographic
workflows with post-quantum cryptography support.

## Overview

This project provides a full-stack evidence storing platform for controlled
case handling. It includes role-based access, encrypted evidence storage,
audit logging, case workflows, and administrator-managed user provisioning.

The repository is published without local runtime data. Databases, uploaded
evidence, audit logs, key vault files, backups, environment files, virtual
environments, and dependency folders are intentionally excluded from Git.

## Features

- Role-based access for administrators, investigators, and court users
- Case creation, approval, assignment, and lifecycle management
- Encrypted evidence and case book file handling
- Chain-of-custody and audit trail support
- PQID-based verification and authentication flow
- Post-quantum cryptography engine integration
- React frontend with Flask backend API
- Development and deployment documentation

## Tech Stack

- Backend: Flask, SQLAlchemy, Flask-JWT-Extended
- Frontend: React, Vite, Axios, React Router
- Database: SQLite for development, PostgreSQL-ready configuration
- Cryptography: post-quantum key/signature workflow, AES-GCM/Fernet-based local encryption utilities

## Project Structure

```text
backend/       Flask API, models, cryptography modules, routes, config
react-app/     React frontend application
frontend/      Legacy/static frontend files
docs/          Architecture, API, testing, deployment, and report documents
```

## Fresh Setup

### Backend

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

Update `backend/.env` with your own secrets before running the project in any
shared or production environment.

### Frontend

```bash
cd react-app
npm install
npm run dev
```

The React development server runs at:

```text
http://localhost:5173
```

The Flask backend runs at:

```text
http://localhost:5000
```

## Build Frontend

```bash
cd react-app
npm run build
```

The production frontend build is written to `backend/static/`.

## Documentation

Detailed documentation is available in `docs/`, including:

- Architecture overview
- API documentation
- Deployment guide
- Testing guide
- DFD and ER diagram material
- Project summary/report material

Start with:

```text
docs/README.md
docs/INDEX.md
```

## Security And Privacy

This repository does not include local evidence data, user databases, logs,
private keys, vault files, or `.env` secrets.

Before publishing or deploying your own copy, always verify:

```bash
git status --ignored
git ls-files
```

Do not commit:

- `.env` files
- SQLite databases
- uploaded evidence or case book files
- encrypted key vault files
- logs
- backups
- virtual environments
- `node_modules`

## Status

Academic final-year project prepared for clean public GitHub publishing.
