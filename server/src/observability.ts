// Error reporting. Everything goes through reportError() into a sink: a no-op by
// default, Sentry when SENTRY_DSN is set (initSentry), a fake in tests. Nothing
// else in the server imports Sentry.
//
// Privacy: events carry the error, its stack, and a few tags (method, normalized
// route, status, random user id). Never request bodies (they hold captured study
// text), headers, cookies or email addresses. privacy.ts describes this.

export type ErrorLevel = "error" | "warning";
export type ErrorEvent = { error: unknown; level: ErrorLevel; tags: Record<string, string> };
export type ErrorSink = (event: ErrorEvent) => void;

const noop: ErrorSink = () => {};
let sink: ErrorSink = noop;

export function setErrorSink(next: ErrorSink | null): void {
  sink = next ?? noop;
}

/** Share and team codes are secrets-ish handles; keep them out of the error tracker. */
export function normalizeRoute(path: string): string {
  return path
    .replace(/^\/v1\/share\/(?!revoke$)[^/]+/, "/v1/share/:code")
    .replace(/^\/v1\/teams\/(?!join$)[^/]+/, "/v1/teams/:id")
    .replace(/^\/(s|t)\/[^/]+/, "/$1/:code");
}

export function reportError(
  error: unknown,
  ctx: { level?: ErrorLevel; method?: string; path?: string; status?: number; userId?: string } = {}
): void {
  try {
    const tags: Record<string, string> = {};
    if (ctx.method) tags.method = ctx.method;
    if (ctx.path) tags.route = normalizeRoute(ctx.path);
    if (ctx.status) tags.status = String(ctx.status);
    if (ctx.userId) tags.userId = ctx.userId;
    sink({ error, level: ctx.level ?? "error", tags });
  } catch {
    // Reporting must never turn one failure into two.
  }
}

/** Wire the sink to Sentry. Returns false (and loads nothing) when SENTRY_DSN is unset. */
export async function initSentry(dsn = process.env.SENTRY_DSN): Promise<boolean> {
  if (!dsn) return false;
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.Authorization;
          delete event.request.headers.cookie;
        }
      }
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
  setErrorSink(({ error, level, tags }) => {
    Sentry.withScope((scope) => {
      scope.setLevel(level);
      for (const [k, v] of Object.entries(tags)) scope.setTag(k, v);
      if (tags.userId) scope.setUser({ id: tags.userId });
      Sentry.captureException(error);
    });
  });
  process.on("unhandledRejection", (reason) => reportError(reason, { level: "error" }));
  return true;
}
