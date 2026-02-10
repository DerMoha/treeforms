import { getFormBundle } from "@/lib/server/forms";
import { jsonError } from "@/lib/server/http";

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

    return new Response(`${JSON.stringify(bundle.schema, null, 2)}\n`, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=\"${bundle.form.slug}-draft.json\"`
      }
    });
  } catch (error) {
    return jsonError("Unable to export form JSON", 500, String(error));
  }
}
