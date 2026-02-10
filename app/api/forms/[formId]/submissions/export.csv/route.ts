import { exportSubmissionsCsv } from "@/lib/db/submission-store";
import { getFormBundle } from "@/lib/server/forms";
import { jsonError } from "@/lib/server/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    const bundle = await getFormBundle(formId);

    if (!bundle) {
      return jsonError("Form not found", 404);
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "facts" ? "facts" : "wide";
    const csv = await exportSubmissionsCsv(
      bundle.form.workspaceId,
      formId,
      mode,
      bundle.versions.map((version) => ({
        versionNumber: version.versionNumber,
        schema: version.schema
      }))
    );

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=\"${bundle.form.slug}-submissions-${mode}.csv\"`
      }
    });
  } catch (error) {
    return jsonError("Unable to export CSV", 500, String(error));
  }
}
