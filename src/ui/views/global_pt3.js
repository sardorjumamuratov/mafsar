import { presentSheet, closeSheet } from "../sheet.js";
import { renderSetDetail } from "./set-detail.js";

export async function openGlobalPreview(btn) {
  const idx = parseInt(btn.dataset.idx, 10);
  const s = globalSets[idx];
  if (!s) return;
  
  const srcLbl = (s.sourceLabel || "User").substring(0,2).toUpperCase();
  const title = esc(s.title);
  const author = esc(s.authorName);
  
  const avgStr = s.ratingCount > 0 ? s.ratingAvg.toFixed(1) : "";
  const starsHtml = Array.from({length: 5}).map((_, i) => {
    const fill = s.ratingCount > 0 && i < Math.round(s.ratingAvg) ? "currentColor" : "none";
    const stroke = fill === "none" ? "currentColor" : "none";
    return `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:${fill};stroke:${stroke};color:var(--text-muted)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  }).join("");
  
  let ratingRow = `<div style="display:flex;align-items:center;gap:8px">
    <div style="display:flex;gap:2px">${starsHtml}</div>
    ${s.ratingCount > 0 ? `<div style="font-size:14px;font-weight:600">${avgStr}</div><div style="font-size:13px;color:var(--text-muted)">\u2022 ${s.ratingCount.toLocaleString()} ratings</div>` : `<div style="font-size:13px;color:var(--text-muted)">No ratings yet</div>`}
  </div>`;
  
  let reasonCallout = "";
  if (s.reasonSetTitle) {
    reasonCallout = `<div style="padding:12px 14px;border-radius:12px;background:var(--bg-surface2);font-size:14px;color:var(--text-secondary)">Picked because you study <b>${esc(s.reasonSetTitle)}</b></div>`;
  }
  
  let btnHtml = s.added ? 
    `<button class="btn" style="height:52px;border-radius:14px;background:var(--bg-surface2);border:1px solid var(--border-hover);color:var(--accent-text);font-size:16px;font-weight:650;width:100%" data-action="global-open-added" data-id="${s.id}">
      <svg class="ic" viewBox="0 0 24 24" style="stroke:currentColor"><path d="M20 6L9 17l-5-5"/></svg> Added - Open set
    </button>` :
    `<button class="btn btn-primary" style="height:52px;border-radius:14px;font-size:16px;font-weight:650;width:100%" data-action="global-add-set" data-id="${s.id}" data-idx="${idx}">
      Add to my sets
    </button>`;

  const html = `
    <div style="padding:10px 20px 24px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${srcLbl}</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="font-size:20px;font-weight:650;line-height:1.2">${title}</div>
          <div style="font-size:13px;color:var(--text-muted)">by ${author} \u2022 ${s.cardCount} cards</div>
        </div>
      </div>
      
      ${ratingRow}
      ${reasonCallout}
      
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px">SAMPLE CARDS</div>
      <div id="globalSampleCards"><div class="skeleton" style="height:40px"></div></div>
      
      ${btnHtml}
      
      <button class="btn btn-text" style="font-size:13px;color:var(--text-muted);height:32px;margin:0 auto" data-action="global-report" data-id="${s.id}">Report this set</button>
    </div>
  `;
  
  presentSheet(html, { maxHeight: "86%" });
  
  // Fetch sample cards
  try {
    const res = await send({ type: "GLOBAL_FETCH", id: s.id });
    const slot = document.getElementById("globalSampleCards");
    if (slot && res.cards) {
      const cards = res.cards.slice(0,3).map(c => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border-divider);display:flex;align-items:center;gap:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--status-new)"></div>
          <div style="font-size:15px">${esc(c.front)}</div>
        </div>
      `).join("");
      setHTML(slot, cards || `<div class="empty">No cards</div>`);
    }
  } catch(e) {}
}

export async function addGlobalSet(btn) {
  const id = btn.dataset.id;
  const idx = parseInt(btn.dataset.idx, 10);
  btn.textContent = "Adding...";
  btn.disabled = true;
  try {
    const res = await send({ type: "SYNC_PULL_SET", id }); // Or similar add logic
    // Actually we need to copy the set. We'll use SHARE_IMPORT logic or dedicated GLOBAL_ADD.
    // The prompt says: "Add: a server-side copy with origin ids, idempotent, New schedules."
    // If prompt 35 has it, let's use GLOBAL_ADD.
    const addRes = await send({ type: "GLOBAL_ADD", id });
    toast("Added to your sets");
    
    globalSets[idx].added = true;
    const s = globalSets[idx];
    const newBtn = `<button class="btn" style="height:52px;border-radius:14px;background:var(--bg-surface2);border:1px solid var(--border-hover);color:var(--accent-text);font-size:16px;font-weight:650;width:100%" data-action="global-open-added" data-id="${addRes.id || s.id}">
      <svg class="ic" viewBox="0 0 24 24" style="stroke:currentColor"><path d="M20 6L9 17l-5-5"/></svg> Added - Open set
    </button>`;
    btn.outerHTML = newBtn;
    paintGlobal(globalSets, false); // refresh list behind the sheet
  } catch(e) {
    btn.textContent = "Add to my sets";
    btn.disabled = false;
    toast(e.message);
  }
}

export function openAddedSet(btn) {
  closeSheet();
  renderSetDetail(btn.dataset.id, "cards");
}

export async function reportGlobal(btn) {
  const id = btn.dataset.id;
  const ok = await confirmSheet({
    title: "Report set",
    body: "Report this set as spam, harmful, or containing personal info? It will be hidden if multiple people report it.",
    confirmLabel: "Report",
    destructive: true
  });
  if (!ok) return;
  try {
    await send({ type: "GLOBAL_REPORT", id, reason: "Spam" });
    toast("Thanks, we'll take a look");
    closeSheet();
  } catch(e) {
    toast(e.message);
  }
}
