import { listVersions } from "@/lib/db/app-store";
import { jsonError, jsonOk } from "@/lib/server/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    const versions = await listVersions(formId);

    return jsonOk({
      versions: versions.map((version) => ({
        ...version,
        schema: JSON.parse(version.schemaJson)
      }))
    });
  } catch (error) {
    return jsonError("Unable to list versions", 500, String(error));
  }
}
