const CSRF_COOKIE = "tf_csrf";

export function readCsrfToken() {
  if (typeof document === "undefined") {
    return "";
  }

  const pair = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`));

  if (!pair) {
    return "";
  }

  const value = pair.slice(CSRF_COOKIE.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
