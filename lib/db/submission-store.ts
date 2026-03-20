import { type FormSchema, type SessionState } from "@/lib/types";
import { getStorage, type SubmissionFilterInput } from "@/lib/db/storage";

export type { SubmissionFilterInput } from "@/lib/db/storage";

export async function persistCompletedSubmission(session: SessionState, schema: FormSchema) {
  return (await getStorage()).submissions.persistCompletedSubmission(session, schema);
}

export async function getSubmissionById(workspaceId: string, formId: string, submissionId: string) {
  return (await getStorage()).submissions.getSubmissionById(workspaceId, formId, submissionId);
}

export async function listSubmissionsForForm(
  workspaceId: string,
  formId: string,
  filters: SubmissionFilterInput
) {
  return (await getStorage()).submissions.listSubmissionsForForm(workspaceId, formId, filters);
}
