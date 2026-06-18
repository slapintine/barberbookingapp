# Follow-up plan: refresh-token flow

## Current state (verified 2026-06-16)

- Auth issues a **single JWT access token**, signed in `backend/src/utils/generateToken.js`
  with `expiresIn: env.jwtExpiresIn || "7d"` (`JWT_EXPIRES_IN`, default `7d`).
- `generateToken({...})` is called on register, login, and password reset
  (`backend/src/controllers/authController.js:295,341,455,701`) and returned as
  `{ success, token, user }`.
- `backend/src/middleware/authMiddleware.js` `protect` verifies the `Bearer` token only.
- Frontend stores it in `localStorage.lineup_token` (+ `lineup_token_expires_at`),
  attaches it in `frontend/src/config/api.js` `apiFetch`, and on expiry **logs the
  user out** (boot `/auth/me` reconciliation + the `sessionExpiresAt` effect).
- **There is no `/auth/refresh` endpoint and no refresh token** (grep: none in
  `backend/src` or `frontend/src`).

**Consequence:** when the 7-day access token expires, the user is forced to log in
again. There is no silent renewal.

## Goal

Short-lived access tokens (~15 min) + long-lived **rotating** refresh tokens so
sessions survive access-token expiry without re-login, while remaining revocable.

## Backend changes

1. **Token strategy**
   - Access token: drop `JWT_EXPIRES_IN` to `15m`. Keep the existing payload
     (`userId`, `username`, `role`).
   - Refresh token: opaque random 256-bit value (`crypto.randomBytes(32).hex`),
     **not** a JWT. Store only a hash (`sha256`) server-side.

2. **Storage** — new migration `0NN_refresh_tokens.sql`:
   ```
   refresh_tokens(
     id, user_id FK, token_hash UNIQUE, family_id,
     expires_at, revoked_at, replaced_by, user_agent, ip, created_at
   )
   ```
   Default refresh lifetime ~30 days.

3. **New endpoints** (`authRoutes.js`, behind `authRateLimiter`):
   - `POST /auth/refresh` — validate refresh token (hash lookup, not expired, not
     revoked), **rotate** it (revoke old, issue new in same `family_id`), return a
     new access token (+ new refresh token via cookie). On reuse of an already-
     rotated token → revoke the whole `family_id` (reuse-detection).
   - `POST /auth/logout` — revoke the presented refresh token / family; clear cookie.

4. **Transport** — set the refresh token as an `httpOnly`, `Secure`, `SameSite=Strict`
   cookie scoped to `/api/auth`. This also addresses the "JWTs stored client-side"
   risk noted in the hardening pass. Access token stays in memory/`localStorage`.

5. **Issue on login/register** — update the 4 `generateToken` call sites to also
   create a refresh-token row + set the cookie.

## Frontend changes

1. `apiFetch` (`frontend/src/config/api.js`): on a **401 with a token**, attempt a
   single `POST /auth/refresh` (cookie sent automatically); on success, store the new
   access token and **retry the original request once**; on failure, fall through to
   the existing silent `clearStoredAuth()` + guest-mode behavior. Use a shared
   in-flight refresh promise so concurrent 401s trigger only one refresh.
2. Remove/relax the proactive `sessionExpiresAt` logout effect in `App.jsx` — expiry
   is now handled by transparent refresh, not forced logout.
3. `authApi.js`: add `refreshSession()` and `logout()` (calls `POST /auth/logout`).

## Testing

- Extend `backend/src/security.integration.test.js`: refresh rotates and invalidates
  the old token; reused refresh token revokes the family; expired/revoked refresh is
  rejected; logout revokes.
- Frontend: a 401 triggers exactly one refresh + retry; failed refresh → clean guest
  mode (no toast), consistent with `fix/stale-auth-reconcile`.

## Rollout notes

- Refresh-token store must be shared/persistent across instances (DB table is fine;
  pairs with moving rate-limiting off in-memory per the hardening pass remaining-risks).
- Ship behind the existing auth flow: old long-lived tokens keep working until they
  expire, so no forced logout on deploy.

## Effort

~1–1.5 days: migration + endpoints + rotation/reuse logic (backend), `apiFetch`
refresh-and-retry + cookie wiring (frontend), tests.
