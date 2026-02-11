import { NextRequest, NextResponse } from "next/server";

import { clearAdminSessionCookies } from "@/lib/server/auth";
import { enforceCsrf } from "@/lib/server/csrf";
import { HttpError } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  try {
    enforceCsrf(request);

    const response = NextResponse.json(
      {
        ok: true
      },
      { status: 200 }
    );
    clearAdminSessionCookies(response);
    return response;
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details
        },
        { status: error.status }
      );
    }

    console.error("Unable to logout", error);
    return NextResponse.json(
      {
        error: "Unable to logout",
        details: null
      },
      { status: 500 }
    );
  }
}
