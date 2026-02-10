import { NextRequest } from "next/server";

import { publishDraft } from "@/lib/db/app-store";
import { jsonError, jsonOk, readJson } from "@/lib/server/http";

interface PublishInput {
  actor?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    const body = await readJson<PublishInput>(request).catch(
      () => null as PublishInput | null
    );

    const result = await publishDraft(formId, body?.actor ?? "system");

    if (!result.ok) {
      return jsonError(result.error, result.status, (result as { errors?: string[] }).errors ?? null);
    }

    return jsonOk({
      ok: true,
      versionNumber: result.versionNumber,
      versionId: result.versionId
    });
  } catch (error) {
    return jsonError("Unable to publish form", 500, String(error));
  }
}
