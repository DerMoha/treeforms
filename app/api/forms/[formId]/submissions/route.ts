import { NextRequest } from "next/server";

import { getFormById } from "@/lib/db/app-store";
import { listSubmissionsForForm } from "@/lib/db/submission-store";
import { handleRouteError, jsonError, jsonOk, workspaceIdFromRequest } from "@/lib/server/http";
import { submissionsQuerySchema } from "@/lib/server/validation";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const workspaceId = workspaceIdFromRequest(request);
    const { formId } = await context.params;
    const form = await getFormById(formId);

    if (!form || form.workspaceId !== workspaceId) {
      return jsonError("Form not found", 404);
    }

    const parsed = submissionsQuerySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      version: request.nextUrl.searchParams.get("version") ?? undefined,
      dateFrom: request.nextUrl.searchParams.get("dateFrom") ?? undefined,
      dateTo: request.nextUrl.searchParams.get("dateTo") ?? undefined,
      branchContains: request.nextUrl.searchParams.get("branchContains") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid submissions query", 400, parsed.error.flatten());
    }

    const submissions = await listSubmissionsForForm(form.workspaceId, formId, {
      status: parsed.data.status ?? null,
      version: parsed.data.version ?? null,
      dateFrom: parsed.data.dateFrom ?? null,
      dateTo: parsed.data.dateTo ?? null,
      branchContains: parsed.data.branchContains ?? null,
      page: parsed.data.page ?? 1,
      pageSize: parsed.data.pageSize ?? 25
    });

    return jsonOk(submissions);
  } catch (error) {
    return handleRouteError("Unable to list submissions", error);
  }
}
