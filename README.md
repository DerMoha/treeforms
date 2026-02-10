# Treeforms MVP

Treeforms is a branch-first form builder built with Next.js + TypeScript.

## What this MVP includes

- Linear form builder with nested branch side panel
- Branching only from radio and checkbox options
- Question types: radio, checkbox, text, number
- Draft + publish immutable versioning
- Hosted respondent runtime (`/f/{slug}/v/{version}`)
- Autosave sessions with resume links
- Back navigation with branch recompute/pruning
- Submission persistence in MariaDB
- Built-in submissions view + CSV export (wide + facts)
- Workspace DB target testing and activation API for customer-provided MariaDB

## Tech stack

- Next.js App Router
- TypeScript
- MariaDB/MySQL via `mysql2`
- Vitest for core engine/schema tests

## Environment variables

```bash
APP_DATABASE_URL=mysql://user:password@host:3306/treeforms_app
SUBMISSION_DATABASE_URL=mysql://user:password@host:3306/treeforms_submissions
DEFAULT_WORKSPACE_ID=workspace_demo
DEFAULT_WORKSPACE_NAME=Demo Workspace
CREDENTIAL_ENCRYPTION_KEY=replace-with-32-plus-char-secret
```

`SUBMISSION_DATABASE_URL` is optional; it falls back to `APP_DATABASE_URL`.

If `APP_DATABASE_URL` is not set, Treeforms now runs in an in-memory dev mode for forms/drafts/versions/sessions so local builder flows can be tested without a database. Submission export/persistence will also stay in-memory unless a submission DB is configured.

## Run

```bash
npm install
# optional: cp .env.example .env.local
npm run dev
```

Open:

- `http://localhost:3000/builder`

## API surface

Implemented endpoints:

- `POST /api/forms`
- `GET /api/forms`
- `GET /api/forms/:formId`
- `PUT /api/forms/:formId/draft`
- `POST /api/forms/:formId/publish`
- `GET /api/forms/:formId/versions`
- `GET /api/forms/:formId/submissions`
- `GET /api/forms/:formId/submissions/export.csv`
- `POST /api/public/forms/:slug/:version/start`
- `POST /api/public/sessions/:sessionToken/answer`
- `POST /api/public/sessions/:sessionToken/navigate`
- `POST /api/public/sessions/:sessionToken/complete`
- `POST /api/workspaces/:workspaceId/db-target/test`
- `PUT /api/workspaces/:workspaceId/db-target`

## Notes

- This MVP intentionally limits branching logic to option-driven flow.
- Question reuse across flows is disabled by design.
- Submission analytics merge platform and active external DB target data by `submission_id`.
