"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { readCsrfToken } from "@/lib/client/csrf";

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
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
          "content-type": "application/json",
          "x-csrf-token": readCsrfToken()
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

  function openImportDialog() {
    importInputRef.current?.click();
  }

  async function handleImportForm(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const rawContent = await file.text();
      let parsed: unknown;

      try {
        parsed = JSON.parse(rawContent) as unknown;
      } catch {
        setError("Selected file is not valid JSON");
        return;
      }

      const response = await fetch("/api/forms/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": readCsrfToken()
        },
        body: JSON.stringify(parsed)
      });

      const payload = (await response.json()) as {
        form?: FormSummary;
        error?: string;
        details?: string[];
      };

      if (!response.ok || !payload.form) {
        throw new Error(payload.details?.[0] ?? payload.error ?? "Unable to import form");
      }

      window.location.href = `/builder/forms/${payload.form.formId}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import form");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="container page-stack">
      <section className="card page-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <span className="badge">Builder</span>
            <h1 className="page-card-title">Forms</h1>
          </div>
          <Link
            href="/builder/settings"
            className="button-secondary"
            style={{ textDecoration: "none" }}
          >
            Settings
          </Link>
        </div>
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
            {saving ? (
              <>
                <span className="spinner" />
                Creating...
              </>
            ) : (
              "Create Form"
            )}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={importing}
            onClick={openImportDialog}
          >
            {importing ? (
              <>
                <span className="spinner spinner-dark" />
                Importing...
              </>
            ) : (
              "Import Form JSON"
            )}
          </button>
        </div>

        {error ? <p className="state-text error">{error}</p> : null}
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={handleImportForm}
        />
      </section>

      <section className="card page-card">
        <h2 className="section-title">Existing forms</h2>

        {loading ? (
          <div className="list-stack">
            <div className="skeleton" style={{ height: 90 }} />
            <div className="skeleton" style={{ height: 90 }} />
          </div>
        ) : null}

        {!loading && sortedForms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🌱</div>
            <p className="empty-state-title">No forms yet</p>
            <p className="helper-text">
              Create your first branch-aware form above, or import an existing JSON schema.
            </p>
          </div>
        ) : null}

        <div className="list-stack">
          {sortedForms.map((form) => (
            <article
              key={form.formId}
              className="card muted-card hover-lift"
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
