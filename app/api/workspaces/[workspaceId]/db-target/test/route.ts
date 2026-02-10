import { NextRequest } from "next/server";

import { testDbTarget } from "@/lib/db/app-store";
import { jsonError, jsonOk, readJson } from "@/lib/server/http";

interface TargetInput {
  name?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  databaseName?: string;
}

export async function POST(
  request: NextRequest,
  _context: { params: Promise<{ workspaceId: string }> }
) {
  try {
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

    await testDbTarget({
      name: body.name,
      host: body.host,
      port: Number(body.port),
      user: body.user,
      password: body.password,
      databaseName: body.databaseName
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError("Unable to test MariaDB target", 500, String(error));
  }
}
