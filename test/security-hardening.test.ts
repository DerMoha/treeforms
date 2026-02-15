import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { persistCompletedSubmission } from "@/lib/db/submission-store";
import { exportSubmissionsCsv } from "@/lib/db/submission-export";
import { isSubmissionDbConfigured } from "@/lib/db/platform";
import {
  assertSafeDbTargetHost,
  assertSafeDbTargetPort,
  assertStableDbTargetResolution
} from "@/lib/server/network-policy";
import { type FormSchema, type SessionState } from "@/lib/types";

describe("security hardening", () => {
  it("blocks private or localhost DB target hosts", async () => {
    await expect(assertSafeDbTargetHost("127.0.0.1")).rejects.toThrow();
    await expect(assertSafeDbTargetHost("localhost")).rejects.toThrow();
    await expect(assertSafeDbTargetHost("8.8.8.8")).resolves.toEqual({
      host: "8.8.8.8",
      resolvedAddresses: ["8.8.8.8"]
    });
  });

  it("rejects when host resolution changes between validation and connect", async () => {
    await expect(
      assertStableDbTargetResolution("8.8.8.8", ["1.1.1.1"])
    ).rejects.toThrow();
  });

  it("validates DB target port ranges", () => {
    expect(() => assertSafeDbTargetPort(3306)).not.toThrow();
    expect(() => assertSafeDbTargetPort(0)).toThrow();
    expect(() => assertSafeDbTargetPort(70000)).toThrow();
  });

  it("neutralizes CSV formula cells during export", async () => {
    if (isSubmissionDbConfigured()) {
      return;
    }

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

    await persistCompletedSubmission(session, schema);

    const csv = await exportSubmissionsCsv("workspace_demo", formId, "wide", [
      {
        versionNumber: 1,
        schema
      }
    ]);

    expect(csv).toContain("'=2+2");
  });
});
