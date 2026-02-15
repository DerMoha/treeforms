"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { type AnswerValue, type QuestionNode, type StoredAnswer } from "@/lib/types";

interface RuntimePayload {
  sessionToken: string;
  resumeToken: string;
  status: "in_progress" | "completed";
  currentQuestion: {
    question: QuestionNode;
    flowPath: string[];
    flowBreadcrumbs: Array<{
      questionId: string;
      questionLabel: string;
      optionId: string;
      optionLabel: string;
    }>;
    index: number;
  } | null;
  answeredCount: number;
  totalCount: number;
  branchTrace: string[];
  branchTraceLabels?: string[];
  answers: Record<string, StoredAnswer>;
}

interface StartResponse {
  schema: {
    title: string;
    versionNumber: number;
  };
  runtime: RuntimePayload;
}

interface Props {
  slug: string;
  version: string;
  resumeTokenFromQuery?: string;
}

export function PublicFormRunner({ slug, version, resumeTokenFromQuery }: Props) {
  const [title, setTitle] = useState("Loading form...");
  const [runtime, setRuntime] = useState<RuntimePayload | null>(null);
  const [draft, setDraft] = useState<AnswerValue | "">("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishedSubmissionId, setFinishedSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    void startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, version, resumeTokenFromQuery]);

  useEffect(() => {
    if (!runtime?.currentQuestion) {
      setDraft("");
      return;
    }

    const existing = runtime.answers[runtime.currentQuestion.question.questionId]?.value;

    if (runtime.currentQuestion.question.type === "checkbox") {
      setDraft(Array.isArray(existing) ? existing : []);
      return;
    }

    if (runtime.currentQuestion.question.type === "number") {
      setDraft(typeof existing === "number" ? existing : "");
      return;
    }

    setDraft(typeof existing === "string" ? existing : "");
  }, [runtime]);

  const progressText = useMemo(() => {
    if (!runtime) {
      return "";
    }
    return `${runtime.answeredCount}/${runtime.totalCount} answered`;
  }, [runtime]);

  const resumeHref = useMemo(() => {
    if (!runtime) {
      return "";
    }

    if (typeof window !== "undefined") {
      return `${window.location.pathname}?resume=${runtime.resumeToken}`;
    }

    return `/f/${slug}/v/${version}?resume=${runtime.resumeToken}`;
  }, [runtime, slug, version]);

  async function startSession() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/forms/${slug}/${version}/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(
          resumeTokenFromQuery
            ? {
                resumeToken: resumeTokenFromQuery
              }
            : {}
        )
      });

      const payload = (await response.json()) as StartResponse & { error?: string };

      if (!response.ok || !payload.runtime) {
        throw new Error(payload.error ?? "Unable to start form session");
      }

      setTitle(payload.schema.title);
      setRuntime(payload.runtime);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start form session");
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    if (!runtime?.currentQuestion) {
      return;
    }

    const { question } = runtime.currentQuestion;
    const payloadValue = normalizeDraftForSubmission(question, draft);

    if (question.required && isEmptyValue(payloadValue, question.type)) {
      setError("This question is required.");
      return;
    }

    const submittedValue = !question.required && isEmptyValue(payloadValue, question.type)
      ? null
      : payloadValue;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/sessions/${runtime.sessionToken}/answer`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          questionId: question.questionId,
          value: submittedValue
        })
      });

      const payload = (await response.json()) as {
        runtime?: RuntimePayload;
        error?: string;
      };

      if (!response.ok || !payload.runtime) {
        throw new Error(payload.error ?? "Unable to save answer");
      }

      setRuntime(payload.runtime);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save answer");
    } finally {
      setSaving(false);
    }
  }

  async function navigate(direction: "back" | "forward") {
    if (!runtime) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/sessions/${runtime.sessionToken}/navigate`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ direction })
      });

      const payload = (await response.json()) as { runtime?: RuntimePayload; error?: string };

      if (!response.ok || !payload.runtime) {
        throw new Error(payload.error ?? "Unable to navigate");
      }

      setRuntime(payload.runtime);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to navigate");
    } finally {
      setSaving(false);
    }
  }

  async function completeSession() {
    if (!runtime) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/sessions/${runtime.sessionToken}/complete`, {
        method: "POST"
      });

      const payload = (await response.json()) as {
        completed?: boolean;
        submissionId?: string;
        error?: string;
      };

      if (!response.ok || !payload.submissionId) {
        throw new Error(payload.error ?? "Unable to complete session");
      }

      setFinishedSubmissionId(payload.submissionId);
      setRuntime({
        ...runtime,
        status: "completed",
        currentQuestion: null
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete session");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="container">
        <section className="card page-card">
          <p className="state-text">Loading form...</p>
        </section>
      </main>
    );
  }

  if (!runtime) {
    return (
      <main className="container">
        <section className="card page-card">
          <p className="state-text error">{error ?? "Could not load this form"}</p>
        </section>
      </main>
    );
  }

  const current = runtime.currentQuestion;
  const branchPathDisplay =
    runtime.branchTraceLabels && runtime.branchTraceLabels.length > 0
      ? runtime.branchTraceLabels
      : runtime.branchTrace;

  return (
    <main className="container page-stack">
      <section className="card page-card">
        <span className="badge">Hosted Runtime</span>
        <h1 className="page-card-title">{title}</h1>
        <p className="helper-text">{progressText}</p>
        <p className="mono-text">
          Resume link: <a href={resumeHref}>{resumeHref}</a>
        </p>
      </section>

      <section className="card page-card">
        {current ? (
          <>
            <h2 className="section-title">{current.question.label || "Untitled question"}</h2>
            <span className="helper-text">
              Question {current.index + 1} of {runtime.totalCount}
            </span>
            {current.flowBreadcrumbs.length > 0 ? (
              <p className="runtime-branch-header">
                {current.flowBreadcrumbs.map((entry) => entry.optionLabel).join(" > ")}
              </p>
            ) : null}

            <QuestionInput question={current.question} value={draft} onChange={setDraft} />

            <div className="inline-stack">
              <button
                type="button"
                className="button-secondary"
                onClick={() => navigate("back")}
                disabled={saving}
              >
                Back
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={submitAnswer}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save and Continue"}
              </button>
            </div>
          </>
        ) : runtime.status !== "completed" ? (
          <>
            <h2 className="section-title">Ready to submit</h2>
            <p className="helper-text">
              You answered all currently reachable questions.
            </p>
            <div className="inline-stack">
              <button
                type="button"
                className="button-secondary"
                onClick={() => navigate("back")}
                disabled={saving}
              >
                Back
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={completeSession}
                disabled={saving}
              >
                {saving ? "Submitting..." : "Submit"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="section-title">Thanks, submission received</h2>
            <p className="helper-text">
              Submission ID: <strong>{finishedSubmissionId ?? `sub_${runtime.sessionToken}`}</strong>
            </p>
            <Link href="/builder" className="button-secondary">
              Back to Builder
            </Link>
          </>
        )}

        {error ? <p className="state-text error">{error}</p> : null}

        {branchPathDisplay.length > 0 ? (
          <p className="helper-text">
            Current path: {branchPathDisplay.join(" > ")}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function QuestionInput({
  question,
  value,
  onChange
}: {
  question: QuestionNode;
  value: AnswerValue | "";
  onChange: (value: AnswerValue | "") => void;
}) {
  if (question.type === "radio") {
    return (
      <div className="choice-list">
        {(question.options ?? []).map((option) => (
          <label key={option.optionId} className="choice-item">
            <input
              type="radio"
              name={question.questionId}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label || option.value}
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "checkbox") {
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="choice-list">
        {(question.options ?? []).map((option) => {
          const selected = values.includes(option.value);
          return (
            <label key={option.optionId} className="choice-item">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...values, option.value]);
                  } else {
                    onChange(values.filter((entry) => entry !== option.value));
                  }
                }}
              />
              {option.label || option.value}
            </label>
          );
        })}
      </div>
    );
  }

  if (question.type === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? "" : Number(event.target.value))
        }
      />
    );
  }

  return (
    <textarea
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function normalizeDraftForSubmission(question: QuestionNode, draft: AnswerValue | ""): AnswerValue {
  if (question.type === "checkbox") {
    return Array.isArray(draft) ? draft : [];
  }

  if (question.type === "number") {
    if (typeof draft === "number") {
      return draft;
    }

    if (typeof draft === "string" && draft.trim()) {
      return Number(draft);
    }

    return Number.NaN;
  }

  if (typeof draft !== "string") {
    return "";
  }

  return draft;
}

function isEmptyValue(value: AnswerValue, questionType: QuestionNode["type"]) {
  if (questionType === "checkbox") {
    return Array.isArray(value) ? value.length === 0 : true;
  }

  if (questionType === "number") {
    return typeof value !== "number" || Number.isNaN(value);
  }

  return typeof value !== "string" || value.trim().length === 0;
}
