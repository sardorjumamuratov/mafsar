function setupObserver() {
  const sentinel = document.getElementById("globalSentinel");
  if (!sentinel) return;
  if (observer) observer.disconnect();
  
  if (!hasNext) return;
  
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadMore(false);
    }
  }, { rootMargin: "100px" });
  observer.observe(sentinel);
}

function paintGlobal(sets, isOffline) {
  const slot = document.getElementById("globalSlot");
  if (!slot) return;
  
  if (sets.length === 0) {
    if (currentQ) {
      setHTML(slot, `<div style="text-align:center;font-size:14px;color:var(--text-muted);margin-top:20px">No global sets match "${esc(currentQ)}".</div>`);
    } else {
      setHTML(slot, `<div style="text-align:center;font-size:14px;color:var(--text-muted);margin-top:20px">No shared sets yet. Make one of yours global from its \u2022\u2022\u2022 menu.</div>`);
    }
    return;
  }
  
  let html = isOffline ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">You're offline. Showing sets from earlier.</div>` : "";
  
  html += sets.map(s => {
    let meta = `by ${esc(s.authorName)} \u2022 ${s.cardCount} cards`;
    if (currentTab === "new") {
      meta = `by ${esc(s.authorName)} \u2022 ${timeAgo(s.published_at)}`;
    }
    
    let rightCol = "";
    if (s.added) {
      rightCol = `
        <div style="display:flex;align-items:center;gap:4px;color:var(--accent-text);font-size:14px">
          <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor"><path d="M20 6L9 17l-5-5"/></svg>
          <span style="font-weight:600;font-size:13px">Added</span>
        </div>`;
    } else if (s.ratingCount > 0) {
      const avgStr = s.ratingAvg.toFixed(1);
      rightCol = `
        <div style="display:flex;flex-direction:column;align-items:flex-end">
          <div style="display:flex;align-items:center;gap:4px;color:var(--text-primary);font-size:15px;font-weight:700">
            <svg class="ic" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;width:13px;height:13px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${avgStr}
          </div>
          <div style="font-size:11px;color:var(--text-muted)">${fmtNum(s.ratingCount)}</div>
        </div>`;
    } else {
      rightCol = `<div style="font-size:13px;font-weight:600;color:var(--text-muted)">New</div>`;
    }
    
    return `
      <div class="block interactive" data-action="global-preview" data-idx="${sets.indexOf(s)}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="font-weight:650;color:var(--text-primary);font-size:16px">${esc(s.title)}</div>
          <div style="font-size:13px;color:var(--text-muted)">${meta}</div>
        </div>
        ${rightCol}
      </div>`;
  }).join("");
  
  setHTML(slot, html);
}

// ... preview sheet goes here ...
