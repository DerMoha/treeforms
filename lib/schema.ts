import {
  type Flow,
  type FormSchema,
  type OptionNode,
  type QuestionNode,
  type QuestionType
} from "@/lib/types";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const BRANCHABLE_TYPES: QuestionType[] = ["radio", "checkbox"];

export function createEmptySchema(formId: string, title: string): FormSchema {
  return {
    schemaVersion: 1,
    formId,
    title,
    mainFlow: {
      flowId: `${formId}_main`,
      questions: []
    }
  };
}

export function validateSchema(schema: FormSchema): SchemaValidationResult {
  const errors: string[] = [];

  if (schema.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }

  if (!schema.formId.trim()) {
    errors.push("formId is required");
  }

  if (!schema.title.trim()) {
    errors.push("title is required");
  }

  validateFlow(schema.mainFlow, errors, "mainFlow");

  return {
    valid: errors.length === 0,
    errors
  };
}

export function collectQuestions(schema: FormSchema) {
  const map = new Map<string, QuestionNode>();

  const walkFlow = (flow: Flow) => {
    for (const question of flow.questions) {
      map.set(question.questionId, question);

      if (question.options) {
        for (const option of question.options) {
          if (option.branch) {
            walkFlow(option.branch);
          }
        }
      }
    }
  };

  walkFlow(schema.mainFlow);

  return map;
}

export function findQuestionById(schema: FormSchema, questionId: string): QuestionNode | null {
  return collectQuestions(schema).get(questionId) ?? null;
}

function validateFlow(flow: Flow, errors: string[], path: string) {
  if (!flow.flowId.trim()) {
    errors.push(`${path}.flowId is required`);
  }

  const seenQuestions = new Set<string>();

  flow.questions.forEach((question, qIndex) => {
    const qPath = `${path}.questions[${qIndex}]`;

    if (!question.questionId.trim()) {
      errors.push(`${qPath}.questionId is required`);
    }

    if (seenQuestions.has(question.questionId)) {
      errors.push(`${qPath}.questionId must be unique within a flow`);
    }

    seenQuestions.add(question.questionId);

    if (!question.label.trim()) {
      errors.push(`${qPath}.label is required`);
    }

    if (!isQuestionType(question.type)) {
      errors.push(`${qPath}.type must be radio, checkbox, text, or number`);
    }

    if (BRANCHABLE_TYPES.includes(question.type)) {
      validateBranchableQuestion(question, errors, qPath);
    } else {
      if (question.options && question.options.length > 0) {
        errors.push(`${qPath}.options not allowed on ${question.type}`);
      }
    }

    validateQuestionValidation(question, errors, qPath);
  });
}

function validateBranchableQuestion(question: QuestionNode, errors: string[], path: string) {
  if (!question.options || question.options.length === 0) {
    errors.push(`${path}.options must include at least one option`);
    return;
  }

  const seenOptionIds = new Set<string>();
  const seenValues = new Set<string>();

  question.options.forEach((option: OptionNode, optionIndex: number) => {
    const optionPath = `${path}.options[${optionIndex}]`;

    if (!option.optionId.trim()) {
      errors.push(`${optionPath}.optionId is required`);
    }

    if (seenOptionIds.has(option.optionId)) {
      errors.push(`${optionPath}.optionId must be unique`);
    }

    seenOptionIds.add(option.optionId);

    if (!option.label.trim()) {
      errors.push(`${optionPath}.label is required`);
    }

    if (!option.value.trim()) {
      errors.push(`${optionPath}.value is required`);
    }

    if (seenValues.has(option.value)) {
      errors.push(`${optionPath}.value must be unique for deterministic selection`);
    }

    seenValues.add(option.value);

    if (option.branch) {
      validateFlow(option.branch, errors, `${optionPath}.branch`);
    }
  });
}

function validateQuestionValidation(question: QuestionNode, errors: string[], path: string) {
  const rule = question.validation;

  if (!rule) {
    return;
  }

  if (question.type === "number") {
    if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) {
      errors.push(`${path}.validation.min cannot exceed max`);
    }
    return;
  }

  if (question.type === "text") {
    if (rule.minLen !== undefined && rule.maxLen !== undefined && rule.minLen > rule.maxLen) {
      errors.push(`${path}.validation.minLen cannot exceed maxLen`);
    }
    return;
  }

  if (rule.min !== undefined || rule.max !== undefined || rule.minLen !== undefined || rule.maxLen !== undefined) {
    errors.push(`${path}.validation supports numeric bounds for number and length bounds for text only`);
  }
}

function isQuestionType(value: string): value is QuestionType {
  return value === "radio" || value === "checkbox" || value === "text" || value === "number";
}
