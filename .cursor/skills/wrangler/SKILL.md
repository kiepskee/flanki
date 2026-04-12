---
name: wrangler
description: >-
  Develop and deploy Cloudflare Workers with Wrangler (wrangler.toml, dev,
  deploy, D1, static assets, bindings). Use when the user mentions Wrangler,
  Cloudflare Workers, wrangler dev/deploy, D1, wrangler.toml, or Cloudflare
  edge deployment.
---

# Cloudflare Wrangler

## Defaults for this repo

- Config: `wrangler.toml` at repo root; entry `main = "src/worker.js"`.
- Static files: `[assets]` → `./public`, binding `ASSETS`.
- D1: binding `DB`, database name `flanki-db` (ensure `database_id` is set after creating the DB).
- NPM scripts: `npm run dev` → `wrangler dev`, `npm run deploy` → `wrangler deploy`, `npm run db:apply` → apply `schema.sql` to `flanki-db`.

Prefer `npm run …` when scripts exist; otherwise `npx wrangler …` from the project root.

## Common tasks

**Local dev (Worker + assets)**

- Run: `npm run dev` (or `npx wrangler dev`).
- Worker code lives under `src/`; static responses use the assets binding as configured in the worker.

**Deploy**

- Run: `npm run deploy` (or `npx wrangler deploy`).
- Confirm `compatibility_date` in `wrangler.toml` is appropriate for APIs in use.

**D1**

- Create DB (once): `npx wrangler d1 create flanki-db` — copy the returned `database_id` into `wrangler.toml` under `[[d1_databases]]`.
- Apply schema: `npm run db:apply` or `npx wrangler d1 execute flanki-db --file=./schema.sql`.
- Ad-hoc SQL: `npx wrangler d1 execute flanki-db --command="SELECT 1"`.

**Secrets**

- `npx wrangler secret put SECRET_NAME` (prompts for value; not stored in `wrangler.toml`).

## Editing `wrangler.toml`

- `name`: Worker name in the dashboard.
- `main`: path to the Worker entry module.
- `compatibility_date`: pins runtime behavior; bump when adopting newer APIs.
- `[[d1_databases]]`: `binding` is the env name in worker code; `database_name` / `database_id` tie to the remote D1 instance.
- `[assets]`: `directory` and `binding` for static asset serving from the Worker.

After structural changes, run dev or deploy to validate.

## Agent behavior

- Run Wrangler commands from the repository root unless the user specifies another cwd.
- Do not commit real secrets; use Wrangler secrets or dashboard env for sensitive values.
- If behavior differs by Wrangler major version, check `package.json` `wrangler` range and prefer flags documented for that generation.
- For authoritative, up-to-date CLI flags and new features, use [Cloudflare Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/).
