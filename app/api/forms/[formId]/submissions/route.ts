import { getFormById } from "@/lib/db/app-store";
import { listSubmissionsForForm } from "@/lib/db/submission-store";
import { jsonError, jsonOk } from "@/lib/server/http";

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
    const submissions = await listSubmissionsForForm(form.workspaceId, formId, {
      status: url.searchParams.get("status"),
      version: url.searchParams.get("version")
        ? Number(url.searchParams.get("version"))
        : null,
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
      branchContains: url.searchParams.get("branchContains"),
      page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : 1,
      pageSize: url.searchParams.get("pageSize")
        ? Number(url.searchParams.get("pageSize"))
        : 25
    });

    return jsonOk(submissions);
  } catch (error) {
    return jsonError("Unable to list submissions", 500, String(error));
  }
}
