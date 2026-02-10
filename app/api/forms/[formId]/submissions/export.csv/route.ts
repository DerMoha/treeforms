import { getFormById } from "@/lib/db/app-store";
import { exportSubmissionsCsv } from "@/lib/db/submission-store";
import { jsonError } from "@/lib/server/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    const form = await getFormById(formId);

    if (!form) {
      return jsonError("Form not found", 404);
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "facts" ? "facts" : "wide";
    const csv = await exportSubmissionsCsv(form.workspaceId, formId, mode);

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=\"${form.slug}-submissions-${mode}.csv\"`
      }
    });
  } catch (error) {
    return jsonError("Unable to export CSV", 500, String(error));
  }
}
