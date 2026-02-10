import { type Flow, type FormSchema, type OptionNode, type QuestionNode } from "@/lib/types";

export interface OptionContext {
  questionId: string;
  questionLabel: string;
  optionId: string;
  optionLabel: string;
  optionValue: string;
}

export interface SchemaLabelIndex {
  questionLabelById: Map<string, string>;
  optionContextByQuestionAndOptionId: Map<string, OptionContext>;
  optionContextByOptionId: Map<string, OptionContext>;
}

export function buildSchemaLabelIndex(schema: FormSchema): SchemaLabelIndex {
  const questionLabelById = new Map<string, string>();
  const optionContextByQuestionAndOptionId = new Map<string, OptionContext>();
  const optionContextByOptionId = new Map<string, OptionContext>();

  const walkFlow = (flow: Flow) => {
    flow.questions.forEach((question, questionIndex) => {
      const questionLabel = normalizeQuestionLabel(question, questionIndex);

      if (!questionLabelById.has(question.questionId)) {
        questionLabelById.set(question.questionId, questionLabel);
      }

      question.options?.forEach((option, optionIndex) => {
        const context: OptionContext = {
          questionId: question.questionId,
          questionLabel,
          optionId: option.optionId,
          optionLabel: normalizeOptionLabel(option, optionIndex),
          optionValue: option.value
        };

        optionContextByQuestionAndOptionId.set(
          questionAndOptionKey(question.questionId, option.optionId),
          context
        );

        if (!optionContextByOptionId.has(option.optionId)) {
          optionContextByOptionId.set(option.optionId, context);
        }

        if (option.branch) {
          walkFlow(option.branch);
        }
      });
    });
  };

  walkFlow(schema.mainFlow);

  return {
    questionLabelById,
    optionContextByQuestionAndOptionId,
    optionContextByOptionId
  };
}

export function getQuestionLabel(index: SchemaLabelIndex, questionId: string) {
  return index.questionLabelById.get(questionId) ?? questionId;
}

export function getOptionContext(
  index: SchemaLabelIndex,
  questionId: string | null,
  optionId: string
) {
  if (questionId) {
    const pairKey = questionAndOptionKey(questionId, optionId);
    const exact = index.optionContextByQuestionAndOptionId.get(pairKey);
    if (exact) {
      return exact;
    }
  }

  return index.optionContextByOptionId.get(optionId) ?? null;
}

export function describeBranchTrace(trace: string[], index: SchemaLabelIndex) {
  return trace.map((entry) => {
    const [questionId, optionId] = entry.split(":");

    if (!questionId || !optionId) {
      return entry;
    }

    const context = getOptionContext(index, questionId, optionId);
    if (!context) {
      return `${getQuestionLabel(index, questionId)} -> ${optionId}`;
    }

    return formatQuestionOption(context.questionLabel, context.optionLabel);
  });
}

export function describeFlowPath(flowPath: string[], index: SchemaLabelIndex): OptionContext[] {
  return flowPath.map((optionId) => {
    const context = getOptionContext(index, null, optionId);

    if (context) {
      return context;
    }

    return {
      questionId: "",
      questionLabel: "Follow-up",
      optionId,
      optionLabel: optionId,
      optionValue: optionId
    };
  });
}

export function formatQuestionOption(questionLabel: string, optionLabel: string) {
  return `${questionLabel} -> ${optionLabel}`;
}

function normalizeQuestionLabel(question: QuestionNode, questionIndex: number) {
  const label = question.label.trim();
  return label || `Question ${questionIndex + 1}`;
}

function normalizeOptionLabel(option: OptionNode, optionIndex: number) {
  const label = option.label.trim();
  if (label) {
    return label;
  }

  const value = option.value.trim();
  if (value) {
    return value;
  }

  return `Option ${optionIndex + 1}`;
}

function questionAndOptionKey(questionId: string, optionId: string) {
  return `${questionId}:${optionId}`;
}
