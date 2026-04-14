# Flanki

A Cloudflare-native Flanki session manager for creating lobbies, inviting friends, splitting teams, and tracking live match stats plus ranking.

## Stack

- Cloudflare Workers for APIs
- Cloudflare Assets for static frontend delivery
- Cloudflare D1 for persistence
- Facebook Login plus HTTP-only cookie sessions

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
wrangler secret put FACEBOOK_APP_ID
wrangler secret put FACEBOOK_APP_SECRET
```

For local development, you can also create a `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
```

## Accounts

Players sign in with Facebook. The app takes:

- Facebook name as display name
- Facebook profile photo as avatar
- a custom Flanki player nick that the user sets inside the app

The Worker exchanges the Facebook OAuth code server-side and keeps players signed in with an HTTP-only session cookie.

## Facebook app setup

For local development with the current `.dev.vars`, configure your Meta app like this:

1. Create or open a Meta app in the Meta for Developers dashboard.
2. Add the `Facebook Login` product to the app.
3. In Facebook Login settings, add this exact redirect URI:

```text
http://127.0.0.1:8787/api/auth/facebook/callback
```

4. Copy your `App ID` and `App Secret` into `.dev.vars`:

```env
FACEBOOK_APP_ID=your_real_app_id
FACEBOOK_APP_SECRET=your_real_app_secret
```

5. Restart `wrangler dev`.

This app requests `public_profile` and `email`. The Facebook name and profile photo are used for the account, and the player still sets an in-app Flanki nick after login.

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
