# Flanki

A Cloudflare-native Flanki session manager for creating lobbies, inviting friends, splitting teams, and tracking live match stats plus ranking.

## Stack

- Cloudflare Workers for APIs
- Cloudflare Assets for static frontend delivery
- Cloudflare D1 for persistence
- Facebook Login plus HTTP-only cookie sessions

## Environment split

This repo is now split into three clearly separated versions:

- `local development`
  Uses `wrangler dev --local`, local D1, and `.dev.vars`.
  This is where you can enable `ALLOW_DEV_LOGIN=true` and test without Facebook.
- `preview`
  A separate Cloudflare Worker intended for remote testing and demos.
  It should use its own D1 database and may keep `ALLOW_DEV_LOGIN=true`.
- `production`
  The real public app with full login and safety features.
  `ALLOW_DEV_LOGIN` is blocked in code when `APP_ENV=production`, even if someone accidentally sets it.

The split is defined in [wrangler.toml](/abs/path/c:/Users/jakub/OneDrive/Dokumenty/GitHub/flanki/wrangler.toml:1).

## Required Cloudflare resources

Create these D1 databases:

1. `local`
   Local-only via `--local`; no real remote setup needed.
2. `preview`
   Replace `replace-with-preview-d1-database-id` in `wrangler.toml`.
3. `production`
   Already points at the production database in `wrangler.toml`.

Apply schema to a remote environment with the explicit environment command:

```bash
npm run db:apply:preview
# or
npm run db:apply:production
```

## Required secrets

Set secrets per remote environment:

```bash
wrangler secret put SESSION_SECRET --env preview
wrangler secret put FACEBOOK_APP_ID --env preview
wrangler secret put FACEBOOK_APP_SECRET --env preview

wrangler secret put SESSION_SECRET --env production
wrangler secret put FACEBOOK_APP_ID --env production
wrangler secret put FACEBOOK_APP_SECRET --env production
```

For local development, you can also create a `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
```

For quick local testing without Facebook, keep this only in local `.dev.vars`:

```env
ALLOW_DEV_LOGIN=true
```

Do not set `ALLOW_DEV_LOGIN` in production secrets or vars.

## Accounts

Players sign in with Facebook. The app takes:

- Facebook name as display name
- Facebook profile photo as avatar
- a custom Flanki player nick that the user sets inside the app

The Worker exchanges the Facebook OAuth code server-side and keeps players signed in with an HTTP-only session cookie.

## Facebook app setup

Configure Meta with the callback that matches the version you are running:

Local:

```text
http://127.0.0.1:8787/api/auth/facebook/callback
```

Production:

```text
https://flanki.jakub-kieps.workers.dev/api/auth/facebook/callback
```

Preview:

```text
https://flanki-preview.<your-subdomain>.workers.dev/api/auth/facebook/callback
```

Then copy your `App ID` and `App Secret` into local `.dev.vars` or into the matching Cloudflare environment secrets.

Local example:

```env
FACEBOOK_APP_ID=your_real_app_id
FACEBOOK_APP_SECRET=your_real_app_secret
```

Restart `wrangler dev` after local changes.

This app requests `public_profile` and `email`. The Facebook name and profile photo are used for the account, and the player still sets an in-app Flanki nick after login.

## Dev test mode

If `ALLOW_DEV_LOGIN=true`, the signed-out screen also shows a local test-player form. It lets you create or reuse temporary local players without Facebook so you can test sessions, invites, teams, stats, and ranking more quickly during development.

This is intended for:

- `local development`
- optionally `preview`

It is hard-blocked in `production` by environment logic in [src/worker.js](/abs/path/c:/Users/jakub/OneDrive/Dokumenty/GitHub/flanki/src/worker.js:807).

## Local development

```bash
npm install
npm run db:reset:local
npm run check
npm run dev
```

Local preview-style run:

```bash
npm run dev:preview
```

Preview-style local run uses the `preview` Wrangler environment while still serving locally.

## Deploy and preview commands

Use explicit commands only:

```bash
npm run deploy:preview
npm run deploy:production
```

The plain `npm run deploy` command is intentionally blocked so production cannot be deployed by accident.

How to preview each version:

- `local development`
  Run `npm run dev`
  Open `http://127.0.0.1:8787`
- `local preview-style`
  Run `npm run dev:preview`
  Open `http://127.0.0.1:8787`
- `remote preview`
  Run `npm run deploy:preview`
  Open the `workers.dev` URL Wrangler returns for `flanki-preview`
- `production`
  Run `npm run deploy:production`
  Open `https://flanki.jakub-kieps.workers.dev`

## Safe workflow

Use this flow so test and production do not mix:

1. Build and test features locally with `npm run dev`.
2. If you want a remote demo/test build, deploy with `npm run deploy:preview`.
3. Only publish real user changes with `npm run deploy:production`.
4. Keep preview and production on separate D1 databases.
5. Keep `ALLOW_DEV_LOGIN=true` out of production.

## Notes

- If you installed `node`, `npm`, or `wrangler` while this terminal session was already open, restart the terminal so they are added to `PATH`.
- The QR image is currently rendered through `api.qrserver.com` on the client.
- Local D1 schema setup was validated with `wrangler d1 execute flanki-db-local --local --file=./schema.sql`.
- If you previously used the older local-account schema locally, run `npm run db:reset:local` once to rebuild the local database for the Facebook-based account model.
- Set `APP_ORIGIN` when your public Worker URL differs from the current request origin so Facebook OAuth redirects back to the right domain.
- In the Facebook app settings, add `APP_ORIGIN/api/auth/facebook/callback` as a valid OAuth redirect URI.

## App features

- Sign in with your Facebook account
- Keep a separate in-app player nick for Flanki identity
- Maintain a friend list from other registered players
- Create shared Flanki sessions
- Invite friends directly into a session
- Join sessions with a share link or QR code
- Auto-sort players into two teams
- Run a captain draft where captain A picks 1, then teams alternate in 2-pick turns
- Reorder players inside each team to match the real throwing order
- Start a live match and log each throw as miss, hit, beer finished, or hit plus beer finished
- Remove players from the active rotation once they finish their beer and leave the field
- Track per-match player and team accuracy
- Record how many hits a player had when they finished their beer
- Build a running leaderboard from cumulative player performance
