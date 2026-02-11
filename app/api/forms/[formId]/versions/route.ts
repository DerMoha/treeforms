import { NextRequest } from "next/server";

import { getFormById, listVersions } from "@/lib/db/app-store";
import { handleRouteError, jsonError, jsonOk, workspaceIdFromRequest } from "@/lib/server/http";

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

    const versions = await listVersions(formId);

    return jsonOk({
      versions: versions.map((version) => ({
        ...version,
        schema: JSON.parse(version.schemaJson)
      }))
    });
  } catch (error) {
    return handleRouteError("Unable to list versions", error);
  }
}
