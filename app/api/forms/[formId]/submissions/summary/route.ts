import { NextRequest } from "next/server";

import { getFormById } from "@/lib/db/app-store";
import { buildSubmissionSummary } from "@/lib/db/submission-analytics";
import { handleRouteError, jsonError, jsonOk, workspaceIdFromRequest } from "@/lib/server/http";
import { submissionSummaryQuerySchema } from "@/lib/server/validation";

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

    const parsed = submissionSummaryQuerySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      version: request.nextUrl.searchParams.get("version") ?? undefined,
      dateFrom: request.nextUrl.searchParams.get("dateFrom") ?? undefined,
      dateTo: request.nextUrl.searchParams.get("dateTo") ?? undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid summary query", 400, parsed.error.flatten());
    }

    const summary = await buildSubmissionSummary(form.workspaceId, formId, {
      status: parsed.data.status ?? null,
      version: parsed.data.version ?? null,
      dateFrom: parsed.data.dateFrom ?? null,
      dateTo: parsed.data.dateTo ?? null
    });

    return jsonOk(summary);
  } catch (error) {
    return handleRouteError("Unable to build submission summary", error);
  }
}
