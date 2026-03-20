import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createForm, publishDraft, updateDraft } from "@/lib/db/app-store";
import { persistCompletedSubmission } from "@/lib/db/submission-store";
import { buildSubmissionSummary } from "@/lib/db/submission-analytics";
import { type FormSchema, type SessionState } from "@/lib/types";

function publishedVersion(published: { ok: true; versionNumber: number } | { ok: false }): number {
  if (!published.ok) throw new Error("Publish failed");
  return published.versionNumber;
}

function makeRadioSchema(formId: string): FormSchema {
  return {
    schemaVersion: 1,
    formId,
    title: "Test Form",
    mainFlow: {
      flowId: "main",
      questions: [
        {
          questionId: "q1",
          type: "radio",
          label: "Rate your experience",
          required: true,
          options: [
            { optionId: "opt_good", label: "Good", value: "good" },
            { optionId: "opt_bad", label: "Bad", value: "bad" }
          ]
        }
      ]
    }
  };
}

function makeCheckboxSchema(formId: string): FormSchema {
  return {
    schemaVersion: 1,
    formId,
    title: "Test Form",
    mainFlow: {
      flowId: "main",
      questions: [
        {
          questionId: "q_toppings",
          type: "checkbox",
          label: "Select toppings",
          required: true,
          options: [
            { optionId: "cheese", label: "Cheese", value: "cheese" },
            { optionId: "pepperoni", label: "Pepperoni", value: "pepperoni" },
            { optionId: "mushrooms", label: "Mushrooms", value: "mushrooms" }
          ]
        }
      ]
    }
  };
}

function makeBranchSchema(formId: string): FormSchema {
  return {
    schemaVersion: 1,
    formId,
    title: "Branch Test Form",
    mainFlow: {
      flowId: "main",
      questions: [
        {
          questionId: "q1",
          type: "radio",
          label: "Choose path",
          required: true,
          options: [
            {
              optionId: "path_a",
              label: "Path A",
              value: "a",
              branch: {
                flowId: "branch_a",
                questions: [
                  { questionId: "qa1", type: "text", label: "Follow-up A", required: false }
                ]
              }
            },
            { optionId: "path_b", label: "Path B", value: "b" }
          ]
        }
      ]
    }
  };
}

function makeEmptySchema(formId: string): FormSchema {
  return {
    schemaVersion: 1,
    formId,
    title: "Empty Form",
    mainFlow: { flowId: "main", questions: [] }
  };
}

function makeStatusFilterSchema(formId: string): FormSchema {
  return {
    schemaVersion: 1,
    formId,
    title: "Status Filter Test",
    mainFlow: {
      flowId: "main",
      questions: [
        { questionId: "q1", type: "text", label: "Name", required: true }
      ]
    }
  };
}

function makeSession(
  workspaceId: string,
  formId: string,
  versionNumber: number,
  status: "completed" | "in_progress",
  answers: Record<string, StoredAnswerValue>,
  branchTrace: string[] = []
): SessionState {
  const now = new Date().toISOString();
  return {
    sessionToken: `sess_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    resumeToken: `resume_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    workspaceId,
    formId,
    versionNumber,
    status,
    currentQuestionId: null,
    answers,
    history: Object.keys(answers),
    branchTrace,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: now,
    updatedAt: now
  };
}

type StoredAnswerValue = {
  questionId: string;
  value: string | string[];
  answeredAt: string;
  flowPath: string[];
};

