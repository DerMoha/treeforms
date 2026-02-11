import { describe, expect, it } from "vitest";

import { validateSchema } from "@/lib/schema";
import { type FormSchema } from "@/lib/types";

function validSchema(): FormSchema {
  return {
    schemaVersion: 1,
    formId: "form_1",
    title: "Sample",
    mainFlow: {
      flowId: "flow_main",
      questions: [
        {
          questionId: "q1",
          type: "radio",
          label: "Choose",
          required: true,
          options: [
            {
              optionId: "o1",
              label: "A",
              value: "A"
            },
            {
              optionId: "o2",
              label: "B",
              value: "B",
              branch: {
                flowId: "flow_b",
                questions: [
                  {
                    questionId: "qb1",
                    type: "text",
                    label: "Why B?",
                    required: true
                  }
                ]
              }
            }
          ]
        },
        {
          questionId: "q2",
          type: "text",
          label: "Done",
          required: false
        }
      ]
    }
  };
}

describe("validateSchema", () => {
  it("accepts a valid branching schema", () => {
    const result = validateSchema(validSchema());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects branches on text questions", () => {
    const schema = validSchema();
    schema.mainFlow.questions[1] = {
      ...schema.mainFlow.questions[1],
      options: [
        {
          optionId: "x",
          label: "Impossible",
          value: "x"
        }
      ]
    };

    const result = validateSchema(schema);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("options not allowed on text"))).toBe(true);
  });

  it("requires deterministic option values", () => {
    const schema = validSchema();
    const question = schema.mainFlow.questions[0];

    if (!question.options) {
      throw new Error("options missing");
    }

    question.options[1] = {
      ...question.options[1],
      value: "A"
    };

    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("must be unique"))).toBe(true);
  });

  it("enforces global questionId uniqueness only in strict mode", () => {
    const schema = validSchema();
    const radio = schema.mainFlow.questions[0];

    if (!radio.options) {
      throw new Error("options missing");
    }

    radio.options[1] = {
      ...radio.options[1],
      branch: {
        flowId: "flow_dup",
        questions: [
          {
            questionId: "q2",
            type: "text",
            label: "Duplicate ID in branch",
            required: false
          }
        ]
      }
    };

    const tolerant = validateSchema(schema);
    expect(tolerant.valid).toBe(true);

    const strict = validateSchema(schema, {
      enforceGlobalQuestionIdUniqueness: true
    });
    expect(strict.valid).toBe(false);
    expect(strict.errors.some((error) => error.includes("globally unique"))).toBe(true);
  });
});
