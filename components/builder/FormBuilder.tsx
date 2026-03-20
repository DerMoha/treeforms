"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { FlowMinimapOverlay } from "@/components/builder/FlowMinimapOverlay";
import { readCsrfToken } from "@/lib/client/csrf";
import { buildFlowOutline, pathKey } from "@/lib/builder-outline";
import {
  type BranchPathSegment,
  ensureFlowByPath,
  getFlowByPath,
  makeOption,
  makeQuestion,
  returnTargetLabel,
  updateQuestionType
} from "@/lib/builder-utils";
import { slugify } from "@/lib/ids";
import { type FormSchema, type QuestionNode, type QuestionType } from "@/lib/types";

interface VersionSummary {
  id: string;
  versionNumber: number;
  publishedAt: string;
}

interface FormApiPayload {
  form: {
    formId: string;
    slug: string;
    title: string;
  };
  draft: {
    schema: FormSchema;
  };
  versions: VersionSummary[];
}

interface Props {
  formId: string;
}

interface SelectPathOptions {
  scrollToFlowTop?: boolean;
}

export function FormBuilder({ formId }: Props) {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [slug, setSlug] = useState("");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [activePath, setActivePath] = useState<BranchPathSegment[]>([]);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const flowCardShellRef = useRef<HTMLElement | null>(null);
  const [scrollToFlowTopToken, setScrollToFlowTopToken] = useState(0);
  const [originalTitle, setOriginalTitle] = useState("");
  const [pendingTitleSave, setPendingTitleSave] = useState(false);

  const latestVersion = useMemo(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null,
    [versions]
  );

  const loadForm = useCallback(async () => {
    setLoading(true);
    setErrors([]);

    try {
      const response = await fetch(`/api/forms/${formId}`, { cache: "no-store" });
      const payload = (await response.json()) as FormApiPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load form");
      }

      setSchema(payload.draft.schema);
      setSlug(payload.form.slug);
      setVersions(payload.versions ?? []);
      setOriginalTitle(payload.draft.schema.title);
    } catch (reason) {
      setErrors([reason instanceof Error ? reason.message : "Unable to load form"]);
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    void loadForm();
  }, [loadForm]);

  const activePathId = useMemo(() => pathKey(activePath), [activePath]);

  const outlineNodes = useMemo(() => {
    if (!schema) {
      return [];
    }

    return buildFlowOutline(schema);
  }, [schema]);

  const activeOutlineNode = useMemo(
    () => outlineNodes.find((node) => node.id === activePathId) ?? outlineNodes[0] ?? null,
    [activePathId, outlineNodes]
  );

  const activeFlow = useMemo(() => {
    if (!schema) {
      return null;
    }

    return getFlowByPath(schema, activePath) ?? schema.mainFlow;
  }, [schema, activePath]);

  const breadcrumbOptions = useMemo(() => {
    if (!schema || activePath.length === 0) {
      return [];
    }

    return activePath.map((segment, index) => {
      const parentPath = activePath.slice(0, index);
      const flow = getFlowByPath(schema, parentPath) ?? schema.mainFlow;
      const question = flow.questions.find((entry) => entry.questionId === segment.questionId);
      const option = question?.options?.find((entry) => entry.optionId === segment.optionId);

      return option?.label?.trim() || option?.value || segment.optionId;
    });
  }, [schema, activePath]);

  useEffect(() => {
    if (!schema || activePath.length === 0) {
      return;
    }

    if (!getFlowByPath(schema, activePath)) {
      setActivePath([]);
      setFocusedQuestionId(null);
    }
  }, [schema, activePath]);

  useEffect(() => {
    if (!activeFlow) {
      return;
    }

    if (activeFlow.questions.length === 0) {
      if (focusedQuestionId !== null) {
        setFocusedQuestionId(null);
      }
      return;
    }

    if (!focusedQuestionId) {
      setFocusedQuestionId(activeFlow.questions[0].questionId);
      return;
    }

    const stillExists = activeFlow.questions.some((question) => question.questionId === focusedQuestionId);
    if (!stillExists) {
      setFocusedQuestionId(activeFlow.questions[0].questionId);
    }
  }, [activeFlow, focusedQuestionId]);

  useEffect(() => {
    if (scrollToFlowTopToken === 0) {
      return;
    }

    const flowCardShell = flowCardShellRef.current;
    if (!flowCardShell) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      flowCardShell.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activePathId, scrollToFlowTopToken]);

  async function saveDraft() {
    if (!schema) {
      return;
    }

    const isPublished = latestVersion !== null;
    const titleChanged = schema.title !== originalTitle;

    if (isPublished && titleChanged && !pendingTitleSave) {
      setPendingTitleSave(true);
      const confirmed = window.confirm(
        `Changing the title will also change the form's URL slug from "${slug}" to "${slugify(schema.title)}".\n\nThis form has been published. Existing share links may break.\n\nProceed anyway?`
      );
      if (!confirmed) {
        setPendingTitleSave(false);
        return;
      }
    }

    setSaving(true);
    setErrors([]);
    setWarnings([]);

    try {
      const response = await fetch(`/api/forms/${formId}/draft`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": readCsrfToken()
        },
        body: JSON.stringify({ schema })
      });

      const payload = (await response.json()) as { error?: string; details?: string[] };

      if (!response.ok) {
        setErrors(payload.details ?? [payload.error ?? "Unable to save draft"]);
        return;
      }

      setToast("Draft saved");
      setTimeout(() => setToast(null), 2200);
      setPendingTitleSave(false);
      await loadForm();
    } catch (reason) {
      setErrors([reason instanceof Error ? reason.message : "Unable to save draft"]);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setErrors([]);
    setWarnings([]);

    try {
      const response = await fetch(`/api/forms/${formId}/publish`, {
        method: "POST",
        headers: {
          "x-csrf-token": readCsrfToken()
        }
      });

      const payload = (await response.json()) as {
        error?: string;
        details?: string[];
        versionNumber?: number;
      };

      if (!response.ok) {
        setErrors(payload.details ?? [payload.error ?? "Unable to publish form"]);
        return;
      }

      setToast(`Published version v${payload.versionNumber}`);
      setTimeout(() => setToast(null), 2600);
      await loadForm();
    } catch (reason) {
      setErrors([reason instanceof Error ? reason.message : "Unable to publish form"]);
    } finally {
      setPublishing(false);
    }
  }

  function openImportDialog() {
    importInputRef.current?.click();
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!window.confirm("Importing JSON will replace this form's current draft. Continue?")) {
      return;
    }

    setImporting(true);
    setErrors([]);

    try {
      const rawContent = await file.text();
      let parsed: unknown;

      try {
        parsed = JSON.parse(rawContent) as unknown;
      } catch {
        setWarnings([]);
        setErrors(["Selected file is not valid JSON"]);
        return;
      }

      const response = await fetch(`/api/forms/${formId}/draft/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": readCsrfToken()
        },
        body: JSON.stringify(parsed)
      });

      const payload = (await response.json()) as {
        error?: string;
        details?: string[];
        warnings?: string[];
      };

      if (!response.ok) {
        setWarnings([]);
        setErrors(payload.details ?? [payload.error ?? "Unable to import form JSON"]);
        return;
      }

      setWarnings(payload.warnings ?? []);
      setToast("Form JSON imported");
      setTimeout(() => setToast(null), 2600);
      await loadForm();
    } catch (reason) {
      setWarnings([]);
      setErrors([reason instanceof Error ? reason.message : "Unable to import form JSON"]);
    } finally {
      setImporting(false);
    }
  }

  function mutateSchema(mutator: (current: FormSchema) => FormSchema) {
    setSchema((current) => {
      if (!current) {
        return current;
      }
      return mutator(current);
    });
  }

  function selectPath(path: BranchPathSegment[], options: SelectPathOptions = {}) {
    setActivePath(path.map((segment) => ({ ...segment })));
    setFocusedQuestionId(null);

    if (options.scrollToFlowTop) {
      setScrollToFlowTopToken((current) => current + 1);
    }
  }

  function openBranch(path: BranchPathSegment[]) {
    mutateSchema((current) => {
      const next = structuredClone(current) as FormSchema;
      ensureFlowByPath(next, path);
      return next;
    });

    selectPath(path);
  }

  if (loading || !schema) {
    return (
      <main className="container">
        <section className="card page-card">
          <p className="state-text">Loading form builder...</p>
        </section>
      </main>
    );
  }

  const publishedLink = latestVersion && slug ? `/f/${slug}/v/${latestVersion.versionNumber}` : null;
  const breadcrumbText = breadcrumbOptions.length > 0
    ? `Main flow > ${breadcrumbOptions.join(" > ")}`
    : "Main flow";

  const returnsTo = activePath.length > 0
    ? returnTargetLabel(schema, activePath[0]?.questionId ?? "")
    : null;

  return (
    <main className="container page-stack">
      <section className="card page-card">
        <div className="inline-stack align-center">
          <Link href="/builder" className="button-secondary">
            Back
          </Link>
          <span className="badge">Form Builder</span>
          <span className="mono-text">
            {formId}
          </span>
        </div>

        <label className="field" style={{ maxWidth: 650 }}>
          <span className="field-label">Form title</span>
          <input
            value={schema.title}
            onChange={(event) => mutateSchema((current) => ({ ...current, title: event.target.value }))}
          />
        </label>

        <div className="inline-stack">
          <button type="button" className="button-primary" disabled={saving} onClick={saveDraft}>
            {saving ? (
              <>
                <span className="spinner" />
                Saving...
              </>
            ) : (
              "Save Draft"
            )}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={publishing}
            onClick={publish}
          >
            {publishing ? (
              <>
                <span className="spinner spinner-dark" />
                Publishing...
              </>
            ) : (
              "Publish Version"
            )}
          </button>
          <a className="button-secondary" href={`/api/forms/${formId}/draft/export.json`}>
            Export JSON
          </a>
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
              "Import JSON"
            )}
          </button>

          <Link
            className="button-secondary"
            href={`/builder/forms/${formId}/submissions`}
          >
            Submissions
          </Link>

          {publishedLink ? (
            <>
              <Link className="button-secondary" href={publishedLink}>
                Open Latest Runtime
              </Link>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  const url = `${window.location.origin}${publishedLink}`;
                  navigator.clipboard.writeText(url).then(() => {
                    setToast("URL copied to clipboard!");
                    setTimeout(() => setToast(null), 2000);
                  });
                }}
              >
                Copy URL
              </button>
            </>
          ) : null}
        </div>

        <div className="inline-stack align-center">
          <span className="helper-text">
            Slug: <strong>{slug}</strong>
          </span>
          {latestVersion ? <span className="badge">latest v{latestVersion.versionNumber}</span> : null}
          {toast ? (
            <span className="state-text success fade-in" key={toast}>
              {toast}
            </span>
          ) : null}
        </div>

        {errors.length > 0 ? (
          <div className="notice-error">
            <strong>Validation issues</strong>
            <ul style={{ margin: 0, paddingLeft: "1rem" }}>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="notice-warn">
            <strong>Import notes</strong>
            <ul style={{ margin: 0, paddingLeft: "1rem" }}>
              {warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
      </section>

      <section className="builder-layout">
        <FlowOutlineSidebar
          schema={schema}
          activePath={activePath}
          onSelectPath={selectPath}
        />

        <section
          className="flow-card-shell"
          ref={(element) => {
            flowCardShellRef.current = element;
          }}
        >
          <section className="card flow-context-bar">
            <div className="field">
              <span className="badge">You are here</span>
              <h3 className="flow-card-title">
                {activeOutlineNode?.title ?? "Main flow"}
              </h3>
              <p className="helper-text">
                Path: <strong>{breadcrumbText}</strong>
              </p>
              {returnsTo ? (
                <p className="state-text success">
                  Returns to: {returnsTo}
                </p>
              ) : null}
            </div>

            {activePath.length > 0 ? (
              <button type="button" className="button-secondary" onClick={() => selectPath([])}>
                Back to Main Flow
              </button>
            ) : null}
          </section>

          <FlowEditor
            schema={schema}
            path={activePath}
            title={activePath.length > 0 ? "Selected Branch" : "Main Flow"}
            onSchemaChange={setSchema}
            onOpenBranch={openBranch}
            focusedQuestionId={focusedQuestionId}
            onFocusQuestion={setFocusedQuestionId}
          />
        </section>
      </section>

      <FlowMinimapOverlay
        schema={schema}
        activePath={activePath}
        onSelectPath={selectPath}
      />
    </main>
  );
}

interface FlowOutlineSidebarProps {
  schema: FormSchema;
  activePath: BranchPathSegment[];
  onSelectPath: (path: BranchPathSegment[], options?: SelectPathOptions) => void;
}

function FlowOutlineSidebar({ schema, activePath, onSelectPath }: FlowOutlineSidebarProps) {
  const nodes = useMemo(() => buildFlowOutline(schema), [schema]);
  const activeId = pathKey(activePath);
  const mainNode = nodes[0];
  const branchNodes = nodes.filter((node) => node.path.length > 0);

  return (
    <aside className="card flow-outline-card">
      <div className="flow-outline-sticky">
        <div className="field">
          <h3 className="section-title">Flow Outline</h3>
          <p className="helper-text">
            Jump across main and branch flows without losing context.
          </p>
        </div>

        <button
          type="button"
          className={`flow-outline-item${activeId === "main" ? " is-active" : ""}`}
          onClick={() => onSelectPath([])}
        >
          <span className="flow-outline-row">
            <strong>Main flow</strong>
            <span className="badge">{mainNode?.questionCount ?? schema.mainFlow.questions.length}</span>
          </span>
          <span className="flow-outline-meta">Pinned entry point</span>
        </button>

        <div className="flow-outline-list">
          {branchNodes.length === 0 ? (
            <p className="helper-text">
              No follow-up flows yet.
            </p>
          ) : (
            branchNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`flow-outline-item${activeId === node.id ? " is-active" : ""}`}
                onClick={() => onSelectPath(node.path)}
                style={{ marginLeft: `${Math.max(0, node.depth - 1) * 14}px` }}
              >
                <span className="flow-outline-row">
                  <strong>{node.title}</strong>
                  <span className="badge">{node.questionCount}</span>
                </span>
                <span className="flow-outline-meta">
                  from {node.sourceQuestionLabel ?? "Question"}{" -> "}
                  {node.sourceOptionLabel ?? "Option"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

interface FlowEditorProps {
  schema: FormSchema;
  path: BranchPathSegment[];
  title: string;
  onSchemaChange: Dispatch<SetStateAction<FormSchema | null>>;
  onOpenBranch: (path: BranchPathSegment[]) => void;
  focusedQuestionId: string | null;
  onFocusQuestion: (questionId: string | null) => void;
}

function FlowEditor({
  schema,
  path,
  title,
  onSchemaChange,
  onOpenBranch,
  focusedQuestionId,
  onFocusQuestion
}: FlowEditorProps) {
  const flow = getFlowByPath(schema, path) ?? schema.mainFlow;
  const questionRefs = useRef<Record<string, HTMLElement | null>>({});

  function mutate(mutator: (next: FormSchema) => void) {
    onSchemaChange((current) => {
      if (!current) {
        return current;
      }

      const next = structuredClone(current) as FormSchema;
      mutator(next);
      return next;
    });
  }

  function mutateQuestion(questionId: string, updater: (question: QuestionNode) => QuestionNode) {
    mutate((next) => {
      const flow = ensureFlowByPath(next, path);
      flow.questions = flow.questions.map((question) =>
        question.questionId === questionId ? updater(question) : question
      );
    });
  }

  function addQuestion(type: QuestionType) {
    const question = makeQuestion(type);

    mutate((next) => {
      const flow = ensureFlowByPath(next, path);
      flow.questions.push(question);
    });

    onFocusQuestion(question.questionId);
  }

  function removeQuestion(questionId: string) {
    mutate((next) => {
      const flow = ensureFlowByPath(next, path);
      flow.questions = flow.questions.filter((entry) => entry.questionId !== questionId);
    });
  }

  function reorderQuestion(questionId: string, direction: "up" | "down") {
    mutate((next) => {
      const flow = ensureFlowByPath(next, path);
      const index = flow.questions.findIndex((entry) => entry.questionId === questionId);
      if (index === -1) {
        return;
      }

      const offset = direction === "up" ? -1 : 1;
      const targetIndex = index + offset;

      if (targetIndex < 0 || targetIndex >= flow.questions.length) {
        return;
      }

      const [question] = flow.questions.splice(index, 1);
      flow.questions.splice(targetIndex, 0, question);
    });
  }

  function focusQuestion(questionId: string, shouldScroll = false) {
    onFocusQuestion(questionId);

    if (shouldScroll) {
      const element = questionRefs.current[questionId];
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.focus({ preventScroll: true });
      }
    }
  }

  return (
    <section className="card page-card">
      <header className="flow-card-header">
        <h3 className="flow-card-title">{title}</h3>
        <div className="inline-stack">
          <button type="button" className="button-secondary" onClick={() => addQuestion("radio")}>
            + Radio
          </button>
          <button type="button" className="button-secondary" onClick={() => addQuestion("checkbox")}>
            + Checkbox
          </button>
          <button type="button" className="button-secondary" onClick={() => addQuestion("text")}>
            + Text
          </button>
          <button type="button" className="button-secondary" onClick={() => addQuestion("number")}>
            + Number
          </button>
        </div>
      </header>

      {flow.questions.length > 0 ? (
        <div className="flow-stepper" role="tablist" aria-label="Question stepper">
          {flow.questions.map((question, index) => {
            const label = question.label.trim() || `Question ${index + 1}`;
            const isActive = focusedQuestionId === question.questionId;

            return (
              <button
                key={question.questionId}
                type="button"
                className={`flow-step${isActive ? " is-active" : ""}`}
                onClick={() => focusQuestion(question.questionId, true)}
                aria-current={isActive ? "step" : undefined}
                title={label}
              >
                <span className="flow-step-index">Q{index + 1}</span>
                <span className="flow-step-label">{truncateLabel(label)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {flow.questions.length === 0 ? (
        <p className="helper-text">No questions yet in this flow.</p>
      ) : null}

      <div className="page-stack">
        {flow.questions.map((question, index) => {
          const isFocused = focusedQuestionId === question.questionId;
          const label = question.label.trim() || `Question ${index + 1}`;
          const optionCount = question.options?.length ?? 0;
          const followUpCount =
            question.options?.reduce((total, option) => total + (option.branch?.questions.length ?? 0), 0) ?? 0;
          const summaryBits = [`${question.type} question`];

          if (question.required) {
            summaryBits.push("required");
          }

          if (optionCount > 0) {
            summaryBits.push(`${optionCount} option${optionCount === 1 ? "" : "s"}`);
          }

          if (followUpCount > 0) {
            summaryBits.push(`${followUpCount} follow-up${followUpCount === 1 ? "" : "s"}`);
          }

          return (
            <article
              key={question.questionId}
              ref={(element) => {
                questionRefs.current[question.questionId] = element;
              }}
              tabIndex={-1}
              className={`card builder-question-card question-card-shell${isFocused ? " is-focused" : " is-collapsed"}`}
              onClick={() => focusQuestion(question.questionId)}
            >
              <div className="flow-card-header">
                <span className="badge">Q{index + 1}</span>
                <div className="builder-question-head">
                  <strong className="builder-question-title">{truncateLabel(label, 64)}</strong>
                  <span className="helper-text">{summaryBits.join(" | ")}</span>
                </div>
                <div className="inline-stack">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => reorderQuestion(question.questionId, "up")}
                    title="Move up"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => reorderQuestion(question.questionId, "down")}
                    title="Move down"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => removeQuestion(question.questionId)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {isFocused ? (
                <>
                  <label className="field">
                    <span className="field-label">Label</span>
                    <input
                      value={question.label}
                      onChange={(event) =>
                        mutateQuestion(question.questionId, (current) => ({
                          ...current,
                          label: event.target.value
                        }))
                      }
                    />
                  </label>

                  <div className="inline-stack align-center">
                    <label className="flow-type-label">
                      <span className="field-label">Type</span>
                      <select
                        value={question.type}
                        onChange={(event) =>
                          mutateQuestion(question.questionId, (current) =>
                            updateQuestionType(current, event.target.value as QuestionType)
                          )
                        }
                      >
                        <option value="radio">Radio</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                      </select>
                    </label>

                    <label className="required-toggle">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(event) =>
                          mutateQuestion(question.questionId, (current) => ({
                            ...current,
                            required: event.target.checked
                          }))
                        }
                      />
                      Required
                    </label>
                  </div>

                  {question.type === "text" ? (
                    <div className="inline-stack">
                      <label>
                        Min length
                        <input
                          type="number"
                          value={question.validation?.minLen ?? ""}
                          onChange={(event) =>
                            mutateQuestion(question.questionId, (current) => ({
                              ...current,
                              validation: {
                                ...current.validation,
                                minLen: event.target.value ? Number(event.target.value) : undefined
                              }
                            }))
                          }
                        />
                      </label>
                      <label>
                        Max length
                        <input
                          type="number"
                          value={question.validation?.maxLen ?? ""}
                          onChange={(event) =>
                            mutateQuestion(question.questionId, (current) => ({
                              ...current,
                              validation: {
                                ...current.validation,
                                maxLen: event.target.value ? Number(event.target.value) : undefined
                              }
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  {question.type === "number" ? (
                    <div className="inline-stack">
                      <label>
                        Min value
                        <input
                          type="number"
                          value={question.validation?.min ?? ""}
                          onChange={(event) =>
                            mutateQuestion(question.questionId, (current) => ({
                              ...current,
                              validation: {
                                ...current.validation,
                                min: event.target.value ? Number(event.target.value) : undefined
                              }
                            }))
                          }
                        />
                      </label>
                      <label>
                        Max value
                        <input
                          type="number"
                          value={question.validation?.max ?? ""}
                          onChange={(event) =>
                            mutateQuestion(question.questionId, (current) => ({
                              ...current,
                              validation: {
                                ...current.validation,
                                max: event.target.value ? Number(event.target.value) : undefined
                              }
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  {(question.type === "radio" || question.type === "checkbox") && question.options ? (
                    <div className="option-editor">
                      <div className="option-editor-head">
                        <strong className="field-label">Options & Branches</strong>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() =>
                            mutateQuestion(question.questionId, (current) => ({
                              ...current,
                              options: [...(current.options ?? []), makeOption()]
                            }))
                          }
                        >
                          + Option
                        </button>
                      </div>

                      {question.options.map((option) => {
                        const optionFollowUpCount = option.branch?.questions.length ?? 0;

                        return (
                          <article key={option.optionId} className="card option-card">
                            <div className="inline-stack align-center">
                              <input
                                placeholder="Option label"
                                value={option.label}
                                onChange={(event) =>
                                  mutateQuestion(question.questionId, (current) => ({
                                    ...current,
                                    options: (current.options ?? []).map((entry) =>
                                      entry.optionId === option.optionId
                                        ? {
                                            ...entry,
                                            label: event.target.value
                                          }
                                        : entry
                                    )
                                  }))
                                }
                                style={{ flex: "1 1 200px" }}
                              />
                              <input
                                placeholder="Option value"
                                value={option.value}
                                onChange={(event) =>
                                  mutateQuestion(question.questionId, (current) => ({
                                    ...current,
                                    options: (current.options ?? []).map((entry) =>
                                      entry.optionId === option.optionId
                                        ? {
                                            ...entry,
                                            value: event.target.value
                                          }
                                        : entry
                                    )
                                  }))
                                }
                                style={{ flex: "1 1 180px" }}
                              />
                            </div>

                            <div className="inline-stack">
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() =>
                                  onOpenBranch([
                                    ...path,
                                    {
                                      questionId: question.questionId,
                                      optionId: option.optionId
                                    }
                                  ])
                                }
                              >
                                {optionFollowUpCount > 0 ? "Edit follow-up" : "Add follow-up"}
                              </button>
                              <button
                                type="button"
                                className="button-danger"
                                onClick={() =>
                                  mutateQuestion(question.questionId, (current) => ({
                                    ...current,
                                    options: (current.options ?? []).filter(
                                      (entry) => entry.optionId !== option.optionId
                                    )
                                  }))
                                }
                              >
                                Remove option
                              </button>

                              <span className="badge">
                                {optionFollowUpCount} follow-up {optionFollowUpCount === 1 ? "question" : "questions"}
                              </span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="helper-text builder-question-collapsed-note">
                  Collapsed while you edit another question. Click this card to continue here.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function truncateLabel(label: string, maxLen = 28) {
  if (label.length <= maxLen) {
    return label;
  }

  return `${label.slice(0, maxLen - 1)}...`;
}
