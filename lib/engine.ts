import {
  type AnswerFact,
  type AnswerRaw,
  type AnswerValue,
  type FormSchema,
  type OptionNode,
  type QuestionNode,
  type RuntimeCursor,
  type RuntimeQuestion,
  type StoredAnswer
} from "@/lib/types";
import { collectQuestions } from "@/lib/schema";

export class RuntimeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeValidationError";
  }
}

interface TraversalResult {
  sequence: RuntimeQuestion[];
  reachableQuestionIds: Set<string>;
  branchTrace: string[];
}

export function computeRuntimeCursor(
  schema: FormSchema,
  answers: Record<string, StoredAnswer>,
  currentQuestionId: string | null
): RuntimeCursor {
  const traversal = traverseSchema(schema, answers);

  let activeQuestionId = currentQuestionId;

  if (activeQuestionId && !traversal.reachableQuestionIds.has(activeQuestionId)) {
    activeQuestionId = null;
  }

  if (!activeQuestionId) {
    activeQuestionId = findFirstUnanswered(traversal.sequence, answers);
  }

  return {
    questions: traversal.sequence,
    currentQuestionId: activeQuestionId
  };
}

export function traverseSchema(
  schema: FormSchema,
  answers: Record<string, StoredAnswer>
): TraversalResult {
  const sequence: RuntimeQuestion[] = [];
  const reachableQuestionIds = new Set<string>();
  const branchTrace: string[] = [];
  const visitedFlows = new Set<string>();

  const walkFlow = (flow: FormSchema["mainFlow"], flowPath: string[]) => {
    const flowKey = flowPath.join("/") || "root";
    if (visitedFlows.has(flowKey)) {
      return;
    }
    visitedFlows.add(flowKey);

    for (const question of flow.questions) {
      if (reachableQuestionIds.has(question.questionId)) {
        continue;
      }

      sequence.push({
        question,
        index: sequence.length,
        flowPath
      });
      reachableQuestionIds.add(question.questionId);

      if (!question.options?.length) {
        continue;
      }

      const answer = answers[question.questionId];
      if (!answer) {
        continue;
      }

      const matchedOptions = selectedBranchOptions(question, answer.value);
      for (const option of matchedOptions) {
        if (!option.branch) {
          continue;
        }
        branchTrace.push(`${question.questionId}:${option.optionId}`);
        walkFlow(option.branch, [...flowPath, option.optionId]);
      }
    }
  };

  walkFlow(schema.mainFlow, []);

  return {
    sequence,
    reachableQuestionIds,
    branchTrace
  };
}

export function reconcileAnswers(
  schema: FormSchema,
  answers: Record<string, StoredAnswer>
): {
  answers: Record<string, StoredAnswer>;
  branchTrace: string[];
} {
  const sanitized = sanitizeAnswerMap(schema, answers);
  const traversal = traverseSchema(schema, sanitized);
  const pruned: Record<string, StoredAnswer> = {};

  for (const [questionId, answer] of Object.entries(sanitized)) {
    if (traversal.reachableQuestionIds.has(questionId)) {
      pruned[questionId] = answer;
    }
  }

  return {
    answers: pruned,
    branchTrace: traversal.branchTrace
  };
}

export function setAnswer(
  schema: FormSchema,
  answers: Record<string, StoredAnswer>,
  question: QuestionNode,
  value: unknown,
  flowPath: string[]
): Record<string, StoredAnswer> {
  const normalized = normalizeInputAnswer(question, value);

  return {
    ...answers,
    [question.questionId]: {
      questionId: question.questionId,
      value: normalized,
      answeredAt: new Date().toISOString(),
      flowPath
    }
  };
}

const QUESTION_HANDLERS: Record<
  string,
  {
    normalize: (question: QuestionNode, raw: unknown) => AnswerValue;
    getBranchOptions: (question: QuestionNode, value: AnswerValue) => OptionNode[];
    generateFacts: (question: QuestionNode, answer: StoredAnswer, flowPath: string) => AnswerFact[];
  }
