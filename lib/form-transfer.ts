import { makeId } from "@/lib/ids";
import { validateSchema } from "@/lib/schema";
import { type FormSchema } from "@/lib/types";

export interface PrepareImportedSchemaOptions {
  targetFormId: string;
  fallbackTitle: string;
}

export type PrepareImportedSchemaResult =
  | {
      ok: true;
      schema: FormSchema;
      warnings: string[];
      errors: [];
    }
  | {
      ok: false;
      warnings: string[];
      errors: string[];
    };

export function prepareImportedSchema(
  raw: unknown,
  options: PrepareImportedSchemaOptions
): PrepareImportedSchemaResult {
  const warnings: string[] = [];
  const fallbackTitle = options.fallbackTitle.trim() || "Imported Form";

  if (!isRecord(raw)) {
    return failure(["Payload must be a JSON object"], warnings);
  }

  const candidate = structuredClone(raw) as Record<string, unknown>;

  if (candidate.schemaVersion === undefined) {
    candidate.schemaVersion = 1;
    warnings.push("schemaVersion was missing and defaulted to 1.");
  }

  const rawTitle = typeof candidate.title === "string" ? candidate.title : "";
  if (!rawTitle.trim()) {
    candidate.title = fallbackTitle;
    warnings.push(`title was missing and defaulted to "${fallbackTitle}".`);
  } else {
    candidate.title = rawTitle;
  }

  if (candidate.formId !== options.targetFormId) {
    warnings.push(`formId was set to "${options.targetFormId}".`);
  }
  candidate.formId = options.targetFormId;

  if (!isRecord(candidate.mainFlow)) {
    return failure(["mainFlow must be an object"], warnings);
  }

  if (!Array.isArray(candidate.mainFlow.questions)) {
    return failure(["mainFlow.questions must be an array"], warnings);
  }

  const structuralErrors = validateFlowShape(candidate.mainFlow, "mainFlow");
  if (structuralErrors.length > 0) {
    return failure(structuralErrors, warnings);
  }

  normalizeFlow(candidate.mainFlow, "mainFlow", warnings);
  normalizeDuplicateQuestionIds(candidate.mainFlow, "mainFlow", warnings);

  const schema = candidate as unknown as FormSchema;
  const validation = validateSchema(schema, {
    enforceGlobalQuestionIdUniqueness: true
  });

  if (!validation.valid) {
    return failure(validation.errors, warnings);
  }

  return {
    ok: true,
    schema,
    warnings,
    errors: []
  };
}

function validateFlowShape(flow: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  const questions = flow.questions;

  if (!Array.isArray(questions)) {
    errors.push(`${path}.questions must be an array`);
    return errors;
  }

  questions.forEach((question, questionIndex) => {
    const questionPath = `${path}.questions[${questionIndex}]`;

    if (!isRecord(question)) {
      errors.push(`${questionPath} must be an object`);
      return;
    }

    if (question.options === undefined) {
      return;
    }

    if (!Array.isArray(question.options)) {
      errors.push(`${questionPath}.options must be an array when provided`);
      return;
    }

    question.options.forEach((option, optionIndex) => {
      const optionPath = `${questionPath}.options[${optionIndex}]`;

      if (!isRecord(option)) {
        errors.push(`${optionPath} must be an object`);
        return;
      }

      if (option.branch === undefined) {
        return;
      }

      if (!isRecord(option.branch)) {
        errors.push(`${optionPath}.branch must be an object when provided`);
        return;
      }

      if (!Array.isArray(option.branch.questions)) {
        errors.push(`${optionPath}.branch.questions must be an array`);
        return;
      }

      errors.push(...validateFlowShape(option.branch, `${optionPath}.branch`));
    });
  });

  return errors;
}

function normalizeFlow(flow: Record<string, unknown>, path: string, warnings: string[]) {
  if (!hasNonEmptyString(flow.flowId)) {
    flow.flowId = makeId("flow");
    warnings.push(`${path}.flowId was missing and generated.`);
  }

  const questions = flow.questions;
  if (!Array.isArray(questions)) {
    return;
  }

  questions.forEach((question, questionIndex) => {
    if (!isRecord(question)) {
      return;
    }

    const questionPath = `${path}.questions[${questionIndex}]`;
    if (!hasNonEmptyString(question.questionId)) {
      question.questionId = makeId("q");
      warnings.push(`${questionPath}.questionId was missing and generated.`);
    }

    if (!Array.isArray(question.options)) {
      return;
    }

    question.options.forEach((option, optionIndex) => {
      if (!isRecord(option)) {
        return;
      }

      const optionPath = `${questionPath}.options[${optionIndex}]`;

      if (!hasNonEmptyString(option.optionId)) {
        option.optionId = makeId("opt");
        warnings.push(`${optionPath}.optionId was missing and generated.`);
      }

      const optionId = String(option.optionId);
      if (!hasNonEmptyString(option.value)) {
        const labelValue = typeof option.label === "string" ? option.label.trim() : "";
        option.value = labelValue || optionId;
        warnings.push(`${optionPath}.value was missing and defaulted.`);
      }

      if (!isRecord(option.branch)) {
        return;
      }

      normalizeFlow(option.branch, `${optionPath}.branch`, warnings);
    });
  });
}

function normalizeDuplicateQuestionIds(
  flow: Record<string, unknown>,
  path: string,
  warnings: string[],
  seen = new Map<string, string>()
) {
  const questions = flow.questions;
  if (!Array.isArray(questions)) {
    return;
  }

  questions.forEach((question, questionIndex) => {
    if (!isRecord(question)) {
      return;
    }

    const questionPath = `${path}.questions[${questionIndex}]`;
    const questionId = typeof question.questionId === "string" ? question.questionId.trim() : "";

    if (questionId) {
      const firstPath = seen.get(questionId);

      if (firstPath) {
        const replacementId = nextUniqueQuestionId(seen);
        question.questionId = replacementId;
        seen.set(replacementId, questionPath);
        warnings.push(
          `${questionPath}.questionId duplicated "${questionId}" (first at ${firstPath}.questionId) and was changed to "${replacementId}".`
        );
      } else {
        seen.set(questionId, questionPath);
      }
    }

    if (!Array.isArray(question.options)) {
      return;
    }

    question.options.forEach((option, optionIndex) => {
      if (!isRecord(option) || !isRecord(option.branch)) {
        return;
      }

      normalizeDuplicateQuestionIds(
        option.branch,
        `${questionPath}.options[${optionIndex}].branch`,
        warnings,
        seen
      );
    });
  });
}

function nextUniqueQuestionId(seen: Map<string, string>) {
  let candidate = makeId("q");

  while (seen.has(candidate)) {
    candidate = makeId("q");
  }

  return candidate;
}

function failure(errors: string[], warnings: string[]): PrepareImportedSchemaResult {
  return {
    ok: false,
    errors,
    warnings
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
