import { makeId } from "@/lib/ids";
import { type Flow, type FormSchema, type OptionNode, type QuestionNode, type QuestionType } from "@/lib/types";

export interface BranchPathSegment {
  questionId: string;
  optionId: string;
}

export function makeQuestion(type: QuestionType = "radio"): QuestionNode {
  const questionId = makeId("q");

  const base: QuestionNode = {
    questionId,
    type,
    label: "",
    required: true
  };

  if (type === "radio" || type === "checkbox") {
    base.options = [makeOption(), makeOption()];
  }

  return base;
}

export function makeOption(): OptionNode {
  return {
    optionId: makeId("opt"),
    label: "",
    value: makeId("val")
  };
}

export function makeFlow(flowIdPrefix = "flow"): Flow {
  return {
    flowId: makeId(flowIdPrefix),
    questions: []
  };
}

export function getFlowByPath(schema: FormSchema, path: BranchPathSegment[]): Flow | null {
  let currentFlow: Flow = schema.mainFlow;

  for (const segment of path) {
    const question = currentFlow.questions.find((entry) => entry.questionId === segment.questionId);

    if (!question?.options) {
      return null;
    }

    const option = question.options.find((entry) => entry.optionId === segment.optionId);
    if (!option) {
      return null;
    }

    if (!option.branch) {
      return null;
    }

    currentFlow = option.branch;
  }

  return currentFlow;
}

export function updateFlowByPath(
  schema: FormSchema,
  path: BranchPathSegment[],
  updater: (flow: Flow) => void
): FormSchema {
  const next = structuredClone(schema) as FormSchema;

  const flow = ensureFlowByPath(next, path);
  updater(flow);

  return next;
}

export function ensureFlowByPath(schema: FormSchema, path: BranchPathSegment[]): Flow {
  let currentFlow: Flow = schema.mainFlow;

  for (const segment of path) {
    const question = currentFlow.questions.find((entry) => entry.questionId === segment.questionId);
    if (!question || !question.options) {
      throw new Error("Invalid branch path");
    }

    const option = question.options.find((entry) => entry.optionId === segment.optionId);
    if (!option) {
      throw new Error("Invalid branch option path");
    }

    if (!option.branch) {
      option.branch = makeFlow("branch");
    }

    currentFlow = option.branch;
  }

  return currentFlow;
}

export function findQuestionInPathFlow(
  schema: FormSchema,
  path: BranchPathSegment[],
  questionId: string
): QuestionNode | null {
  const flow = getFlowByPath(schema, path);
  if (!flow) {
    return null;
  }

  return flow.questions.find((entry) => entry.questionId === questionId) ?? null;
}

export function updateQuestionType(question: QuestionNode, nextType: QuestionType): QuestionNode {
  const updated = {
    ...question,
    type: nextType
  };

  if (nextType === "radio" || nextType === "checkbox") {
    updated.options = question.options?.length ? question.options : [makeOption(), makeOption()];
  } else {
    delete updated.options;
  }

  return updated;
}

export function returnTargetLabel(schema: FormSchema, sourceQuestionId: string): string {
  const mainQuestions = schema.mainFlow.questions;
  const index = mainQuestions.findIndex((entry) => entry.questionId === sourceQuestionId);

  if (index === -1) {
    return "Main flow";
  }

  const next = mainQuestions[index + 1];
  if (!next) {
    return "Form end";
  }

  return next.label.trim() || `Question ${index + 2}`;
}
