import {
  getDraft,
  getFormById,
  getPublishedBySlug,
  getVersionByFormAndNumber,
  listVersions
} from "@/lib/db/app-store";
import { validateSchema } from "@/lib/schema";
import { type FormSchema } from "@/lib/types";

export async function getFormBundle(formId: string) {
  const [form, draft, versions] = await Promise.all([
    getFormById(formId),
    getDraft(formId),
    listVersions(formId)
  ]);

  if (!form || !draft) {
    return null;
  }

  const schema = parseSchema(draft.schemaJson);

  return {
    form,
    draft,
    schema,
    versions: versions.map((version) => ({
      ...version,
      schema: parseSchema(version.schemaJson)
    }))
  };
}

export async function getFormBundleForWorkspace(formId: string, workspaceId: string) {
  const bundle = await getFormBundle(formId);

  if (!bundle || bundle.form.workspaceId !== workspaceId) {
    return null;
  }

  return bundle;
}

export async function getPublishedSchemaBySlugAndVersion(slug: string, versionNumber: number) {
  const published = await getPublishedBySlug(slug, versionNumber);

  if (!published) {
    return null;
  }

  const schema = parseSchema(published.schemaJson);

  return {
    ...published,
    schema
  };
}

export async function getPublishedSchemaByFormAndVersion(formId: string, versionNumber: number) {
  const version = await getVersionByFormAndNumber(formId, versionNumber);

  if (!version) {
    return null;
  }

  return {
    ...version,
    schema: parseSchema(version.schemaJson)
  };
}

function parseSchema(json: string): FormSchema {
  const schema = JSON.parse(json) as FormSchema;
  const validation = validateSchema(schema);

  if (!validation.valid) {
    throw new Error(`Stored schema is invalid: ${validation.errors.join("; ")}`);
  }

  return schema;
}
