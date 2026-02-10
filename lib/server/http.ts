import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_WORKSPACE_ID } from "@/lib/server/constants";

export function jsonOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    status: 200,
    ...init
  });
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      details: details ?? null
    },
    {
      status
    }
  );
}

export function workspaceIdFromRequest(request: NextRequest) {
  const fromHeader = request.headers.get("x-workspace-id")?.trim();
  const fromSearch = request.nextUrl.searchParams.get("workspaceId")?.trim();

  return fromHeader || fromSearch || DEFAULT_WORKSPACE_ID;
}

export async function readJson<T>(request: NextRequest): Promise<T> {
  return (await request.json()) as T;
}
