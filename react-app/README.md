# React App (Current)

Modern client for the PQC Evidence Storing System.

## Stack

- React 18
- Vite
- Axios
- React Router
- Tailwind CSS + custom styles

## Development

```bash
cd react-app
npm install
npm run dev
```

Runs at `http://localhost:5173`.

`vite.config.js` proxies `/api` to backend (default `http://localhost:5000`).

## Production Build

```bash
npm run build
```

Build output is written to:
- `../backend/static`

Backend then serves the SPA and API from the same origin.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`

## Core Files

- `src/App.jsx` - route gating and auth state
- `src/api.js` - API clients + refresh interceptor
- `src/components/Login.jsx`
- `src/components/Register.jsx`
- `src/components/Evidence.jsx`
- `src/components/Admin.jsx`

## Notes

- This is the actively maintained frontend.
- Legacy static frontend exists in repo `frontend/` for reference only.
