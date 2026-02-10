import { jsonError, jsonOk } from "@/lib/server/http";
import { getFormBundle } from "@/lib/server/forms";

export async function GET(
  _request: Request,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    const bundle = await getFormBundle(formId);

    if (!bundle) {
      return jsonError("Form not found", 404);
    }

    return jsonOk({
      form: bundle.form,
      draft: {
        ...bundle.draft,
        schema: bundle.schema
      },
      versions: bundle.versions
    });
  } catch (error) {
    return jsonError("Unable to fetch form", 500, String(error));
  }
}
