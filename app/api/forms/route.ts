import { NextRequest } from "next/server";

import { createForm, listForms } from "@/lib/db/app-store";
import { jsonError, jsonOk, readJson, workspaceIdFromRequest } from "@/lib/server/http";

interface CreateFormInput {
  title?: string;
}

export async function GET(request: NextRequest) {
  try {
    const workspaceId = workspaceIdFromRequest(request);
    const forms = await listForms(workspaceId);
    return jsonOk({ forms });
  } catch (error) {
    return jsonError("Unable to list forms", 500, String(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const workspaceId = workspaceIdFromRequest(request);
    const body = await readJson<CreateFormInput>(request);
    const title = body.title?.trim();

    if (!title) {
      return jsonError("title is required", 400);
    }

    const created = await createForm(workspaceId, title);
    return jsonOk({ form: created }, { status: 201 });
  } catch (error) {
    return jsonError("Unable to create form", 500, String(error));
  }
}
