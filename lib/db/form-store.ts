import { type FormRecord, type FormSchema, type FormVersionRecord, type DraftRecord } from "@/lib/types";
import { getStorage } from "@/lib/db/storage";

export async function initializeWorkspace(workspaceId = "default") {
  return getStorage().forms.initializeWorkspace(workspaceId);
}

export async function createForm(workspaceId: string, title: string) {
  const result = await getStorage().forms.createForm(workspaceId, title);
  
  const form = await getStorage().forms.getFormById(result.formId);
  if (form) {
    await getStorage().audit.writeEvent(workspaceId, "system", "form.created", {
      formId: result.formId,
      title
    });
  }
  
  return result;
}

export async function listForms(workspaceId: string): Promise<FormRecord[]> {
  return getStorage().forms.listForms(workspaceId);
}

export async function getFormById(formId: string): Promise<FormRecord | null> {
  return getStorage().forms.getFormById(formId);
}

export async function getDraft(formId: string): Promise<DraftRecord | null> {
  return getStorage().forms.getDraft(formId);
}

export async function updateDraft(formId: string, schema: FormSchema, actor = "system") {
  const result = await getStorage().forms.updateDraft(formId, schema, actor);
  
  if (result.ok) {
    const form = await getStorage().forms.getFormById(formId);
    if (form) {
      await getStorage().audit.writeEvent(form.workspaceId, actor, "draft.updated", { formId });
    }
  }
  
  return result;
}

export async function listVersions(formId: string): Promise<FormVersionRecord[]> {
  return getStorage().forms.listVersions(formId);
}

export async function getVersionByFormAndNumber(formId: string, versionNumber: number) {
  return getStorage().forms.getVersionByFormAndNumber(formId, versionNumber);
}

export async function getPublishedBySlug(slug: string, version: number) {
  return getStorage().forms.getPublishedBySlug(slug, version);
}

export async function publishDraft(formId: string, actor = "system") {
  const result = await getStorage().forms.publishDraft(formId, actor);
  
  if (result.ok && result.versionNumber) {
    const form = await getStorage().forms.getFormById(formId);
    if (form) {
      await getStorage().audit.writeEvent(form.workspaceId, actor, "form.published", {
        formId,
        version: result.versionNumber
      });
    }
  }
  
  return result;
}
