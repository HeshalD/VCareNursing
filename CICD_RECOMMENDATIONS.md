# CI/CD Recommendations — VCareNursing

Date: 2026-05-26

This document lists recommended CI/CD practices, pipeline stages, example GitHub Actions jobs, and deployment/security considerations tailored to this repository (backend + client + Docker). Implementing these will improve reliability, catch regressions earlier, and make deployments repeatable and auditable.

## Goals

- Provide fast feedback on PRs (lint, tests, build) before merge.
- Produce reproducible production artifacts (Docker images and client build outputs).
- Automate deployments to staging and production with safe migration and rollback steps.
- Enforce secrets, branch protection, and security scans.
- Enable observability (healthchecks, logs, errors) and automated alerts.

---

## High-level pipeline (recommended)

1. PR checks (every PR / push to feature branches)
   - Install dependencies, run lint (`client` and `backend`), run unit tests (add tests later), run type checks if applicable.
   - Run lightweight integration or smoke tests (optional).
   - Run dependency vulnerability scan (Dependabot + Snyk or GitHub Code Scanning).

2. Build artifacts (on merge to `main` / `release` branch)
   - Build `client` (Vite) and store as artifact or build-and-publish static files to CDN/Vercel.
   - Build `backend` Docker image and tag with `sha`, `branch` and semantic version (if release).

3. Continuous Delivery (staging → production)
   - On merge to `main`: deploy to a staging environment automatically (or on dedicated `staging` branch).
   - Run migration job against staging DB (run `node migrate.js` or DB migration tooling) with backups enabled.
   - Run end-to-end smoke tests against staging.
   - After manual approval (or automated promotion), deploy to production with migration step, healthcheck, and short canary period.

4. Post-deploy
   - Run healthchecks and smoke tests.
   - Notify Slack/email and open monitoring/alerting dashboards.
   - Tag release and generate changelog (semantic-release or manual).

---

## Repo-specific notes and quick wins

- The repo already contains Dockerfiles for `backend` and `client`, and a `docker-compose.yml` for local dev. Use these as the canonical build steps in CI.
- Backend has a `migrate` script (`node migrate.js`) — include a migration step in deployment workflows.
- `nodemon` is present for dev; ensure production uses `npm start` (already set in Dockerfile). Dockerfile installs only prod deps which is good.
- Client is a Vite app with a production static build — deploy to Vercel or host as Docker image via nginx (Dockerfile already prepared).

---

## Secrets and environment management

- Store secrets in the CI provider's secrets store (GitHub Secrets, GitHub Environments, Render/Vercel dashboard). Do NOT check .env files into Git.
- Use separate secrets for `staging` and `production` (e.g., `DB_URL_STAGING`, `DB_URL_PROD`).
- For Docker image pushes, store credentials: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` or use GitHub Packages (GHCR) with a deploy key.
- For Render/Vercel deployments, use their API keys and slightly different env-scopes.

---

## Recommended GitHub Actions workflows (filenames)

- `.github/workflows/pr-checks.yml` — run lint, tests, dependency scan on PRs.
- `.github/workflows/backend-cd.yml` — build backend image, push to registry, deploy to Render (or your host) on merge to `main`/`release`.
- `.github/workflows/client-cd.yml` — build client, run lint, build artifact, and deploy to Vercel (or push to CDN) on merge.
- `.github/workflows/release.yml` — semantic-release or manual tagged release (optional automated changelog & npm/git tagging).

### Minimal backend CI example (concept)

Use `docker/build-push-action` to build and push images. Replace registry/actions with your provider.

Jobs:
- `lint-test-build` on PR: install Node, cache `~/.npm`, run `npm ci`, run `npm run lint` (add lint script), run `npm test` (add tests later).
- `build-and-push` on push to `main`: build Docker image, tag `ghcr.io/<org>/vcarenursing-backend:${{ github.sha }}`, push, then trigger deploy step.

### Minimal client CI example (concept)

Jobs:
- `lint-build` on PR: `npm ci`, `npm run lint`, `npm run build` to ensure no build regressions.
- `deploy` on main: either deploy with `vercel-action` or build Docker image and push to registry for hosting.

---

## Database migrations strategy

- Back up production DB before running migrations.
- Use a release job that runs migrations as a separate step (not inside the web container startup) so failures don't bring the app up in a bad state.
- Example step: `npm run migrate` using the `migrate` script in `backend/package.json`.
- Prefer idempotent migrations and include migration locking if using raw SQL.

---

## Tests and quality gates

- Add unit tests for both backend and client (Jest / Vitest). Add an initial coverage threshold to CI.
- Add ESLint and run it in PR checks (client already has `lint` script). Add backend linting too (ESLint + Node rules).
- Add code scanning via GitHub Advanced Security or external tools (Snyk/CodeQL).

---

## Security and dependency management

- Enable Dependabot (dependencies PRs) and auto-merge minor/patch updates after passing CI.
- Run weekly vulnerability scans (Snyk or GitHub Dependabot alerts + automated PRs).
- Add secrets scanning and ensure history does not contain secrets (use git-secrets or trufflehog if needed).

---

## Observability, monitoring & rollbacks

- Add application logging and centralized log sink (e.g., LogDNA, Datadog, Papertrail).
- Add Sentry or similar for error reporting in backend and client.
- After deployment, run a smoke test; if it fails revert automatically or trigger a rollback process.
- Use healthcheck endpoint (there is a `healthcheck.js`) as readiness probe in orchestrator or Render/containers.

---

## Recommended incremental roadmap (prioritized)

1. Add PR checks: ESLint (client + backend), install, build (client), basic smoke script for backend. (Fast win)
2. Add GitHub Actions workflows to build artifacts and push backend Docker image to GHCR/DockerHub. Add staging deploy.
3. Add migration step and staging smoke tests. Protect `main` with required checks and require PR reviews. (Safety)
4. Add Dependabot + CodeQL + Snyk. Add test coverage thresholds. (Security)
5. Automate releases (semantic-release) and post-deploy monitoring + alerts. (Maturity)

---

## Helpful links & next actions I can take for you

- Create the GitHub Actions workflows (I can scaffold them for you).
- Add Dependabot config and CodeQL workflow.
- Add GHCR push + Render/Vercel deploy actions configured to your repo secrets.

If you want, I can scaffold `.github/workflows/pr-checks.yml`, `.github/workflows/backend-cd.yml`, and `.github/workflows/client-cd.yml` next. Tell me which registry/deployment targets you prefer (DockerHub, GHCR, Render, Vercel, AWS, GCP, Azure), and whether you want automatic production deploys or manual approvals.