describe("submission analytics", () => {
  it("returns overview counts and completion rate", async () => {
    const formId = `form_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();

    const created = await createForm("workspace_demo", "Analytics Test");
    const schema: FormSchema = { ...makeRadioSchema(created.formId), formId: created.formId };
    await updateDraft(created.formId, schema, "test");
    const vn = publishedVersion(await publishDraft(created.formId, "test"));

    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q1: { questionId: "q1", value: "good", answeredAt: now, flowPath: [] }
      }),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q1: { questionId: "q1", value: "good", answeredAt: now, flowPath: [] }
      }),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q1: { questionId: "q1", value: "bad", answeredAt: now, flowPath: [] }
      }),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q1: { questionId: "q1", value: "good", answeredAt: now, flowPath: [] }
      }),
      schema
    );

    const summary = await buildSubmissionSummary("workspace_demo", created.formId, {
      version: vn,
      status: null,
      dateFrom: null,
      dateTo: null
    });

    expect(summary.overview.total).toBe(4);
    expect(summary.overview.completed).toBe(4);
    expect(summary.overview.inProgress).toBe(0);
    expect(summary.overview.completionRate).toBe(100);
  });

  it("counts single-select (radio) answer distribution correctly", async () => {
    const formId = `form_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();

    const created = await createForm("workspace_demo", "Radio Count Test");
    const schema: FormSchema = { ...makeRadioSchema(created.formId), formId: created.formId };
    await updateDraft(created.formId, schema, "test");
    const vn = publishedVersion(await publishDraft(created.formId, "test"));

    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q1: { questionId: "q1", value: "good", answeredAt: now, flowPath: [] }
      }),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q1: { questionId: "q1", value: "good", answeredAt: now, flowPath: [] }
      }),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q1: { questionId: "q1", value: "bad", answeredAt: now, flowPath: [] }
      }),
      schema
    );

    const summary = await buildSubmissionSummary("workspace_demo", created.formId, {
      version: vn,
      status: null,
      dateFrom: null,
      dateTo: null
    });

    const question = summary.questions.find((q) => q.questionId === "q1");
    expect(question).toBeDefined();
    expect(question!.questionType).toBe("radio");
    expect(question!.respondents).toBe(3);

    const goodAnswer = question!.answers.find((a) => a.key === "opt_good");
    expect(goodAnswer!.count).toBe(2);
    expect(goodAnswer!.percentage).toBe(67);

    const badAnswer = question!.answers.find((a) => a.key === "opt_bad");
    expect(badAnswer!.count).toBe(1);
    expect(badAnswer!.percentage).toBe(33);
  });

  it("counts checkbox multi-select answers correctly", async () => {
    const formId = `form_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();

    const created = await createForm("workspace_demo", "Checkbox Count Test");
    const schema: FormSchema = { ...makeCheckboxSchema(created.formId), formId: created.formId };
    await updateDraft(created.formId, schema, "test");
    const vn = publishedVersion(await publishDraft(created.formId, "test"));

    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q_toppings: { questionId: "q_toppings", value: ["cheese", "pepperoni"], answeredAt: now, flowPath: [] }
      }),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q_toppings: { questionId: "q_toppings", value: ["cheese", "mushrooms"], answeredAt: now, flowPath: [] }
      }),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {
        q_toppings: { questionId: "q_toppings", value: ["cheese"], answeredAt: now, flowPath: [] }
      }),
      schema
    );

    const summary = await buildSubmissionSummary("workspace_demo", created.formId, {
      version: vn,
      status: null,
      dateFrom: null,
      dateTo: null
    });

    const question = summary.questions.find((q) => q.questionId === "q_toppings");
    expect(question).toBeDefined();
    expect(question!.questionType).toBe("checkbox");
    expect(question!.respondents).toBe(3);

    const cheeseAnswer = question!.answers.find((a) => a.key === "cheese");
    expect(cheeseAnswer!.count).toBe(3);
    expect(cheeseAnswer!.percentage).toBe(100);

    const pepperoniAnswer = question!.answers.find((a) => a.key === "pepperoni");
    expect(pepperoniAnswer!.count).toBe(1);
    expect(pepperoniAnswer!.percentage).toBe(33);

    const mushroomsAnswer = question!.answers.find((a) => a.key === "mushrooms");
    expect(mushroomsAnswer!.count).toBe(1);
    expect(mushroomsAnswer!.percentage).toBe(33);
  });

  it("counts branch paths correctly", async () => {
    const formId = `form_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();

    const created = await createForm("workspace_demo", "Branch Path Test");
    const schema: FormSchema = { ...makeBranchSchema(created.formId), formId: created.formId };
    await updateDraft(created.formId, schema, "test");
    const vn = publishedVersion(await publishDraft(created.formId, "test"));

    await persistCompletedSubmission(
      makeSession(
        "workspace_demo",
        created.formId,
        vn,
        "completed",
        { q1: { questionId: "q1", value: "path_a", answeredAt: now, flowPath: [] } },
        ["q1:path_a"]
      ),
      schema
    );
    await persistCompletedSubmission(
      makeSession(
        "workspace_demo",
        created.formId,
        vn,
        "completed",
        { q1: { questionId: "q1", value: "path_a", answeredAt: now, flowPath: [] } },
        ["q1:path_a"]
      ),
      schema
    );
    await persistCompletedSubmission(
      makeSession(
        "workspace_demo",
        created.formId,
        vn,
        "completed",
        { q1: { questionId: "q1", value: "path_b", answeredAt: now, flowPath: [] } },
        ["q1:path_b"]
      ),
      schema
    );

    const summary = await buildSubmissionSummary("workspace_demo", created.formId, {
      version: vn,
      status: null,
      dateFrom: null,
      dateTo: null
    });

    const topBranches = summary.flows.topBranches;
    expect(topBranches.length).toBeGreaterThan(0);

    const pathA = topBranches.find((b) => b.branchKey === "path_a");
    expect(pathA).toBeDefined();
    expect(pathA!.count).toBe(2);

    const pathB = topBranches.find((b) => b.branchKey === "path_b");
    expect(pathB).toBeDefined();
    expect(pathB!.count).toBe(1);
  });

  it("returns empty summary for a form with no submissions", async () => {
    const created = await createForm("workspace_demo", "Empty Form");
    await updateDraft(created.formId, makeEmptySchema(created.formId), "test");
    const vn = publishedVersion(await publishDraft(created.formId, "test"));

    const summary = await buildSubmissionSummary("workspace_demo", created.formId, {
      version: vn,
      status: null,
      dateFrom: null,
      dateTo: null
    });

    expect(summary.overview.total).toBe(0);
    expect(summary.overview.completed).toBe(0);
    expect(summary.overview.inProgress).toBe(0);
    expect(summary.overview.completionRate).toBe(0);
    expect(summary.questions).toHaveLength(0);
    expect(summary.flows.topPaths).toHaveLength(0);
    expect(summary.flows.topBranches).toHaveLength(0);
  });

  it("filters by status correctly", async () => {
    const formId = `form_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const created = await createForm("workspace_demo", "Status Filter Test");
    const schema: FormSchema = { ...makeStatusFilterSchema(created.formId), formId: created.formId };
    await updateDraft(created.formId, schema, "test");
    const vn = publishedVersion(await publishDraft(created.formId, "test"));

    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {}),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "completed", {}),
      schema
    );
    await persistCompletedSubmission(
      makeSession("workspace_demo", created.formId, vn, "in_progress", {}),
      schema
    );

    const completedSummary = await buildSubmissionSummary("workspace_demo", created.formId, {
      version: vn,
      status: "completed",
      dateFrom: null,
      dateTo: null
    });
    expect(completedSummary.overview.total).toBe(3);
    expect(completedSummary.overview.completionRate).toBe(100);

    const inProgressSummary = await buildSubmissionSummary("workspace_demo", created.formId, {
      version: vn,
      status: "in_progress",
      dateFrom: null,
      dateTo: null
    });
    expect(inProgressSummary.overview.total).toBe(0);
    expect(inProgressSummary.overview.completionRate).toBe(0);
  });
});
