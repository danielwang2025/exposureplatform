// One structured log line per server error (visible in Vercel → Logs).
// The digest matches the "Error ID" shown on the error page, so a parent can
// quote it. Never logs headers, cookies, bodies, query strings or the secret
// tokens in share and invitation URLs.
export function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
) {
  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      message,
      digest,
      method: request.method,
      path: redactPath(request.path),
      route: context.routePath,
      type: context.routeType,
    }),
  );
}

export function redactPath(path: string) {
  return path
    .split("?")[0]
    .replace(/^\/(s|invite)\/[^/]+/, "/$1/[token]");
}
