import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createForm, publishDraft, updateDraft } from "@/lib/db/app-store";
import { persistCompletedSubmission } from "@/lib/db/submission-store";
import { exportSubmissionsCsv } from "@/lib/db/submission-export";
import { type FormSchema, type SessionState } from "@/lib/types";

describe("security hardening", () => {
  it("neutralizes CSV formula cells during export", async () => {
    const formId = `form_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const sessionToken = `sess_${randomUUID().replace(/-/g, "")}`;
    const now = new Date().toISOString();
    const schema: FormSchema = {
      schemaVersion: 1,
      formId,
      title: "CSV Injection Guard",
      mainFlow: {
        flowId: "flow_main",
        questions: [
          {
            questionId: "q_formula",
            type: "text",
            label: "Formula candidate",
            required: false
          }
        ]
      }
    };

    const session: SessionState = {
      sessionToken,
      resumeToken: `resume_${randomUUID().replace(/-/g, "")}`,
      workspaceId: "workspace_demo",
      formId,
      versionNumber: 1,
      status: "completed",
      currentQuestionId: null,
      answers: {
        q_formula: {
          questionId: "q_formula",
          value: "=2+2",
          answeredAt: now,
          flowPath: []
        }
      },
      history: ["q_formula"],
      branchTrace: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: now,
      updatedAt: now
    };

    const created = await createForm("workspace_demo", schema.title);
    const createdSchema: FormSchema = {
      ...schema,
      formId: created.formId
    };

    const updated = await updateDraft(created.formId, createdSchema, "test");
    expect(updated.ok).toBe(true);

    const published = await publishDraft(created.formId, "test");
    expect(published.ok).toBe(true);

    await persistCompletedSubmission(
      {
        ...session,
        formId: created.formId
      },
      createdSchema
    );

    const csv = await exportSubmissionsCsv("workspace_demo", created.formId, "wide", [
      {
        versionNumber: 1,
        schema: createdSchema
      }
    ]);

    expect(csv).toContain("'=2+2");
  });
});
