import { describe, expect, it } from "vitest";

import { buildFlowOutline, pathKey } from "@/lib/builder-outline";
import { type FormSchema } from "@/lib/types";

const schema: FormSchema = {
  schemaVersion: 1,
  formId: "form_outline",
  title: "Outline Test",
  mainFlow: {
    flowId: "main",
    questions: [
      {
        questionId: "q1",
        type: "radio",
        label: "",
        required: true,
        options: [
          {
            optionId: "opt_a",
            label: "Alpha",
            value: "alpha",
            branch: {
              flowId: "flow_alpha",
              questions: [
                {
                  questionId: "qa1",
                  type: "radio",
                  label: "Alpha detail",
                  required: true,
                  options: [
                    {
                      optionId: "qa1x",
                      label: "",
                      value: "nested",
                      branch: {
                        flowId: "flow_nested",
                        questions: [
                          {
                            questionId: "qn1",
                            type: "text",
                            label: "Nested follow-up",
                            required: true
                          }
                        ]
                      }
                    }
                  ]
                },
                {
                  questionId: "qa2",
                  type: "text",
                  label: "",
                  required: false
                }
              ]
            }
          },
          {
            optionId: "opt_b",
            label: "",
            value: "beta",
            branch: {
              flowId: "flow_beta",
              questions: [
                {
                  questionId: "qb1",
                  type: "text",
                  label: "Beta detail",
                  required: true
                }
              ]
            }
          }
        ]
      },
      {
        questionId: "q2",
        type: "checkbox",
        label: "Second",
        required: false,
        options: [
          {
            optionId: "opt_c",
            label: "",
            value: "",
            branch: {
              flowId: "flow_c",
              questions: [
                {
                  questionId: "qc1",
                  type: "number",
                  label: "Amount",
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

describe("builder outline", () => {
  it("builds deterministic depth-first flow order", () => {
    const outline = buildFlowOutline(schema);

    expect(outline.map((node) => node.id)).toEqual([
      "main",
      "q1:opt_a",
      "q1:opt_a>qa1:qa1x",
      "q1:opt_b",
      "q2:opt_c"
    ]);
  });

  it("builds stable path keys and depth values", () => {
    const nestedPath = [
      { questionId: "q1", optionId: "opt_a" },
      { questionId: "qa1", optionId: "qa1x" }
    ];

    expect(pathKey([])).toBe("main");
    expect(pathKey(nestedPath)).toBe("q1:opt_a>qa1:qa1x");

    const outline = buildFlowOutline(schema);
    const nested = outline.find((node) => node.id === "q1:opt_a>qa1:qa1x");

    expect(nested?.depth).toBe(2);
    expect(nested?.path).toEqual(nestedPath);
  });

  it("uses fallback labels for missing question and option labels", () => {
    const outline = buildFlowOutline(schema);

    const betaBranch = outline.find((node) => node.id === "q1:opt_b");
    expect(betaBranch?.sourceQuestionLabel).toBe("Question 1");
    expect(betaBranch?.sourceOptionLabel).toBe("beta");

    const q2Branch = outline.find((node) => node.id === "q2:opt_c");
    expect(q2Branch?.sourceQuestionLabel).toBe("Second");
    expect(q2Branch?.sourceOptionLabel).toBe("opt_c");
  });

  it("reports question counts for each flow node", () => {
    const outline = buildFlowOutline(schema);

    const countById = new Map(outline.map((node) => [node.id, node.questionCount]));

    expect(countById.get("main")).toBe(2);
    expect(countById.get("q1:opt_a")).toBe(2);
    expect(countById.get("q1:opt_a>qa1:qa1x")).toBe(1);
    expect(countById.get("q1:opt_b")).toBe(1);
    expect(countById.get("q2:opt_c")).toBe(1);
  });
});
