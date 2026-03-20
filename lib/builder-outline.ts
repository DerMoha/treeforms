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
  isLastChild: boolean;
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
    sourceOptionLabel: string | null,
    isLast: boolean
  ) => {
    nodes.push({
      id: pathKey(path),
      path: path.map((segment) => ({ ...segment })),
      depth,
      title: path.length === 0 ? "Main flow" : `${sourceQuestionLabel ?? "Question"} → ${sourceOptionLabel ?? "Option"}`,
      sourceQuestionLabel,
      sourceOptionLabel,
      questionCount: flow.questions.length,
      isLastChild: isLast
    });

    flow.questions.forEach((question, questionIndex) => {
      const parentQuestionLabel = fallbackQuestionLabel(question.label, questionIndex);

      question.options?.forEach((option, optionIndex, optionArr) => {
        if (!option.branch) {
          return;
        }

        const isLastOption = optionIndex === optionArr.length - 1;

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
          fallbackOptionLabel(option.label, option.value, option.optionId),
          isLastOption
        );
      });
    });
  };

  walkFlow(schema.mainFlow, [], 0, null, null, true);

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
