"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface FormSummary {
  formId: string;
  slug: string;
  title: string;
  updatedAt: string;
}

export function BuilderHome() {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [title, setTitle] = useState("New Branching Form");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedForms = useMemo(
    () => [...forms].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [forms]
  );

  useEffect(() => {
    void loadForms();
  }, []);

  async function loadForms() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/forms", { cache: "no-store" });
      const payload = (await response.json()) as { forms?: FormSummary[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load forms");
      }

      setForms(payload.forms ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load forms");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateForm() {
    if (!title.trim()) {
      setError("Please provide a form title");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/forms", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ title: title.trim() })
      });

      const payload = (await response.json()) as {
        form?: FormSummary;
        error?: string;
      };

      if (!response.ok || !payload.form) {
        throw new Error(payload.error ?? "Unable to create form");
      }

      window.location.href = `/builder/forms/${payload.form.formId}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create form");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container" style={{ display: "grid", gap: "1rem" }}>
      <section className="card" style={{ padding: "1.4rem", display: "grid", gap: "1rem" }}>
        <span className="badge">Builder</span>
        <h1 style={{ margin: 0, fontSize: "1.8rem" }}>Forms</h1>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>
          Create a form, edit branch paths, publish immutable versions, and collect responses.
        </p>

        <div className="inline-stack" style={{ alignItems: "center" }}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Form title"
            style={{ minWidth: 260, flex: "1 1 280px" }}
          />
          <button
            type="button"
            className="button-primary"
            disabled={saving}
            onClick={handleCreateForm}
          >
            {saving ? "Creating..." : "Create Form"}
          </button>
        </div>

        {error ? <p style={{ margin: 0, color: "var(--danger)" }}>{error}</p> : null}
      </section>

      <section className="card" style={{ padding: "1.2rem" }}>
        <h2 style={{ marginTop: 0, marginBottom: "0.8rem" }}>Existing forms</h2>

        {loading ? <p>Loading forms...</p> : null}

        {!loading && sortedForms.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-muted)" }}>
            No forms yet. Create your first branch-aware form.
          </p>
        ) : null}

        <div style={{ display: "grid", gap: "0.7rem" }}>
          {sortedForms.map((form) => (
            <article
              key={form.formId}
              className="card"
              style={{
                padding: "0.9rem",
                background: "var(--surface-strong)",
                display: "grid",
                gap: "0.35rem"
              }}
            >
              <strong>{form.title}</strong>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.84rem", color: "#38524f" }}>
                slug: {form.slug}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>
                Updated {new Date(form.updatedAt).toLocaleString()}
              </span>

              <div className="inline-stack">
                <Link
                  href={`/builder/forms/${form.formId}`}
                  className="button-secondary"
                  style={{ textDecoration: "none" }}
                >
                  Open Builder
                </Link>
                <Link
                  href={`/builder/forms/${form.formId}/submissions`}
                  className="button-secondary"
                  style={{ textDecoration: "none" }}
                >
                  View Submissions
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
