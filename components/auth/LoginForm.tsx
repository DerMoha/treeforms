"use client";

import { useState } from "react";

interface LoginFormProps {
  nextPath: string;
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          password,
          next: nextPath
        })
      });

      const payload = (await response.json()) as { error?: string; next?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to login");
      }

      window.location.href = payload.next || nextPath;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card page-card" onSubmit={onSubmit}>
      <span className="badge">Admin Login</span>
      <h1 className="page-card-title">Sign in to Treeforms Builder</h1>
      <p className="page-card-subtitle">
        Enter the shared admin password to access builder and workspace APIs.
      </p>

      <label className="field">
        <span className="field-label">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? <p className="state-text error">{error}</p> : null}

      <div className="inline-stack">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </form>
  );
}
