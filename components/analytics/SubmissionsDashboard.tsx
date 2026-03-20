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

interface SubmissionDetailResponse {
  submissionId: string;
  status: "completed" | "in_progress";
  versionNumber: number;
  startedAt: string;
  completedAt: string | null;
  source: string;
  branchTrace: string[];
  branchTraceReadable: string[];
  groupedAnswers: Array<{
    groupName: string;
    answers: Array<{
      questionLabel: string;
      answer: string;
    }>;
  }>;
}

interface SubmissionSummaryResponse {
  generatedAt: string;
  selectedVersion: number | null;
  availableVersions: Array<{
    versionNumber: number;
    publishedAt: string;
  }>;
  overview: {
    total: number;
    completed: number;
    inProgress: number;
    completionRate: number;
  };
  questions: QuestionSummary[];
  flows: FlowSummary;
}

interface QuestionSummary {
  questionId: string;
  questionLabel: string;
  questionType: "radio" | "checkbox" | "text" | "number";
  respondents: number;
  answers: AnswerSummary[];
}

interface AnswerSummary {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

interface FlowSummary {
  topPaths: PathSummary[];
  topBranches: BranchSummary[];
}

interface PathSummary {
  pathKey: string;
  pathLabel: string[];
  count: number;
  percentage: number;
}

interface BranchSummary {
  branchKey: string;
  branchLabel: string;
  count: number;
  percentage: number;
}

interface ModalStep {
  kind: "status" | "path" | "answer-group";
  title: string;
  content?: string;
  items?: string[];
}

export function SubmissionsDashboard({ formId }: { formId: string }) {
  const [title, setTitle] = useState("Form");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState("");
  const [branchContains, setBranchContains] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [submissions, setSubmissions] = useState<SubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<SubmissionSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<SubmissionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (version) params.set("version", version);
    if (branchContains) params.set("branchContains", branchContains);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params.toString();
  }, [status, version, branchContains, page, pageSize]);

  const summaryQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (version) params.set("version", version);
    return params.toString();
  }, [status, version]);

  useEffect(() => {
    void loadForm();
  }, [formId]);

  useEffect(() => {
    void loadSubmissions();
  }, [formId, queryString]);

  useEffect(() => {
    void loadSummary();
  }, [formId, summaryQueryString]);

  async function loadForm() {
    try {
      const response = await fetch(`/api/forms/${formId}`, { cache: "no-store" });
      const payload = (await response.json()) as FormResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load form");
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
      if (!response.ok) throw new Error(payload.error ?? "Unable to load submissions");
      setSubmissions(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load submissions");
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const response = await fetch(
        `/api/forms/${formId}/submissions/summary${summaryQueryString ? `?${summaryQueryString}` : ""}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as SubmissionSummaryResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load summary");
      setSummary(payload);
    } catch (reason) {
      setSummaryError(reason instanceof Error ? reason.message : "Unable to load summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function loadSubmissionDetail(submissionId: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await fetch(
        `/api/forms/${formId}/submissions/${submissionId}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as SubmissionDetailResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load submission details");
      setSubmissionDetail(payload);
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : "Unable to load submission details");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleRowClick(submissionId: string) {
    setSelectedSubmissionId(submissionId);
    void loadSubmissionDetail(submissionId);
  }

  function closeModal() {
    setSelectedSubmissionId(null);
    setSubmissionDetail(null);
    setDetailError(null);
  }

  function formatStatus(status: string): { text: string; className: string } {
    switch (status) {
      case "completed":
        return { text: "Completed", className: "badge-success" };
      case "in_progress":
        return { text: "In Progress", className: "badge-warning" };
      default:
        return { text: status, className: "badge" };
    }
  }

  function formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  }

  const totalPages = submissions ? Math.ceil(submissions.total / submissions.pageSize) : 0;
  const startItem = submissions ? (submissions.page - 1) * submissions.pageSize + 1 : 0;
  const endItem = submissions ? Math.min(startItem + submissions.items.length - 1, submissions.total) : 0;

  const submissionRowIndex = submissions?.items.findIndex(
    (s) => s.submissionId === selectedSubmissionId
  );
  const submissionRowNumber =
    submissionRowIndex !== undefined && submissionRowIndex >= 0
      ? startItem + submissionRowIndex
      : selectedSubmissionId ?? "—";

  const modalSteps: ModalStep[] = buildModalSteps(submissionDetail);

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
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In progress</option>
          </select>

          <select
            value={version}
            onChange={(event) => {
              setVersion(event.target.value);
              setPage(1);
            }}
            style={{ width: 120 }}
          >
            <option value="">Latest version</option>
            {summary?.availableVersions.map((v) => (
              <option key={v.versionNumber} value={String(v.versionNumber)}>
                v{v.versionNumber}
              </option>
            ))}
          </select>

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

      {/* Summary / Analytics Section */}
      <section className="card page-card">
        <h2 className="section-title">Results Overview</h2>

        {summaryLoading ? (
          <p className="state-text">Loading results...</p>
        ) : summaryError ? (
          <p className="state-text error">{summaryError}</p>
        ) : summary ? (
          <>
            {/* Overview Stats */}
            <div className="stats-row fade-in">
              <div className="stat-card">
                <span className="stat-number">{summary.overview.total}</span>
                <span className="stat-label">Total Responses</span>
              </div>
              <div className="stat-card">
                <span className="stat-number stat-completed">
                  {summary.overview.completed}
                </span>
                <span className="stat-label">Completed</span>
              </div>
              <div className="stat-card">
                <span className="stat-number stat-progress">
                  {summary.overview.inProgress}
                </span>
                <span className="stat-label">In Progress</span>
              </div>
              <div className="stat-card">
                <span className="stat-number stat-rate">
                  {summary.overview.completionRate}%
                </span>
                <span className="stat-label">Completion Rate</span>
              </div>
            </div>

            {/* Per-Question Results */}
            {summary.questions.length > 0 && (
              <div className="results-section">
                <h3 className="results-section-title">Answer Distribution</h3>
                <div className="question-list">
                  {summary.questions.map((q) => (
                    <div key={q.questionId} className="question-card">
                      <div className="question-header">
                        <span className="question-label">{q.questionLabel}</span>
                        <span className="question-meta">
                          {q.respondents} respondent{q.respondents !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="answer-bars">
                        {q.answers.map((a) => (
                          <div key={a.key} className="answer-bar-row">
                            <span className="answer-bar-label" title={a.label}>
                              {a.label}
                            </span>
                            <div className="answer-bar-track">
                              <div
                                className="answer-bar-fill"
                                style={{ width: `${a.percentage}%` }}
                              />
                            </div>
                            <span className="answer-bar-count">
                              {a.count}
                            </span>
                            <span className="answer-bar-pct">
                              {a.percentage}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flow / Path Summary */}
            {(summary.flows.topPaths.length > 0 || summary.flows.topBranches.length > 0) && (
              <div className="results-section">
                <h3 className="results-section-title">Top Branch Paths</h3>
                <div className="flow-list">
                  {summary.flows.topPaths.map((p) => (
                    <div key={p.pathKey} className="flow-card">
                      <div className="flow-card-header">
                        <span className="flow-path-label">
                          {p.pathLabel.join(" → ")}
                        </span>
                        <span className="flow-path-pct">{p.percentage}%</span>
                      </div>
                      <div className="flow-bar-track">
                        <div
                          className="flow-bar-fill"
                          style={{ width: `${p.percentage}%` }}
                        />
                      </div>
                      <span className="flow-path-count">
                        {p.count} submission{p.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.overview.total === 0 && (
              <p className="state-text helper-text">
                No submissions match the current filters.
              </p>
            )}
          </>
        ) : null}
      </section>

      {/* Submissions Table */}
      <section className="card page-card">
        {loading ? <p className="state-text">Loading submissions...</p> : null}
        {error ? <p className="state-text error">{error}</p> : null}

        {!loading && submissions ? (
          <>
            <div className="table-header-row">
              <p className="helper-text">
                Showing {startItem}-{endItem} of {submissions.total} submissions
              </p>

              <div className="inline-stack align-center">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  style={{ width: 100 }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="helper-text">per page</span>
              </div>
            </div>

            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Branch Trace</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.items.map((row, index) => {
                    const statusBadge = formatStatus(row.status);
                    const rowNumber = startItem + index;

                    return (
                      <tr
                        key={row.submissionId}
                        onClick={() => handleRowClick(row.submissionId)}
                        style={{ cursor: "pointer" }}
                        className="submission-row"
                      >
                        <td>{rowNumber}</td>
                        <td>
                          <span className={statusBadge.className}>{statusBadge.text}</span>
                        </td>
                        <td>v{row.versionNumber}</td>
                        <td>{formatDate(row.startedAt)}</td>
                        <td>
                          {row.completedAt ? formatDate(row.completedAt) : "—"}
                        </td>
                        <td>
                          {row.branchTrace.length ? (
                            <span className="branch-trace" title={row.branchTrace.join(" > ")}>
                              {row.branchTrace.join(" > ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{row.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination-row">
                <button
                  className="button-secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </button>

                <span className="helper-text">
                  Page {page} of {totalPages}
                </span>

                <button
                  className="button-secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : null}
      </section>

      {/* Detail Modal */}
      {selectedSubmissionId && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-container modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Submission #{submissionRowNumber}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            <div className="modal-content">
              {detailLoading ? (
                <p className="state-text">Loading submission details...</p>
              ) : detailError ? (
                <p className="state-text error">{detailError}</p>
              ) : submissionDetail && modalSteps.length > 0 ? (
                <div className="submission-flow">
                  {modalSteps.map((step, idx) => (
                    <div key={idx} className="flow-step">
                      <div className="flow-step-marker">
                        <div className="flow-step-dot" />
                        {idx < modalSteps.length - 1 && <div className="flow-step-line" />}
                      </div>
                      <div className="flow-step-content">
                        <span className="flow-step-title">{step.title}</span>
                        {step.kind === "path" && step.items && (
                          <div className="flow-step-path">
                            {step.items.map((item, i) => (
                              <span key={i} className="flow-step-node">
                                {item}
                                {i < step.items!.length - 1 && (
                                  <span className="flow-step-arrow">→</span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        {step.kind === "answer-group" && step.items && (
                          <div className="flow-step-answers">
                            {step.items.map((item, i) => (
                              <div key={i} className="flow-step-answer">
                                {item}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

function buildModalSteps(detail: SubmissionDetailResponse | null): ModalStep[] {
  if (!detail) return [];

  const steps: ModalStep[] = [];

  steps.push({
    kind: "status",
    title: "Status",
    content: detail.status === "completed" ? "Completed" : "In Progress"
  });

  if (detail.branchTraceReadable.length > 0) {
    steps.push({
      kind: "path",
      title: "Path",
      items: detail.branchTraceReadable
    });
  }

  for (const group of detail.groupedAnswers) {
    const answerLines = group.answers.map(
      (a) => `${a.questionLabel}: ${a.answer}`
    );
    steps.push({
      kind: "answer-group",
      title: group.groupName,
      items: answerLines
    });
  }

  return steps;
}
