"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface SubmissionRow {
  submissionId: string;
  status: string;
  versionNumber: number;
  startedAt: string;
  completedAt: string | null;
  branchTrace: string[];
  source: string;
}

interface SubmissionsResponse {
  page: number;
  pageSize: number;
  total: number;
  items: SubmissionRow[];
}

interface FormResponse {
  form: {
    title: string;
    slug: string;
  };
}

export function SubmissionsDashboard({ formId }: { formId: string }) {
  const [title, setTitle] = useState("Form");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState("");
  const [branchContains, setBranchContains] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status) {
      params.set("status", status);
    }
    if (version) {
      params.set("version", version);
    }
    if (branchContains) {
      params.set("branchContains", branchContains);
    }

    return params.toString();
  }, [status, version, branchContains]);

  useEffect(() => {
    void loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  useEffect(() => {
    void loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, queryString]);

  async function loadForm() {
    try {
      const response = await fetch(`/api/forms/${formId}`, { cache: "no-store" });
      const payload = (await response.json()) as FormResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load form");
      }

      setTitle(payload.form.title);
      setSlug(payload.form.slug);
    } catch {
      // ignore metadata failures
    }
  }

  async function loadSubmissions() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/forms/${formId}/submissions${queryString ? `?${queryString}` : ""}`,
        { cache: "no-store" }
      );

      const payload = (await response.json()) as SubmissionsResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load submissions");
      }

      setSubmissions(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load submissions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container page-stack">
      <section className="card page-card">
        <div className="inline-stack">
          <Link href={`/builder/forms/${formId}`} className="button-secondary">
            Back to Builder
          </Link>
          <span className="badge">Submissions</span>
        </div>

        <h1 className="page-card-title">{title}</h1>
        {slug ? <p className="helper-text">slug: {slug}</p> : null}

        <div className="inline-stack align-center">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Any status</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In progress</option>
          </select>

          <input
            placeholder="Version"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            style={{ width: 120 }}
          />

          <input
            placeholder="Branch contains"
            value={branchContains}
            onChange={(event) => setBranchContains(event.target.value)}
            style={{ minWidth: 220 }}
          />
        </div>

        <div className="inline-stack">
          <a
            href={`/api/forms/${formId}/submissions/export.csv`}
            className="button-secondary"
          >
            Export Wide CSV
          </a>
          <a
            href={`/api/forms/${formId}/submissions/export.csv?mode=facts`}
            className="button-secondary"
          >
            Export Facts CSV
          </a>
        </div>
      </section>

      <section className="card page-card">
        {loading ? <p className="state-text">Loading submissions...</p> : null}
        {error ? <p className="state-text error">{error}</p> : null}

        {!loading && submissions ? (
          <>
            <p className="helper-text">
              {submissions.total} total submissions
            </p>

            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Submission</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Branch Trace</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.items.map((row) => (
                    <tr key={row.submissionId}>
                      <td>
                        <code>{row.submissionId}</code>
                      </td>
                      <td>{row.status}</td>
                      <td>v{row.versionNumber}</td>
                      <td>
                        {new Date(row.startedAt).toLocaleString()}
                      </td>
                      <td>
                        {row.completedAt ? new Date(row.completedAt).toLocaleString() : "-"}
                      </td>
                      <td>
                        {row.branchTrace.length ? row.branchTrace.join(" > ") : "-"}
                      </td>
                      <td>{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
