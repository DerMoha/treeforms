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
    <main className="container page-stack">
      <section className="card page-card">
        <span className="badge">Builder</span>
        <h1 className="page-card-title">Forms</h1>
        <p className="page-card-subtitle">
          Create a form, edit branch paths, publish immutable versions, and collect responses.
        </p>

        <div className="inline-stack align-center">
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

        {error ? <p className="state-text error">{error}</p> : null}
      </section>

      <section className="card page-card">
        <h2 className="section-title">Existing forms</h2>

        {loading ? <p className="state-text">Loading forms...</p> : null}

        {!loading && sortedForms.length === 0 ? (
          <p className="helper-text">
            No forms yet. Create your first branch-aware form.
          </p>
        ) : null}

        <div className="list-stack">
          {sortedForms.map((form) => (
            <article
              key={form.formId}
              className="card muted-card"
            >
              <strong>{form.title}</strong>
              <span className="mono-text">
                slug: {form.slug}
              </span>
              <span className="helper-text">
                Updated {new Date(form.updatedAt).toLocaleString()}
              </span>

              <div className="inline-stack">
                <Link
                  href={`/builder/forms/${form.formId}`}
                  className="button-secondary"
                >
                  Open Builder
                </Link>
                <Link
                  href={`/builder/forms/${form.formId}/submissions`}
                  className="button-secondary"
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
