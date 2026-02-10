import { type BranchPathSegment } from "@/lib/builder-utils";
import { type FormSchema } from "@/lib/types";

export interface FlowOutlineNode {
  id: string;
  path: BranchPathSegment[];
  depth: number;
  title: string;
  sourceQuestionLabel: string | null;
  sourceOptionLabel: string | null;
  questionCount: number;
}

export function pathKey(path: BranchPathSegment[]): string {
  if (path.length === 0) {
    return "main";
  }

  return path.map((segment) => `${segment.questionId}:${segment.optionId}`).join(">");
}

export function buildFlowOutline(schema: FormSchema): FlowOutlineNode[] {
  const nodes: FlowOutlineNode[] = [];

  const walkFlow = (
    flow: FormSchema["mainFlow"],
    path: BranchPathSegment[],
    depth: number,
    sourceQuestionLabel: string | null,
    sourceOptionLabel: string | null
  ) => {
    nodes.push({
      id: pathKey(path),
      path: path.map((segment) => ({ ...segment })),
      depth,
      title: path.length === 0 ? "Main flow" : `Follow-up: ${sourceOptionLabel ?? "Branch"}`,
      sourceQuestionLabel,
      sourceOptionLabel,
      questionCount: flow.questions.length
    });

    flow.questions.forEach((question, questionIndex) => {
      const parentQuestionLabel = fallbackQuestionLabel(question.label, questionIndex);

      question.options?.forEach((option) => {
        if (!option.branch) {
          return;
        }

        walkFlow(
          option.branch,
          [
            ...path,
            {
              questionId: question.questionId,
              optionId: option.optionId
            }
          ],
          depth + 1,
          parentQuestionLabel,
          fallbackOptionLabel(option.label, option.value, option.optionId)
        );
      });
    });
  };

  walkFlow(schema.mainFlow, [], 0, null, null);

  return nodes;
}

function fallbackQuestionLabel(label: string, questionIndex: number) {
  const normalized = label.trim();
  return normalized || `Question ${questionIndex + 1}`;
}

function fallbackOptionLabel(label: string, value: string, optionId: string) {
  const normalizedLabel = label.trim();
  if (normalizedLabel) {
    return normalizedLabel;
  }

  const normalizedValue = value.trim();
  if (normalizedValue) {
    return normalizedValue;
  }

  return optionId;
}
