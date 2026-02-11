import { NextRequest } from "next/server";

import { getFormBundleForWorkspace } from "@/lib/server/forms";
import { handleRouteError, jsonError, workspaceIdFromRequest } from "@/lib/server/http";

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

    return new Response(`${JSON.stringify(bundle.schema, null, 2)}\n`, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=\"${bundle.form.slug}-draft.json\"`
      }
    });
  } catch (error) {
    return handleRouteError("Unable to export form JSON", error);
  }
}
