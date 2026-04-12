# Flanki

A Cloudflare-native web app for creating shared game sessions, inviting friends, and joining by QR code.

## Stack

- Cloudflare Workers for APIs
- Cloudflare Assets for static frontend delivery
- Cloudflare D1 for persistence
- Built-in player accounts with cookie sessions

## Required Cloudflare resources

1. Create a D1 database.
2. Replace `database_id` in `wrangler.toml`.
3. Apply the schema:

```bash
wrangler d1 execute flanki-db --file=./schema.sql
```

## Required secrets

Set these Worker secrets:

```bash
wrangler secret put SESSION_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put EMAIL_FROM
```

For local development, you can also create a `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
```

## Accounts

Players create their own profile inside the app with:

- display name
- player name
- email
- password

Passwords are stored as PBKDF2 hashes in D1, and the Worker keeps players signed in with an HTTP-only session cookie.

The app also supports:

- email verification links
- password reset links

If `RESEND_API_KEY` and `EMAIL_FROM` are configured, the Worker sends those emails through Resend. If they are missing, the app falls back to a dev-only link returned in the UI so you can keep testing locally.

## Local development

```bash
npm install
npm run db:reset:local
npm run check
npm run dev
```

## Deploy

```bash
npm run deploy
```

## Notes

- If you installed `node`, `npm`, or `wrangler` while this terminal session was already open, restart the terminal so they are added to `PATH`.
- The QR image is currently rendered through `api.qrserver.com` on the client.
- Local D1 schema setup was validated with `wrangler d1 execute flanki-db --local --file=./schema.sql`.
- If you previously used the older GitHub-auth schema locally, run `npm run db:reset:local` once to rebuild the local database for the new account model.
- Set `APP_ORIGIN` when your public Worker URL differs from the current request origin so email links point at the right domain.

## App features

- Create your own player profile
- Sign in with your player account
- Maintain a friend list from other registered players
- Create shared game sessions
- Invite friends directly into a session
- Join sessions with a share link or QR code
