import { type NextRequest } from "next/server";

import { CSRF_COOKIE } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";

export function enforceCsrf(request: NextRequest) {
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value?.trim() ?? "";
  const headerToken = request.headers.get("x-csrf-token")?.trim() ?? "";

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new HttpError(403, "CSRF validation failed");
  }
}
