import { NextRequest } from "next/server";

import { setActiveDbTarget } from "@/lib/db/app-store";
import { jsonError, jsonOk, readJson } from "@/lib/server/http";

interface TargetInput {
  name?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  databaseName?: string;
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await context.params;
    const body = await readJson<TargetInput>(request);

    if (
      !body.name ||
      !body.host ||
      !body.port ||
      !body.user ||
      !body.password ||
      !body.databaseName
    ) {
      return jsonError("name, host, port, user, password, and databaseName are required", 400);
    }

    const result = await setActiveDbTarget(workspaceId, {
      name: body.name,
      host: body.host,
      port: Number(body.port),
      user: body.user,
      password: body.password,
      databaseName: body.databaseName
    });

    return jsonOk({
      ok: true,
      targetId: result.targetId
    });
  } catch (error) {
    return jsonError("Unable to activate MariaDB target", 500, String(error));
  }
}