> = {
  radio: {
    normalize: (question, raw) => {
      if (typeof raw !== "string") {
        throw new RuntimeValidationError("Radio answers must be a string");
      }
      const allowedValues = new Set(question.options?.map((option) => option.value) ?? []);
      if (!allowedValues.has(raw)) {
        throw new RuntimeValidationError("Invalid radio option value");
      }
      return raw;
    },
    getBranchOptions: (question, value) => {
      if (typeof value !== "string" || !question.options) {
        return [];
      }
      const option = question.options.find((entry) => entry.value === value);
      return option ? [option] : [];
    },
    generateFacts: (question, answer, flowPath) => {
      const option = question.options?.find((entry) => entry.value === answer.value);
      return [
        {
          questionId: answer.questionId,
          questionType: question.type,
          optionId: option?.optionId ?? null,
          textValue: typeof answer.value === "string" ? answer.value : null,
          numberValue: null,
          flowPath,
          answeredAt: answer.answeredAt
        }
      ];
    }
  },
  checkbox: {
    normalize: (question, raw) => {
      if (!Array.isArray(raw)) {
        throw new RuntimeValidationError("Checkbox answers must be an array");
      }
      const allowedValues = new Set(question.options?.map((option) => option.value) ?? []);
      const unique = Array.from(
        new Set(
          raw.map((entry) => {
            if (typeof entry !== "string") {
              throw new RuntimeValidationError("Checkbox array values must be strings");
            }
            return entry;
          })
        )
      );
      for (const value of unique) {
        if (!allowedValues.has(value)) {
          throw new RuntimeValidationError("Invalid checkbox option value");
        }
      }
      return unique;
    },
    getBranchOptions: (question, value) => {
      if (!Array.isArray(value) || !question.options) {
        return [];
      }
      const selected = new Set(value);
      return question.options.filter((option) => selected.has(option.value));
    },
    generateFacts: (question, answer, flowPath) => {
      const selectedValues = Array.isArray(answer.value) ? answer.value : [];
      return selectedValues.map((selected) => {
        const option = question.options?.find((entry) => entry.value === selected);
        return {
          questionId: answer.questionId,
          questionType: question.type,
          optionId: option?.optionId ?? null,
          textValue: String(selected),
          numberValue: null,
          flowPath,
          answeredAt: answer.answeredAt
        };
      });
    }
  },
  text: {
    normalize: (question, raw) => {
      if (typeof raw !== "string") {
        throw new RuntimeValidationError("Text answers must be a string");
      }
      const value = raw.trim();
      const minLen = question.validation?.minLen;
      const maxLen = question.validation?.maxLen;
      if (minLen !== undefined && value.length < minLen) {
        throw new RuntimeValidationError(`Text answer must be at least ${minLen} characters`);
      }
      if (maxLen !== undefined && value.length > maxLen) {
        throw new RuntimeValidationError(`Text answer must be at most ${maxLen} characters`);
      }
      return value;
    },
    getBranchOptions: () => [],
    generateFacts: (question, answer, flowPath) => [
      {
        questionId: answer.questionId,
        questionType: question.type,
        optionId: null,
        textValue: typeof answer.value === "string" ? answer.value : null,
        numberValue: null,
        flowPath,
        answeredAt: answer.answeredAt
      }
    ]
  },
  number: {
    normalize: (question, raw) => {
      if (typeof raw !== "number" || Number.isNaN(raw)) {
        throw new RuntimeValidationError("Number answers must be numeric");
      }
      const min = question.validation?.min;
      const max = question.validation?.max;
      if (min !== undefined && raw < min) {
        throw new RuntimeValidationError(`Number answer must be >= ${min}`);
      }
      if (max !== undefined && raw > max) {
        throw new RuntimeValidationError(`Number answer must be <= ${max}`);
      }
      return raw;
    },
    getBranchOptions: () => [],
    generateFacts: (question, answer, flowPath) => [
      {
        questionId: answer.questionId,
        questionType: question.type,
        optionId: null,
        textValue: null,
        numberValue: typeof answer.value === "number" ? answer.value : null,
        flowPath,
        answeredAt: answer.answeredAt
      }
    ]
  }
};

export function normalizeInputAnswer(question: QuestionNode, raw: unknown): AnswerValue {
  const handler = QUESTION_HANDLERS[question.type] || QUESTION_HANDLERS.number;
  return handler.normalize(question, raw);
}

function selectedBranchOptions(question: QuestionNode, value: AnswerValue): OptionNode[] {
  const handler = QUESTION_HANDLERS[question.type];
  return handler ? handler.getBranchOptions(question, value) : [];
}

export function findFirstUnanswered(
  sequence: RuntimeQuestion[],
  answers: Record<string, StoredAnswer>,
  startIndex = 0
): string | null {
  for (let index = startIndex; index < sequence.length; index += 1) {
    const entry = sequence[index];
    if (!answers[entry.question.questionId]) {
      return entry.question.questionId;
    }
  }

  return null;
}

export function findQuestionInSequence(
  sequence: RuntimeQuestion[],
  questionId: string | null
): RuntimeQuestion | null {
  if (!questionId) {
    return null;
  }

  return sequence.find((entry) => entry.question.questionId === questionId) ?? null;
}

export function findAdjacentQuestionId(
  sequence: RuntimeQuestion[],
  currentQuestionId: string | null,
  direction: "back" | "forward"
): string | null {
  if (sequence.length === 0) {
    return null;
  }

  if (!currentQuestionId) {
    return direction === "back"
      ? sequence[sequence.length - 1]?.question.questionId ?? null
      : sequence[0]?.question.questionId ?? null;
  }

  const currentIndex = sequence.findIndex((entry) => entry.question.questionId === currentQuestionId);

  if (currentIndex === -1) {
    return null;
  }

  const targetIndex = direction === "back" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= sequence.length) {
    return null;
  }

  return sequence[targetIndex].question.questionId;
}

export function questionFacts(
  schema: FormSchema,
  answers: Record<string, StoredAnswer>
): {
  raw: AnswerRaw[];
  facts: AnswerFact[];
} {
  const questions = collectQuestions(schema);
  const raw: AnswerRaw[] = [];
  const facts: AnswerFact[] = [];

  for (const answer of Object.values(answers)) {
    const question = questions.get(answer.questionId);
    if (!question) {
      continue;
    }

    const flowPath = answer.flowPath.join("/");

    raw.push({
      questionId: answer.questionId,
      answerJson: JSON.stringify(answer.value),
      answeredAt: answer.answeredAt,
      flowPath
    });

    const handler = QUESTION_HANDLERS[question.type] || QUESTION_HANDLERS.number;
    facts.push(...handler.generateFacts(question, answer, flowPath));
  }

  return {
    raw,
    facts
  };
}

function sanitizeAnswerMap(
  schema: FormSchema,
  answers: Record<string, StoredAnswer>
): Record<string, StoredAnswer> {
  const questions = collectQuestions(schema);
  const sanitized: Record<string, StoredAnswer> = {};

  for (const [questionId, answer] of Object.entries(answers)) {
    const question = questions.get(questionId);

    if (!question) {
      continue;
    }

    try {
      const normalized = normalizeInputAnswer(question, answer.value);
      sanitized[questionId] = {
        ...answer,
        value: normalized,
        flowPath: Array.isArray(answer.flowPath) ? answer.flowPath : []
      };
    } catch {
      continue;
    }
  }

  return sanitized;
}
