import { showChrome } from "../nav.js";
import { app, esc, nav, setHTML, sourceLabel, toast, topOfView } from "../core.js";
import { addSession, saveStudySet, uid } from "../../storage/store.js";
import { initSchedule } from "../../storage/srs.js";
import { renderHome } from "../views/home.js";

// ================================================================ IMPORT
export function unescapeSep(v) {
  return v.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
}
/** Anki plain-text exports carry HTML (<br>, <div>, [sound:…]) — strip it. */
export function stripAnkiMarkup(s) {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(div|p|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\[sound:[^\]]*\]/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
export function parseCards(text, termRaw, cardRaw, clean = false) {
  const termSep = unescapeSep(termRaw);
  const cardSep = unescapeSep(cardRaw);
  let rows;
  if (cardSep === "\n\n") rows = text.split(/\r?\n\s*\r?\n/);
  else if (cardSep === "\n") rows = text.split(/\r?\n/);
  else rows = text.split(cardSep);
  const cards = [];
  for (let row of rows) {
    row = row.trim();
    if (!row || row.startsWith("#")) continue; // Anki export headers/comments
    const i = row.indexOf(termSep);
    let front = i === -1 ? row : row.slice(0, i).trim();
    let back = i === -1 ? "" : row.slice(i + termSep.length).trim();
    if (clean) {
      front = stripAnkiMarkup(front);
      back = stripAnkiMarkup(back);
    }
    if (front) cards.push({ front, back });
  }
  return cards;
}
export const importCards = () => {
  const clean = /** @type {HTMLInputElement} */ (document.getElementById("importClean"))?.checked;
  return parseCards(
    (/** @type {any} */ (document.getElementById("importText"))).value,
    (/** @type {any} */ (document.getElementById("termSep"))).value,
    (/** @type {any} */ (document.getElementById("cardSep"))).value,
    clean
  );
};

export function renderImport() {
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Import flashcards</div><span style="width:32px"></span>
      </div>
      <div class="help"><b>Anki:</b> File → Export → "Notes in Plain Text" (.txt), then upload the file below (leave HTML cleanup on).<br>
        <b>Quizlet:</b> open a set page and click the floating <b>Import to Mafsar</b> button, or export (⋯ → Export, Tab + New line) and paste below. CSV/TSV works too.</div>
      <div class="field"><label>Title</label><input id="importTitle" type="text" placeholder="e.g. Biology — Chapter 3" /></div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-ghost" style="flex:1" data-action="import-file">⇪ Load Anki/CSV file</button>
        <label style="display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--muted)">
          <input type="checkbox" id="importClean" checked /> clean HTML
        </label>
      </div>
      <input type="file" id="importFile" accept=".txt,.csv,.tsv,text/plain" class="hidden" />
      <div class="sep-row">
        <div class="field"><label>Term / definition</label>
          <select id="termSep"><option value="\\t">Tab</option><option value=",">Comma</option><option value=" - ">Dash</option><option value="|">Pipe</option></select></div>
        <div class="field"><label>Between cards</label>
          <select id="cardSep"><option value="\\n">New line</option><option value="\\n\\n">Blank line</option><option value=";">Semicolon</option></select></div>
      </div>
      <div class="field"><label>Content</label><textarea id="importText" rows="7" placeholder="term&#9;definition"></textarea></div>
      <div class="preview" id="importPreview"></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="import-preview">Preview</button>
        <button class="btn btn-primary" style="flex:1" data-action="import-save">Import</button>
      </div>
    </div>`);
  topOfView();
}
export function previewImport() {
  const cards = importCards();
  const box = document.getElementById("importPreview");
  if (!cards.length) {
    setHTML(box, '<div class="empty">No cards detected — try a different separator.</div>');
    return;
  }
  setHTML(
    box,
    `<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">${cards.length} card(s) detected</div>` +
    cards
      .slice(0, 3)
      .map((c) => `<div class="pv-card"><b>${esc(c.front)}</b><span>${esc(c.back)}</span></div>`)
      .join(""));
}
export async function doImport() {
  const cards = importCards();
  if (!cards.length) return toast("Couldn't read that. Check there\'s one card per line.");
  const title = (/** @type {any} */ (document.getElementById("importTitle"))).value.trim() || "Imported flashcards";
  const now = Date.now();
  const flashcards = cards.map((c) => ({ id: uid(), front: c.front, back: c.back, ...initSchedule(now) }));
  const session = await addSession({
    source: "quizlet",
    sourceLabel: "Imported",
    title,
    url: "",
    capturedAt: now,
    messages: [],
    importedCount: flashcards.length,
  });
  await saveStudySet({ sessionId: session.id, title, createdAt: now, flashcards, quiz: [] });
  toast(`Imported ${flashcards.length} cards`);
  renderHome();
}

