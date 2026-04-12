---
name: node
description: >-
  Develop and troubleshoot Node.js projects using package.json, npm/pnpm/yarn,
  ESM vs CommonJS, and the Node runtime. Use when the user mentions Node.js,
  npm, npx, nvm, fnm, Volta, package.json, lockfiles, modules, or running
  JavaScript/TypeScript on the server or in tooling.
---

# Node.js

## Before changing or running anything

1. Read `package.json` at the project root (or the package root the user indicated): `scripts`, `dependencies`, `devDependencies`, `type`, `engines`.
2. Detect the package manager from lockfiles in the same directory:
   - `pnpm-lock.yaml` → use `pnpm` / `pnpm exec`
   - `yarn.lock` → use `yarn` / `yarn dlx`
   - `package-lock.json` or none → default to `npm` / `npx`
3. If `.nvmrc`, `.node-version`, or `engines.node` exists, align commands and version advice with them when relevant.

## Commands

- Prefer **declared scripts**: `npm run <script>` (or `pnpm run`, `yarn <script>`) when the script exists.
- Use **`npx` / `pnpm exec` / `yarn dlx`** for one-off CLIs when no script wraps them.
- Run **`node <file>`** for direct entrypoints; use project conventions for TypeScript (e.g. `tsx`, `ts-node`, or build-then-run).

## Module system

- **`"type": "module"`** in `package.json` → `.js` files are ESM; use `import`/`export`.
- **No `type` or `"type": "commonjs"`** → `.js` is CommonJS unless using `.mjs` / `.cjs`.
- Respect existing patterns: do not mix ESM/CJS in one file or flip `type` without updating imports and tooling.

## Agent behavior

- Execute installs and scripts from the **correct package root** (monorepos: the workspace package unless the user says otherwise).
- Do not assume global installs; prefer local `devDependencies` and lockfile-driven installs.
- Match the repo’s existing style (semicolons, quote style, test runner) from neighboring files and config.
- For Cloudflare Workers in this repo, prefer [wrangler/SKILL.md](../wrangler/SKILL.md) for Wrangler-specific commands and `wrangler.toml`.

## Optional reference

- For deeper Node API or release notes, see [reference.md](reference.md) when the task needs official pointers.
