import { describe, expect, it } from "vitest";

import { prepareImportedSchema } from "@/lib/form-transfer";

describe("prepareImportedSchema", () => {
  it("imports a valid schema and overrides formId", () => {
    const raw = {
      schemaVersion: 1,
      formId: "form_source",
      title: "Imported Survey",
      mainFlow: {
        flowId: "flow_main",
        questions: [
          {
            questionId: "q1",
            type: "text",
            label: "How are you?",
            required: true
          }
        ]
      }
    };

    const result = prepareImportedSchema(raw, {
      targetFormId: "form_target",
      fallbackTitle: "Fallback"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.schema.formId).toBe("form_target");
    expect(result.schema.title).toBe("Imported Survey");
    expect(result.warnings.some((warning) => warning.includes("formId was set"))).toBe(true);
  });

  it("defaults missing schemaVersion and blank title", () => {
    const raw = {
      formId: "form_source",
      title: "   ",
      mainFlow: {
        flowId: "flow_main",
        questions: [
          {
            questionId: "q1",
            type: "text",
            label: "Q",
            required: false
          }
        ]
      }
    };

    const result = prepareImportedSchema(raw, {
      targetFormId: "form_target",
      fallbackTitle: "Imported Form Title"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.schema.schemaVersion).toBe(1);
    expect(result.schema.title).toBe("Imported Form Title");
    expect(result.warnings.some((warning) => warning.includes("schemaVersion"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("title was missing"))).toBe(true);
  });

  it("generates missing flow/question/option ids recursively", () => {
    const raw = {
      schemaVersion: 1,
      formId: "form_source",
      title: "Generated IDs",
      mainFlow: {
        questions: [
          {
            type: "radio",
            label: "Choose",
            required: true,
            options: [
              {
                label: "Option A"
              },
              {
                label: "Option B",
                branch: {
                  questions: [
                    {
                      type: "text",
                      label: "Follow-up",
                      required: false
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    };

    const result = prepareImportedSchema(raw, {
      targetFormId: "form_target",
      fallbackTitle: "Fallback"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const [question] = result.schema.mainFlow.questions;
    if (!question.options) {
      throw new Error("Expected options");
    }

    const [firstOption, secondOption] = question.options;
    const branch = secondOption.branch;
    if (!branch) {
      throw new Error("Expected branch flow");
    }

    expect(result.schema.mainFlow.flowId.startsWith("flow_")).toBe(true);
    expect(question.questionId.startsWith("q_")).toBe(true);
    expect(firstOption.optionId.startsWith("opt_")).toBe(true);
    expect(branch.flowId.startsWith("flow_")).toBe(true);
    expect(branch.questions[0]?.questionId.startsWith("q_")).toBe(true);
  });

  it("fills missing option value from label", () => {
    const raw = {
      schemaVersion: 1,
      formId: "form_source",
      title: "Values",
      mainFlow: {
        flowId: "flow_main",
        questions: [
          {
            questionId: "q1",
            type: "radio",
            label: "Pick one",
            required: true,
            options: [
              {
                optionId: "opt_a",
                label: "Alpha"
              },
              {
                optionId: "opt_b",
                label: "opt_b"
              }
            ]
          }
        ]
      }
    };

    const result = prepareImportedSchema(raw, {
      targetFormId: "form_target",
      fallbackTitle: "Fallback"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const options = result.schema.mainFlow.questions[0]?.options ?? [];
    expect(options[0]?.value).toBe("Alpha");
    expect(options[1]?.value).toBe("opt_b");
  });

  it("rejects malformed top-level payloads", () => {
    const result = prepareImportedSchema(null, {
      targetFormId: "form_target",
      fallbackTitle: "Fallback"
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors).toContain("Payload must be a JSON object");
  });

  it("returns validation errors for invalid schema content", () => {
    const raw = {
      schemaVersion: 1,
      formId: "form_source",
      title: "Broken",
      mainFlow: {
        flowId: "flow_main",
        questions: [
          {
            questionId: "q1",
            type: "text",
            label: "No options for text",
            required: false,
            options: [
              {
                optionId: "opt1",
                label: "Invalid",
                value: "invalid"
              }
            ]
          }
        ]
      }
    };

    const result = prepareImportedSchema(raw, {
      targetFormId: "form_target",
      fallbackTitle: "Fallback"
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors.some((error) => error.includes("options not allowed on text"))).toBe(true);
  });
});
