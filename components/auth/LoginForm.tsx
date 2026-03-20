"use client";

import { useState } from "react";

interface LoginFormProps {
  nextPath: string;
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

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
      const message = reason instanceof Error ? reason.message : "Unable to login";
      setError(message);
      setShakeKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      key={shakeKey}
      className="card page-card scale-in"
      onSubmit={onSubmit}
      noValidate
    >
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
          style={{ width: "100%" }}
        />
      </label>

      {error ? (
        <p className="state-text error shake">{error}</p>
      ) : null}

      <div className="inline-stack">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </div>
    </form>
  );
}
