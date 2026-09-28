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

/**
 * The caption body YouTube's player loads (fmt=json3) → the same segments the
 * transcript panel used to give. Start times are whole seconds as a string,
 * which parseTimestamp reads. Anything unparseable gives [] rather than a throw.
 * @param {string|null|undefined} body
 * @returns {{start: string, text: string}[]}
 */
export function json3ToSegments(body) {
  let data;
  try {
    data = JSON.parse(String(body ?? ""));
  } catch {
    return [];
  }
  const out = [];
  for (const ev of Array.isArray(data?.events) ? data.events : []) {
    if (!Array.isArray(ev?.segs)) continue; // window and pen definitions, not speech
    const text = ev.segs.map((s) => String(s?.utf8 ?? "")).join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({ start: String(Math.floor((Number(ev.tStartMs) || 0) / 1000)), text });
  }
  return out;
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

/** Marks where the text skips ahead, so the model doesn't read two excerpts as one. */
const EXCERPT_GAP = "\n\n…\n\n";

/**
 * Fit a long, time-ordered transcript to the budget by taking excerpts from
 * across all of it. Cutting from the start covered a lecture's opening third
 * and nothing after, so every card came from the first minutes. The budget
 * stays the same: generation asks for a fixed number of cards however long the
 * input is, and the server caps a message at 30k characters, so the gain is in
 * where the text comes from, not how much of it there is.
 */
export function sampleForGeneration(text, max = MAX_CAPTURE_CHARS) {
  const s = String(text || "");
  if (s.length <= max) return { text: s, truncated: false, sampled: false, keptPercent: 100, excerpts: 1 };

  // More excerpts the further over budget, within reason: too many and each
  // one is too short to explain anything.
  const windows = Math.min(8, Math.max(2, Math.ceil(s.length / max) * 2));
  const share = Math.floor((max - EXCERPT_GAP.length * (windows - 1)) / windows);

  // Spread the starts so the first excerpt opens the transcript and the last
  // one closes it: the wrap-up is often where a lecturer sums up.
  const span = Math.max(0, s.length - share);
  const excerpts = [];
  for (let i = 0; i < windows; i++) {
    let start = Math.floor((i * span) / (windows - 1));
    if (i > 0) {
      // Begin at the start of a paragraph or sentence, else at a word.
      const near = s.slice(start, start + 600);
      const para = near.indexOf("\n\n");
      const sentence = near.indexOf(". ");
      const space = near.indexOf(" ");
      start += para >= 0 ? para + 2 : sentence >= 0 ? sentence + 2 : space >= 0 ? space + 1 : 0;
    }
    const piece = truncateForGeneration(s.slice(start).trimStart(), share).text.trim();
    if (piece) excerpts.push(piece);
  }

  const used = excerpts.reduce((n, e) => n + e.length, 0);
  return {
    text: excerpts.join(EXCERPT_GAP),
    truncated: true,
    sampled: true,
    keptPercent: Math.max(1, Math.floor((used / s.length) * 100)),
    excerpts: excerpts.length,
  };
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
export function captureNote({ truncated = false, sampled = false, keptPercent = 100, pages = 0, pagesRead = 0 } = {}) {
  const bits = [];
  if (pages && pagesRead && pagesRead < pages) bits.push(`read ${pagesRead} of ${pages} pages`);
  if (truncated && sampled) bits.push(`sampled from across the whole video, ${keptPercent}% of the transcript`);
  else if (truncated) bits.push(`used the first ${keptPercent}% of the text`);
  return bits.length ? ` (${bits.join(", ")})` : "";
}
