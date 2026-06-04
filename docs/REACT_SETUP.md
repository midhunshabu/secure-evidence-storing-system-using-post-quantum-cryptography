# React Frontend Setup

## Prerequisites

- Node.js 18+
- Backend API running at `http://localhost:5000`

## Install

```bash
cd react-app
npm install
cp .env.example .env
```

`react-app/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
```

Note: current `src/api.js` uses relative `/api` paths. In dev, Vite proxy forwards `/api` to backend.

## Run in Development

```bash
npm run dev
```

Frontend URL:
- `http://localhost:5173`

Vite proxy target defaults to `http://localhost:5000` via `vite.config.js`.

Optional override:

```bash
VITE_API_PROXY_TARGET=http://localhost:5000 npm run dev
```

## Build for Production

```bash
npm run build
```

Output target is configured as:
- `../backend/static`

After build, run backend and open:
- `http://localhost:5000`

## Available Scripts

- `npm run dev` - start Vite dev server
- `npm run build` - production build into `backend/static`
- `npm run preview` - preview build locally
- `npm run lint` - ESLint

## Current UI Modules

- Login (`/login`)
- Register (`/register`, admin provisioning mode)
- Evidence (`/evidence`)
- Admin console (`/admin`)

## Auth Behavior in Frontend

- Access token stored in `localStorage` (`access_token`)
- Axios interceptor attaches bearer token
- On `401`, frontend attempts `POST /auth/refresh`
- If refresh fails, session is cleared and user returns to login
