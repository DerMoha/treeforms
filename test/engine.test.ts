import { describe, expect, it } from "vitest";

import { computeRuntimeCursor, reconcileAnswers, setAnswer, traverseSchema } from "@/lib/engine";
import { type FormSchema } from "@/lib/types";

const schema: FormSchema = {
  schemaVersion: 1,
  formId: "f",
  title: "Branch Test",
  mainFlow: {
    flowId: "main",
    questions: [
      {
        questionId: "q1",
        type: "checkbox",
        label: "Select",
        required: true,
        options: [
          {
            optionId: "a",
            label: "A",
            value: "A",
            branch: {
              flowId: "branch_a",
              questions: [
                {
                  questionId: "qa1",
                  type: "text",
                  label: "A follow-up",
                  required: true
                }
              ]
            }
          },
          {
            optionId: "b",
            label: "B",
            value: "B",
            branch: {
              flowId: "branch_b",
              questions: [
                {
                  questionId: "qb1",
                  type: "radio",
                  label: "B details",
                  required: true,
                  options: [
                    {
                      optionId: "b1",
                      label: "B1",
                      value: "B1",
                      branch: {
                        flowId: "branch_b1",
                        questions: [
                          {
                            questionId: "qb1x",
                            type: "text",
                            label: "Nested",
                            required: true
                          }
                        ]
                      }
                    },
                    {
                      optionId: "b2",
                      label: "B2",
                      value: "B2"
                    }
                  ]
                }
              ]
            }
          }
        ]
      },
      {
        questionId: "q2",
        type: "text",
        label: "After branch",
        required: true
      }
    ]
  }
};

describe("runtime engine", () => {
  it("runs checkbox branches in option order then resumes main flow", () => {
    const answers = {
      q1: {
        questionId: "q1",
        value: ["A", "B"],
        answeredAt: new Date().toISOString(),
        flowPath: []
      }
    };

    const traversal = traverseSchema(schema, answers);
    const order = traversal.sequence.map((entry) => entry.question.questionId);

    expect(order).toEqual(["q1", "qa1", "qb1", "q2"]);
  });

  it("includes nested branch questions and resumes correctly", () => {
    const answers = {
      q1: {
        questionId: "q1",
        value: ["B"],
        answeredAt: new Date().toISOString(),
        flowPath: []
      },
      qb1: {
        questionId: "qb1",
        value: "B1",
        answeredAt: new Date().toISOString(),
        flowPath: ["b"]
      }
    };

    const traversal = traverseSchema(schema, answers);
    const order = traversal.sequence.map((entry) => entry.question.questionId);

    expect(order).toEqual(["q1", "qb1", "qb1x", "q2"]);
  });

  it("prunes stale branch answers after branch-driving change", () => {
    const answers = {
      q1: {
        questionId: "q1",
        value: ["B"],
        answeredAt: new Date().toISOString(),
        flowPath: []
      },
      qb1: {
        questionId: "qb1",
        value: "B2",
        answeredAt: new Date().toISOString(),
        flowPath: ["b"]
      }
    };

    const afterChange = setAnswer(schema, answers, schema.mainFlow.questions[0], ["A"], []);
    const reconciled = reconcileAnswers(schema, afterChange);

    expect(reconciled.answers.qb1).toBeUndefined();
    expect(reconciled.answers.q1.value).toEqual(["A"]);
  });

  it("finds first unanswered after current branch completion", () => {
    const answers = {
      q1: {
        questionId: "q1",
        value: ["A"],
        answeredAt: new Date().toISOString(),
        flowPath: []
      },
      qa1: {
        questionId: "qa1",
        value: "because",
        answeredAt: new Date().toISOString(),
        flowPath: ["a"]
      }
    };

    const cursor = computeRuntimeCursor(schema, answers, "qa1");

    expect(cursor.currentQuestionId).toBe("qa1");
    expect(cursor.questions[cursor.questions.length - 1]?.question.questionId).toBe("q2");
  });
});
