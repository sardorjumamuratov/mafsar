import { esc } from "./core.js";

export function IconButton(iconHtml, ariaLabel) {
  return `<button type="button" class="icon-btn" aria-label="${esc(ariaLabel)}">${iconHtml}</button>`;
}

export function SectionLabel(title, actionLabel, actionData) {
  const actionHtml = actionLabel ? `<button type="button" class="section-action" ${actionData ? `data-action="${esc(actionData)}"` : ""}>${esc(actionLabel)}</button>` : "";
  return `<div class="section-label">
    <span>${esc(title)}</span>
    ${actionHtml}
  </div>`;
}

export function CountBadge(count) {
  return `<span class="count-badge">${esc(count)}</span>`;
}

export function PrimaryButton(label, meta, disabled) {
  return `<button type="button" class="btn-primary" ${disabled ? "disabled" : ""}>
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
    <span class="label">${esc(label)}</span>
    ${meta ? `<span class="meta">· ${esc(meta)}</span>` : ""}
  </button>`;
}

export function SplitPrimaryButton(label, meta) {
  return `<div class="split-btn">
    <button type="button" class="btn-primary-left">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      <span class="label">${esc(label)}</span>
      ${meta ? `<span class="meta">· ${esc(meta)}</span>` : ""}
    </button>
    <button type="button" class="btn-primary-right" aria-label="Study mode" aria-haspopup="menu" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
  </div>`;
}

export function OutlineButton(label, height, padding, radius, color, iconHtml, disabled) {
  return `<button type="button" class="btn-outline" style="height:${height}px;padding:0 ${padding}px;border-radius:${radius}px;color:var(${color})" ${disabled ? "disabled" : ""}>
    ${iconHtml ? `<span class="icon">${iconHtml}</span>` : ""}
    <span>${esc(label)}</span>
  </button>`;
}

export function BottomNav(activeTab) {
  const items = [
    { id: "home", icon: "home", label: "Home" },
    { id: "sets", icon: "sets", label: "Sets" },
    { id: "discover", icon: "discover", label: "Discover" },
    { id: "stats", icon: "stats", label: "Stats" },
    { id: "you", icon: "you", label: "You" }
  ];
  return `<nav class="bottom-nav">
    ${items.map(i => {
      const active = activeTab === i.id;
      // Note: Icons will be handled by the main panel JS injecting SVG, or we just hardcode SVG here. 
      // Let's use data-nav to hook up.
      return `<button type="button" class="nav-item ${active ? "active" : ""}" data-nav="${i.id}" ${active ? 'aria-current="page"' : ''}>
        <span class="nav-icon" data-icon="${i.id}"></span>
        <span class="nav-label">${esc(i.label)}</span>
      </button>`;
    }).join("")}
  </nav>`;
}

export function StatusDot(state) {
  return `<span class="status-dot status-${state}" aria-hidden="true"></span>`;
}
