---
name: npm
description: >-
  Install dependencies, run scripts, and troubleshoot npm projects using
  package.json, package-lock.json, npx, and npm workspaces. Use when the user
  mentions npm, npx, package-lock.json, npm install, npm ci, npm publish,
  .npmrc, or choosing npm over pnpm/yarn.
---

# npm

## When to use this skill

Use for **npm as the package manager** (lockfile `package-lock.json`, or no lockfile and the user/repo standard is npm). If the repo has `pnpm-lock.yaml` or `yarn.lock`, prefer that manager instead; for broader Node topics (ESM/CJS, `engines`, runtime), see [node/SKILL.md](../node/SKILL.md).

## Before changing or running anything

1. Read `package.json` at the package root: `scripts`, `dependencies`, `devDependencies`, `workspaces`, `type`, `engines`, `packageManager` (Corepack).
2. Treat **`package-lock.json`** as the source of truth for resolved versions when it exists; commit it for apps and libraries meant to be reproducible.
3. Check **`.npmrc`** in the project or user home for registry, `save-exact`, hoisting, and workspace overrides.

## Install and CI

| Goal | Command |
|------|---------|
| Local dev, update lockfile if needed | `npm install` |
| CI / reproducible install from lockfile | `npm ci` |
| Add runtime dependency | `npm install <pkg>` |
| Add dev dependency | `npm install -D <pkg>` |
| Remove dependency | `npm uninstall <pkg>` |

- **`npm ci`** fails if `package.json` and `package-lock.json` are out of sync—fix by running `npm install` locally and committing the updated lockfile.
- Prefer **`npm install` without** carelessly using `--force` or `--legacy-peer-deps` unless the user or project already documents that need.

## Scripts and execution

- Prefer **`npm run <script>`** when the script exists in `package.json`.
- **`npm exec <pkg>`** or **`npx <pkg>`** for one-off CLIs; `npx` uses local `node_modules/.bin` when the package is installed.
- **`npm run`** with extra args: `npm run build -- --watch` (arguments after `--` go to the underlying command).

## Workspaces

- Monorepo roots list **`workspaces`** in `package.json`; install from the **root** so the tree links correctly.
- Run a script in one workspace: `npm run build -w <workspace-name-or-path>` (npm v7+).
- Workspace-only install patterns follow npm docs for the project’s npm major version.

## Publishing and registries

- **`npm publish`**: ensure `files`, `main`/`exports`, and version in `package.json` are correct; use `npm pack --dry-run` to inspect the tarball.
- Scoped packages (`@scope/name`): ensure `publishConfig.access` is set when publishing public scoped packages.
- For private registries, rely on `.npmrc` and env (e.g. `NPM_TOKEN`) without committing secrets.

## Troubleshooting (common)

- **EBADENGINE**: align Node version with `engines` in `package.json` or use a version manager.
- **ERESOLVE / peer dependency**: resolve by adjusting versions or, if the project already does so, documented flags in `.npmrc` or install command.
- **Missing script**: add it to `scripts` or call the binary via `npx` from a script.

## Agent behavior

- Run commands from the **correct package root** (repo root vs `packages/foo` in a monorepo).
- Do not assume global installs; add tools as **devDependencies** when they are part of the workflow.
- After changing dependencies, mention if **`package-lock.json`** should be committed.
