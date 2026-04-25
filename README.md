# Barber Booking App

A mobile-first barber booking app with customer accounts, barber profiles, bookings, reviews, messaging, notifications, schedules, maps, and push notification support.

## Tech Stack

- Frontend: Vite, React, Leaflet, Socket.IO client
- Backend: Node.js, Express, Socket.IO, SQLite for local development, PostgreSQL for production
- Auth: JWT with bcrypt password hashing
- Realtime: Socket.IO messages, booking updates, and notification events

## Project Structure

```text
barber-booking-app/
  backend/      Express API, database setup, Socket.IO server
  frontend/     Vite React app
```

## Requirements

- Node.js 18+
- npm

## Environment Setup

Create local env files from the examples:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Then update `backend\.env` with a strong `JWT_SECRET`.

Required backend variables:

```text
NODE_ENV=development
PORT=4000
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-this-with-at-least-32-random-characters
DB_CLIENT=sqlite
DB_PATH=./src/db/barber_app.sqlite
```

For production PostgreSQL, use:

```text
DB_CLIENT=postgres
DATABASE_URL=postgresql://user:password@host:5432/database
DATABASE_SSL=true
```

Required frontend variables:

```text
VITE_API_URL=http://localhost:4000
```

Push notification variables are optional until browser push is enabled:

```text
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
```

## Install

Install backend and frontend dependencies:

```powershell
npm --prefix backend install
npm --prefix frontend install
```

## Run Locally

Start the backend:

```powershell
npm run backend:dev
```

Start the frontend in another terminal:

```powershell
npm run frontend:dev
```

Default URLs:

- API: `http://localhost:4000`
- Frontend: `http://localhost:5173`

## Checks

Run backend syntax check:

```powershell
npm run backend:check
```

Build the frontend:

```powershell
npm run frontend:build
```

Run both:

```powershell
npm run check
```

## Database

Local development defaults to SQLite so the app can run without external services.

Production should use PostgreSQL:

1. Create a PostgreSQL database on Supabase, Neon, Railway, Render, AWS RDS, or another managed provider.
2. Set `DB_CLIENT=postgres`.
3. Set `DATABASE_URL` to the provider connection string.
4. Set `DATABASE_SSL=true` for managed cloud databases that require TLS.
5. Install backend dependencies after pulling this change:

```powershell
npm --prefix backend install
```

Run migrations:

```powershell
npm run backend:db:migrate
```

The production schema lives in:

```text
backend/src/db/migrations/postgres/
```

## Production Notes

Before launch:

- Set `NODE_ENV=production`.
- Set `CLIENT_URL` to the deployed frontend URL. For multiple URLs, use a comma-separated list.
- Use a long random `JWT_SECRET` and keep it out of source control.
- Use PostgreSQL in production and run migrations during deploy.
- Enable automated backups on the managed PostgreSQL provider.
- Store uploaded images in object storage such as Cloudinary, S3, or Supabase Storage.
- Add automated tests for auth, booking conflicts, schedules, reviews, and messaging permissions.
- Put the API behind HTTPS and a reverse proxy or managed platform.

## Current Production Foundation

This app includes:

- Required environment validation at server startup
- Restricted production CORS
- Basic security headers
- API and auth rate limiting
- Structured request logging
- Health endpoints

Next recommended engineering pass: split the large frontend `App.jsx` into API modules, hooks, pages, and reusable components.
