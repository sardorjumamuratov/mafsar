// Pure link helpers for shares and teams — no imports, no DOM, so the same
// code runs in the panel and in node unit tests. Codes are the only handle
// protecting shared content, so parsing is strict about path shape and
// forgiving about case/whitespace (users retype these by hand).

/** `${base}/s/${code}` — a per-set share link (landing redeems it). */
export function shareLinkFor(code, base = "") {
  return `${trimBase(base)}/s/${String(code ?? "").trim()}`;
}

/** `${base}/t/${code}` — a team join link (landing redeems it). */
export function teamLinkFor(code, base = "") {
  return `${trimBase(base)}/t/${String(code ?? "").trim()}`;
}

function trimBase(base) {
  return String(base ?? "").trim().replace(/\/+$/, "");
}

/**
 * Pull a share code out of whatever the user pasted: a bare code, a /s/{code}
 * link, or the legacy ?code= form. Result is uppercased (server codes are);
 * empty input yields "" so callers can branch without null checks.
 */
export function parseShareCode(urlOrCode) {
  const raw = String(urlOrCode ?? "").trim();
  if (!raw) return "";
  const slash = raw.match(/\/s\/([a-zA-Z0-9]+)/);
  if (slash) return slash[1].toUpperCase();
  const query = raw.match(/[?&]code=([a-zA-Z0-9]+)/);
  if (query) return query[1].toUpperCase();
  return raw.toUpperCase();
}

/** Same as parseShareCode but for /t/{code} team links and team codes. */
export function parseTeamCode(urlOrCode) {
  const raw = String(urlOrCode ?? "").trim();
  if (!raw) return "";
  const slash = raw.match(/\/t\/([a-zA-Z0-9]+)/);
  if (slash) return slash[1].toUpperCase();
  return raw.toUpperCase();
}
