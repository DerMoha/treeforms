import { type FormRecord, type FormSchema, type FormVersionRecord, type DraftRecord } from "@/lib/types";
import { getStorage } from "@/lib/db/storage";

export async function initializeWorkspace(workspaceId = "default") {
  return (await getStorage()).forms.initializeWorkspace(workspaceId);
}

export async function createForm(workspaceId: string, title: string) {
  const storage = await getStorage();
  const result = await storage.forms.createForm(workspaceId, title);

  const form = await storage.forms.getFormById(result.formId);
  if (form) {
    await storage.audit.writeEvent(workspaceId, "system", "form.created", {
      formId: result.formId,
      title
    });
  }

  return result;
}

export async function listForms(workspaceId: string): Promise<FormRecord[]> {
  return (await getStorage()).forms.listForms(workspaceId);
}

export async function getFormById(formId: string): Promise<FormRecord | null> {
  return (await getStorage()).forms.getFormById(formId);
}

export async function getDraft(formId: string): Promise<DraftRecord | null> {
  return (await getStorage()).forms.getDraft(formId);
}

export async function updateDraft(formId: string, schema: FormSchema, actor = "system") {
  const storage = await getStorage();
  const result = await storage.forms.updateDraft(formId, schema, actor);

  if (result.ok) {
    const form = await storage.forms.getFormById(formId);
    if (form) {
      await storage.audit.writeEvent(form.workspaceId, actor, "draft.updated", { formId });
    }
  }

  return result;
}

export async function listVersions(formId: string): Promise<FormVersionRecord[]> {
  return (await getStorage()).forms.listVersions(formId);
}

export async function getVersionByFormAndNumber(formId: string, versionNumber: number) {
  return (await getStorage()).forms.getVersionByFormAndNumber(formId, versionNumber);
}

export async function getPublishedBySlug(slug: string, version: number) {
  return (await getStorage()).forms.getPublishedBySlug(slug, version);
}

export async function publishDraft(formId: string, actor = "system") {
  const storage = await getStorage();
  const result = await storage.forms.publishDraft(formId, actor);

  if (result.ok && result.versionNumber) {
    const form = await storage.forms.getFormById(formId);
    if (form) {
      await storage.audit.writeEvent(form.workspaceId, actor, "form.published", {
        formId,
        version: result.versionNumber
      });
    }
  }

  return result;
}
