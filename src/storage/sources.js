// What "Capture this page" is looking at, and how extracted text is shaped before
// generation. Pure: no chrome.*, no DOM. Imported by the service worker, the side
// panel, and node tests.

export const MAX_CAPTURE_CHARS = 24000;
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * @param {string} url
 * @returns {{kind:"youtube", videoId:string, origin:string} | {kind:"pdf", origin:string, local:boolean} | {kind:"page"}}
 */
export function classifyUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { kind: "page" };
  }
  if (u.hostname === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    if (VIDEO_ID.test(id)) return { kind: "youtube", videoId: id, origin: "https://www.youtube.com" };
  }
  if (YT_HOSTS.has(u.hostname)) {
    const id = u.pathname === "/watch"
      ? u.searchParams.get("v")
      : (u.pathname.match(/^\/(?:shorts|live)\/([^/?#]+)/) || [])[1];
    if (id && VIDEO_ID.test(id)) return { kind: "youtube", videoId: id, origin: u.origin };
  }
  if (/\.pdf$/i.test(u.pathname)) {
    if (u.protocol === "file:") return { kind: "pdf", origin: "file://", local: true };
    if (u.protocol === "http:" || u.protocol === "https:") return { kind: "pdf", origin: u.origin, local: false };
  }
  return { kind: "page" };
}

/** "1:02:03" | "12:34" | "0:07" → seconds. NaN when there's nothing parseable. */
export function parseTimestamp(ts) {
  const s = String(ts ?? "").trim();
  if (!s) return NaN;
  const parts = s.split(":").map(Number);
  if (parts.length > 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// Sound cues carry nothing to learn from: "[Music]", "[Applause]", "(laughs)".
const CUE = /\[[^\]]{1,30}\]|\((?:music|applause|laughter|laughs|silence)\)/gi;

/**
 * Transcript segments → paragraphs of roughly `paragraphSeconds` each, which
 * reads far better to the generator than one unbroken wall of text.
 * @param {{start?:string, text?:string}[]|undefined} segments
 */
export function transcriptToText(segments, paragraphSeconds = 45) {
  const paragraphs = [];
  let current = [];
  let paragraphStart = null;
  for (const seg of segments || []) {
    const text = String(seg?.text || "").replace(CUE, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const t = parseTimestamp(seg.start);
    if (paragraphStart === null) paragraphStart = Number.isFinite(t) ? t : 0;
    if (Number.isFinite(t) && t - paragraphStart >= paragraphSeconds && current.length) {
      paragraphs.push(current.join(" "));
      current = [];
      paragraphStart = t;
    }
    current.push(text);
  }
  if (current.length) paragraphs.push(current.join(" "));
  return paragraphs.join("\n\n");
}

/** Fit text to the generation budget, cutting at a sentence, then a word, then hard. */
export function truncateForGeneration(text, max = MAX_CAPTURE_CHARS) {
  const s = String(text || "");
  if (s.length <= max) return { text: s, truncated: false, keptPercent: 100 };
  const head = s.slice(0, max);
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf(".\n"), head.lastIndexOf("\n\n"));
  const space = head.lastIndexOf(" ");
  const end = sentence > max * 0.6 ? sentence + 1 : space > max * 0.6 ? space : max;
  const kept = s.slice(0, end).trimEnd();
  return { text: kept, truncated: true, keptPercent: Math.max(1, Math.floor((kept.length / s.length) * 100)) };
}

export function pdfTitleFromUrl(url) {
  try {
    const file = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return file.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "PDF document";
  } catch {
    return "PDF document";
  }
}

/** Suffix for the success toast, saying what didn't fit. */
export function captureNote({ truncated = false, keptPercent = 100, pages = 0, pagesRead = 0 } = {}) {
  const bits = [];
  if (pages && pagesRead && pagesRead < pages) bits.push(`read ${pagesRead} of ${pages} pages`);
  if (truncated) bits.push(`used the first ${keptPercent}% of the text`);
  return bits.length ? ` (${bits.join(", ")})` : "";
}