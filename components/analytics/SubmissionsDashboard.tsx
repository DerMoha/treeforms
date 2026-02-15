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
  
  // Modal state
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<SubmissionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    return params.toString();
  }, [status, version, branchContains, page, pageSize]);

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

  async function loadSubmissionDetail(submissionId: string) {
    setDetailLoading(true);
    setDetailError(null);

    try {
      const response = await fetch(
        `/api/forms/${formId}/submissions/${submissionId}`,
        { cache: "no-store" }
      );

      const payload = (await response.json()) as SubmissionDetailResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load submission details");
      }

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
                          {row.completedAt ? formatDate(row.completedAt) : "-"}
                        </td>
                        <td>
                          {row.branchTrace.length ? (
                            <span className="branch-trace" title={row.branchTrace.join(" > ")}>
                              {row.branchTrace.join(" > ")}
                            </span>
                          ) : (
                            "-"
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
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                
                <span className="helper-text">
                  Page {page} of {totalPages}
                </span>
                
                <button
                  className="button-secondary"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                Submission #{submissions?.items.findIndex(s => s.submissionId === selectedSubmissionId) !== undefined 
                  ? startItem + submissions!.items.findIndex(s => s.submissionId === selectedSubmissionId)
                  : selectedSubmissionId}
              </h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <div className="modal-content">
              {detailLoading ? (
                <p className="state-text">Loading submission details...</p>
              ) : detailError ? (
                <p className="state-text error">{detailError}</p>
              ) : submissionDetail ? (
                <div className="submission-detail">
                  {/* Status & Metadata */}
                  <div className="detail-section">
                    <div className="detail-header">
                      <span className={formatStatus(submissionDetail.status).className}>
                        {formatStatus(submissionDetail.status).text}
                      </span>
                      <span className="helper-text">Version {submissionDetail.versionNumber}</span>
                    </div>
                  </div>

                  {/* Branch Path */}
                  {submissionDetail.branchTraceReadable.length > 0 && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Branch Path</h3>
                      <div className="branch-path-flow">
                        {submissionDetail.branchTraceReadable.map((step, idx) => (
                          <span key={idx} className="branch-step">
                            {step}
                            {idx < submissionDetail.branchTraceReadable.length - 1 && (
                              <span className="branch-arrow">→</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Answers Grouped by Flow */}
                  {submissionDetail.groupedAnswers.length > 0 && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Answers</h3>
                      {submissionDetail.groupedAnswers.map((group, groupIdx) => (
                        <div key={groupIdx} className="answer-group">
                          <h4 className="answer-group-title">{group.groupName}</h4>
                          <div className="answer-list">
                            {group.answers.map((answer, answerIdx) => (
                              <div key={answerIdx} className="answer-item">
                                <span className="answer-question">{answer.questionLabel}</span>
                                <span className="answer-value">{answer.answer}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Metadata Footer */}
                  <div className="detail-footer">
                    <div className="detail-meta">
                      <span className="helper-text">Source: {submissionDetail.source}</span>
                      <span className="helper-text">Started: {formatDate(submissionDetail.startedAt)}</span>
                      {submissionDetail.completedAt && (
                        <span className="helper-text">Completed: {formatDate(submissionDetail.completedAt)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .table-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .pagination-row {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 16px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
        }
        
        .submission-row:hover {
          background-color: #f9fafb;
        }
        
        .branch-trace {
          display: inline-block;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .badge-success {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
          background-color: #dcfce7;
          color: #166534;
        }
        
        .badge-warning {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
          background-color: #fef3c7;
          color: #92400e;
        }
        
        .modal-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          padding: 16px;
        }
        
        .modal-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          max-width: 700px;
          width: 100%;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .modal-title {
          font-size: 20px;
          font-weight: 600;
          margin: 0;
          color: #111827;
        }
        
        .modal-close {
          background: none;
          border: none;
          font-size: 28px;
          color: #6b7280;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: all 0.15s;
        }
        
        .modal-close:hover {
          background-color: #f3f4f6;
          color: #374151;
        }
        
        .modal-content {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }
        
        .submission-detail {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .detail-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .detail-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .detail-section-title {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        
        .branch-path-flow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 16px;
          background-color: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        
        .branch-step {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #374151;
          font-weight: 500;
        }
        
        .branch-arrow {
          color: #9ca3af;
          font-size: 16px;
        }
        
        .answer-group {
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .answer-group-title {
          font-size: 13px;
          font-weight: 600;
          color: #6b7280;
          margin: 0;
          padding: 10px 16px;
          background-color: #f3f4f6;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .answer-list {
          padding: 8px 0;
        }
        
        .answer-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 10px 16px;
          gap: 16px;
        }
        
        .answer-item:not(:last-child) {
          border-bottom: 1px solid #e5e7eb;
        }
        
        .answer-question {
          font-size: 14px;
          color: #374151;
          font-weight: 500;
          flex: 1;
        }
        
        .answer-value {
          font-size: 14px;
          color: #111827;
          font-weight: 600;
          text-align: right;
          max-width: 60%;
        }
        
        .detail-footer {
          border-top: 1px solid #e5e7eb;
          padding-top: 16px;
          margin-top: 8px;
        }
        
        .detail-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }
      `}</style>
    </main>
  );
}
