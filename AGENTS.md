# AGENTS.md

Guidance for agentic coding tools working in `/Users/tension/CodexPlayground/treeforms`.

## Rule Sources

- This file is the primary agent guide for the repository.
- No Cursor rules were found in `.cursor/rules/`.
- No `.cursorrules` file was found.
- No Copilot rules were found in `.github/copilot-instructions.md`.
- If any of those files are added later, merge their instructions into this document.

## Project Snapshot

- TreeForms is a single Next.js App Router app written in strict TypeScript.
- The product is a branch-first form builder with an authenticated builder UI and a public runtime.
- Core domains live in `lib/`, server routes in `app/api/`, UI in `app/` and `components/`, and tests in `test/`.
- Storage supports SQLite via `better-sqlite3` and MySQL/MariaDB via `mysql2`.
- Zod is the validation layer, and Vitest is the test runner.

## Setup And Commands

```bash
# Install
npm install

# Local development
npm run dev

# Production build and start
npm run build
npm run start

# Type checking / lint gate
npm run typecheck
npm run lint

# Full test suite
npm run test
npm run test:watch

# Run a single test file
npx vitest run test/schema.test.ts
npx vitest run test/http.test.ts

# Run a single test by name
npx vitest run -t "accepts a valid branching schema"
npx vitest run test/http.test.ts -t "parses valid streamed JSON payloads"

# Extra debugging
npx vitest run --reporter=verbose
```

## CI Expectations

- CI runs on Node 20.
- The check order is `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- `npm run lint` is currently an alias for `npm run typecheck`; there is no separate ESLint config.
- Before finishing a meaningful change, run the narrowest relevant check first, then broader coverage if needed.

## Repository Map

- `app/`: App Router pages, layouts, and API routes.
- `app/api/`: auth, forms, public runtime, and settings endpoints.
- `components/`: builder, runtime, analytics, auth, and settings UI.
- `lib/`: schema engine, auth, validation, security, DB/storage, and utilities.
- `test/`: Vitest coverage for schema, engine, auth, HTTP helpers, and security hardening.

## Formatting Conventions

- Match the existing style in nearby files; no Prettier config is checked in.
- Use 2-space indentation, semicolons, and double quotes.
- Keep lines readable; split long argument lists, objects, and JSX props like nearby code.
- Add blank lines between imports, constants, exported declarations, and helper sections.
- Prefer consistency with the edited file over personal style preferences.

## Imports And Types

- Order imports as framework/external packages, blank line, then internal `@/` imports.
- Keep side-effect imports such as `import "./globals.css";` separate.
- Prefer the `@/` alias over deep relative paths.
- Import types explicitly with `import type` or `type` specifiers when practical.
- `strict` mode is enabled; satisfy it without workarounds.
- Avoid `any`; prefer `unknown`, generics, discriminated unions, and narrowing helpers.
- Prefer `interface` for domain objects and props, and `type` for unions or composed aliases.
- Export named functions for reusable module APIs; use arrow functions for short local helpers and callbacks.

## Naming And Style

- Use `PascalCase` for components and domain types, `camelCase` for functions and variables, and `SCREAMING_SNAKE_CASE` for constants.
- Route handler exports must use Next.js names like `GET`, `POST`, `PUT`, and `DELETE`.
- Keep names domain-specific: `workspaceId`, `formId`, `questionId`, `versionNumber`, `resumeToken`.
- Prefer early returns, explicit conditionals, and small pure helpers over deeply nested logic.
- Prefer immutable updates with spread syntax and non-mutating array helpers unless local mutation is clearly simpler.

## React And Routes

- Add `"use client";` only when hooks, browser APIs, or client interactivity are required.
- Keep server-capable modules free of client-only imports.
- Use App Router route handlers in `route.ts` files.
- Keep page components and layouts small; move heavier behavior into `components/` or `lib/`.
- In client components, handle loading, submitting, success, and error states explicitly.
- Follow existing fetch patterns that parse JSON once and surface `payload.error ?? fallbackMessage`.
- Read `app/api/forms/route.ts` as the baseline pattern for authenticated admin routes.
- Resolve the admin workspace through `workspaceIdFromRequest()` instead of re-reading cookies manually.

## Validation And Errors

- Put reusable request schemas in `lib/server/validation.ts`.
- Use Zod for external input validation, and trim user-facing strings unless whitespace is intentionally meaningful.
- Use `z.coerce.number()` for query params or form-like numeric input when coercion is desired.
- Wrap route bodies in `try/catch` and return `handleRouteError("context message", error)` on failure.
- Prefer `jsonOk()` and `jsonError()` from `lib/server/http.ts` over ad hoc JSON responses.
- Use `readJson<T>()` for bounded JSON parsing instead of raw `request.json()` where request bodies need limits.
- Use `HttpError` for expected failures, and log unexpected failures with context via `console.error("Meaningful message", error);`.

## Security And Data

- Treat builder and settings routes as authenticated admin surfaces.
- Enforce CSRF on state-changing admin routes with `enforceCsrf(request)`.
- Apply rate limiting at public and admin write endpoints using `applyRateLimit()`.
- Never log passwords, tokens, raw credentials, or encryption keys.
- Respect the `TRUST_X_FORWARDED_FOR` guard when handling forwarded IP headers.
- Keep storage logic in `lib/db/` and `lib/db/storage/`, and use parameterized queries only.
- Preserve current transaction-oriented patterns and keep SQLite and MySQL behavior aligned where possible.

## Testing Conventions

- Test files live in `test/**/*.test.ts`.
- Import Vitest APIs from `vitest` explicitly.
- Use descriptive test names that state behavior, not implementation details.
- Prefer small local factories like `validSchema()` for readable setup.
- Cover both happy paths and failure cases, especially around validation, auth, branching, and HTTP boundaries.
- For env-sensitive modules, mirror the existing pattern that resets modules and safely rewrites `process.env`.

## Environment Notes

- Copy `.env.example` for local setup if needed.
- Required non-test secrets include `CREDENTIAL_ENCRYPTION_KEY`, `ADMIN_LOGIN_PASSWORD`, and `ADMIN_SESSION_SECRET`.
- Do not commit `.env` files or secret material.
- Access environment values through `process.env` or the existing constants/helpers.
- Preserve the test fallbacks in `lib/server/constants.ts` unless you intentionally change test behavior.

## Practical Agent Tips

- Start by reading the closest existing implementation and follow local conventions.
- Prefer surgical changes over broad refactors unless the task explicitly calls for larger redesign work.
- When editing API or storage code, check whether a matching test file already exists and extend it.
- Keep new routes, helpers, and response shapes consistent with the existing auth, forms, and settings code.
- If new Cursor or Copilot rule files appear later, update this document so agents have one canonical summary.
