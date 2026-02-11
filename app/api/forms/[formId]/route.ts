import { NextRequest } from "next/server";

import { getFormBundleForWorkspace } from "@/lib/server/forms";
import { handleRouteError, jsonError, jsonOk, workspaceIdFromRequest } from "@/lib/server/http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const workspaceId = workspaceIdFromRequest(request);
    const { formId } = await context.params;
    const bundle = await getFormBundleForWorkspace(formId, workspaceId);

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
    return handleRouteError("Unable to fetch form", error);
  }
}
