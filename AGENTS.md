# Agent Guidelines for TreeForms

This document provides guidance for AI agents working on the TreeForms codebase.

## Project Overview

TreeForms is a Next.js-based form builder platform that supports branching logic. It's a TypeScript monorepo using modern React patterns and the App Router.

## Build/Lint/Test Commands

```bash
# Development
npm run dev              # Start development server (Next.js)
npm run build            # Build production application
npm run start            # Start production server

# Type checking & Linting
npm run typecheck        # Run TypeScript type checking (next typegen + tsc)
npm run lint             # Alias for typecheck

# Testing
npm run test             # Run all tests once (vitest run)
npm run test:watch       # Run tests in watch mode

# Single test execution
npx vitest run test/schema.test.ts                    # Run specific file
npx vitest run -t "accepts a valid branching schema"  # Run by test name
npx vitest run --reporter=verbose                     # Run with verbose output
```

## Code Style Guidelines

### TypeScript

- **Strict mode**: Always enabled. No `any` types unless absolutely necessary.
- **Path alias**: Use `@/` prefix for imports from project root (e.g., `@/lib/types`).
- **Type imports**: Use `import { type Foo }` when importing types only.
- **Interfaces vs Types**: Prefer `interface` for object shapes, `type` for unions/complex types.
- **Naming**: PascalCase for types/interfaces, camelCase for functions/variables.

### Functions

- Use function declarations for module exports: `export function foo(): Bar`
- Use arrow functions for callbacks and inline handlers
- Early returns to reduce nesting
- Async/await for asynchronous code (no raw promises)
- Type guards with `value is Type` return type

### Imports

```typescript
// Order: 1) External deps, 2) Internal modules, 3) Type imports
default
import { z } from "zod";
import { NextRequest } from "next/server";

import { HttpError } from "@/lib/server/http";
import { type FormSchema } from "@/lib/types";
```

### Error Handling

- Use custom error classes extending Error (see `HttpError`, `RuntimeValidationError`)
- Set error.name for instanceof checks
- API routes: Return structured error response `{ error: string, details: unknown | null }`
- Always console.error with context before returning 500
- Expose error details for 5xx only in non-production environments

```typescript
try {
  // ... operation
} catch (error) {
  if (error instanceof HttpError) {
    return errorResponse(error.message, error.details, error.status);
  }
  console.error("Failed to do something:", error);
  return errorResponse("Something went wrong", null, 500);
}
```

### API Routes (Next.js App Router)

- File: `route.ts` in directory structure matching the API path
- Named exports: `POST`, `GET`, `PUT`, `DELETE`, etc.
- Always apply rate limiting at entry points
- Validate input with Zod schemas
- Use `errorResponse()` helper for consistent error format

```typescript
export async function POST(request: NextRequest) {
  await applyRateLimit(request);
  
  const body = await request.json();
  const parsed = schema.safeParse(body);
  
  if (!parsed.success) {
    return errorResponse("Invalid input", parsed.error.errors, 400);
  }
  
  // ... handle request
  return Response.json({ data: result });
}
```

### Validation

- Use Zod for all input validation
- Define schemas in `lib/server/validation.ts` for reusability
- Coerce types when needed (e.g., `z.coerce.number()`)
- Add `.trim()` to string validators
- Use descriptive error messages

### Testing

- Test files: `test/**/*.test.ts`
- Use Vitest with globals enabled
- Descriptive test names explaining the behavior
- Use factories/helpers for test data (see `validSchema()` pattern)
- Assert on both happy paths and error cases

```typescript
import { describe, expect, it } from "vitest";
import { someFunction } from "@/lib/module";

describe("someFunction", () => {
  it("returns expected result for valid input", () => {
    const result = someFunction("input");
    expect(result).toBe("expected");
  });
});
```

### Database

- Use better-sqlite3 for local/dev, mysql2 for production
- Store module in `lib/db/`
- Parameterized queries only (never string concatenation)
- Connection pooling for production databases

### Security

- Always validate and sanitize inputs
- Apply rate limiting to all public endpoints
- CSRF protection on state-changing operations
- Use crypto module for secure random generation
- Store passwords with bcrypt hashing
- Never log sensitive data (passwords, tokens)

### General Patterns

- Pure functions preferred over mutations
- Immutable updates using spread operator
- Nullish coalescing (`??`) for defaults
- Optional chaining (`?.`) for safe access
- Destructuring for cleaner code
- Meaningful variable names (avoid single letters except in loops)

## Project Structure

```
app/              # Next.js App Router pages and API routes
  api/            # API route handlers
    [feature]/    # Feature-based organization
  layout.tsx      # Root layout
  page.tsx        # Root page
components/       # React components
lib/              # Core library code
  server/         # Server-side utilities
  db/             # Database layer
  client/         # Client-side utilities
  security/       # Security utilities
test/             # Test files
```

## Environment Variables

- Copy `.env.example` to `.env` for local development
- Never commit `.env` files
- Validate env vars at startup (fail fast pattern)
- Use `process.env` directly, don't destructure

## Database Migrations

The application uses SQLite with automatic schema initialization on startup. No manual migrations needed for local development.
