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
- One configurable persistence backend for all app and submission data
- Built-in submissions view + CSV export (wide + facts)

## Tech stack

- Next.js App Router
- TypeScript
- MariaDB/MySQL via `mysql2`
- SQLite via `better-sqlite3`
- Vitest for core engine/schema tests

## Environment variables

```bash
LOCAL_SQLITE_PATH=.data/treeforms.sqlite
DEFAULT_WORKSPACE_ID=workspace_demo
DEFAULT_WORKSPACE_NAME=Demo Workspace
CREDENTIAL_ENCRYPTION_KEY=replace-with-32-plus-char-secret
ADMIN_LOGIN_PASSWORD=replace-with-strong-admin-password
ADMIN_SESSION_SECRET=replace-with-32-plus-char-session-secret
# Optional:
ADMIN_SESSION_TTL_SECONDS=28800
RESPONDENT_SESSION_TTL_SECONDS=86400
PUBLIC_API_CORS_ORIGINS=https://admin.example.com
TRUST_X_FORWARDED_FOR=0
```

`LOCAL_SQLITE_PATH` is optional and seeds the default local SQLite file for a fresh install.

`CREDENTIAL_ENCRYPTION_KEY`, `ADMIN_LOGIN_PASSWORD`, and `ADMIN_SESSION_SECRET` are required in non-test environments.

`TRUST_X_FORWARDED_FOR` defaults to `0`. Set it to `1` only when running behind a trusted proxy that correctly sets `x-forwarded-for`.

TreeForms now always uses one real database backend selected from the Settings tab. Fresh installs default to local SQLite, and you can switch the app to MySQL from `/builder/settings/database`.

## Run

```bash
npm install
# optional: cp .env.example .env.local
npm run dev
```

Open:

- `http://localhost:3000/builder`

## Deploy with Docker Compose

This repository includes a production-style Docker setup:

- `app`: Next.js production server
- `db`: MariaDB 11.4 with persisted storage (`db_data` volume)

### 1) First deployment

```bash
cp .env.docker.example .env.docker
```

Edit `.env.docker` and set strong secrets:

- `MARIADB_PASSWORD`
- `MARIADB_ROOT_PASSWORD`
- `CREDENTIAL_ENCRYPTION_KEY` (32+ chars)

Start the stack in the background:

```bash
docker compose --env-file .env.docker up --build -d
```

If port `3000` is already in use, choose another port:

```bash
APP_PORT=3001 docker compose --env-file .env.docker up --build -d
```

### 2) Verify deployment

```bash
docker compose --env-file .env.docker ps
curl -i http://127.0.0.1:3000/api/forms
```

Open:

- `http://localhost:3000/builder`

If you used `APP_PORT=3001`, open `http://localhost:3001/builder`.

### 3) Deploy updates

From the project directory after pulling new code:

```bash
docker compose --env-file .env.docker up --build -d
```

### 4) Operations

View logs:

```bash
docker compose --env-file .env.docker logs -f app db
```

Stop services:

```bash
docker compose --env-file .env.docker down
```

Stop and remove volumes (deletes DB data):

```bash
docker compose --env-file .env.docker down -v
```

## API surface

Implemented endpoints:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/forms`
- `GET /api/forms`
- `POST /api/forms/import`
- `GET /api/forms/:formId`
- `PUT /api/forms/:formId/draft`
- `POST /api/forms/:formId/draft/import`
- `GET /api/forms/:formId/draft/export.json`
- `POST /api/forms/:formId/publish`
- `GET /api/forms/:formId/versions`
- `GET /api/forms/:formId/submissions`
- `GET /api/forms/:formId/submissions/export.csv`
- `GET /api/settings/database`
- `PUT /api/settings/database`
- `POST /api/settings/database/test`
- `POST /api/public/forms/:slug/:version/start`
- `POST /api/public/sessions/:sessionToken/answer`
- `POST /api/public/sessions/:sessionToken/navigate`
- `POST /api/public/sessions/:sessionToken/complete`

Builder and workspace API routes now require an admin session cookie. Public runtime routes (`/f/*` and `/api/public/*`) remain publicly accessible.

## Form JSON import/export

Treeforms supports importing and exporting full form drafts as raw JSON `FormSchema` objects.

- Export current draft: `GET /api/forms/:formId/draft/export.json`
- Replace current draft from JSON: `POST /api/forms/:formId/draft/import`
- Create a new form from JSON: `POST /api/forms/import`

Expected JSON shape:

```json
{
  "schemaVersion": 1,
  "formId": "form_xxx",
  "title": "Customer Intake",
  "mainFlow": {
    "flowId": "flow_main",
    "questions": [
      {
        "questionId": "q1",
        "type": "radio",
        "label": "What do you need help with?",
        "required": true,
        "options": [
          {
            "optionId": "opt_a",
            "label": "Onboarding",
            "value": "Onboarding"
          }
        ]
      }
    ]
  }
}
```

Import applies light normalization for AI-generated payloads (missing ids, blank title, missing option values), then runs schema validation.

## Notes

- This MVP intentionally limits branching logic to option-driven flow.
- Question reuse across flows is disabled by design.
- SQLite and MySQL use the same relational schema and store both builder data and submissions.
