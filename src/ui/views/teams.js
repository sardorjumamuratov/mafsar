import { setNav, showChrome } from "../nav.js";
import { getAuth } from "../../sync/auth.js";
import { app, esc, nav, send, setHTML, toast, topOfView } from "../core.js";
import { parseTeamCode, teamLinkFor } from ".././share-link.js";
import { LANDING_BASE } from "../../config.js";
import { review } from "../../storage/srs.js";
import { copyRowHtml } from "../share.js";

// ================================================================ TEAMS
// Account-backed study groups: create one, share the code/link, compare
// progress on a leaderboard. The share-code receiver ("Add a shared set")
// lives here too — both bring other people's studying into yours.
export let sharedPreview = null; // { code, title, cards, quiz }

export async function renderTeams() {
  setNav("teams");
  showChrome(true);
  sharedPreview = null;
  const auth = await getAuth();

  // Teams are the one feature that needs the account; everything else stays
  // offline-first. Signed out, explain and point at the You tab.
  if (!auth?.accessToken) {
    setHTML(app, `
      <div class="view">
        <div class="ahd"><div class="h-title">Teams</div></div>
        <div class="block tint" style="text-align:center">
          <div style="font-size:26px">👥</div>
          <div style="font-weight:650;margin-top:6px">Teams need an account</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:4px">Sign in to create a team, share its code, and follow a leaderboard with your study group. Everything else keeps working offline.</div>
          <button class="btn btn-primary" style="margin-top:12px" data-action="nav-you">Sign in on the You tab</button>
        </div>
      </div>`);
    topOfView();
    return;
  }

  let teams = [];
  let loadError = null;
  try {
    teams = (await send({ type: "TEAM_LIST" })).teams || [];
  } catch (e) {
    loadError = e.message;
  }

  const listHtml = loadError
    ? `<div class="empty">Couldn't load your teams.<br><span style="font-size:12px;color:var(--muted)">${esc(loadError)}</span></div>`
    : teams.length
    ? teams
        .map(
          (t) => `
        <div class="setrow" data-action="open-team" data-id="${esc((/** @type {any} */ (t)).id)}">
          <div class="top"><div class="name">${esc(t.name)}</div><span class="tag">${t.memberCount} member${t.memberCount === 1 ? "" : "s"}</span></div>
          <div class="prog-line"><span>Code ${esc(t.code)}</span><span>Open</span></div>
        </div>`
        )
        .join("")
    : "";

  const teamsListBlock = teams.length || loadError ? `
      <div class="listhd"><span class="t-label">Your teams</span></div>
      ${listHtml}` : "";

  const teamActionsBlock = `
      <div class="team-actions">
        <button class="btn btn-primary" data-action="team-create">Create a team</button>
        <div class="join-row">
          <input id="teamCode" type="text" placeholder="Enter team code" autocomplete="off" autocapitalize="characters" aria-label="Enter team code" />
          <button class="btn btn-ghost" data-action="team-join">Join</button>
        </div>
      </div>`;

  setHTML(app, `
    <div class="view teams-view">
      <div class="ahd"><div class="h-title">Teams</div></div>
      <div class="help" style="margin:0">A team is a study group with a shared code: everyone joins, then the leaderboard compares mastered cards.</div>
${teams.length ? teamsListBlock + "\n" + teamActionsBlock : teamActionsBlock + "\n" + teamsListBlock}
    </div>`);
  topOfView();
  document.getElementById("teamCode")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinTeamFromInput();
  });
}

export function renderTeamCreate() {
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-teams" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Create a team</div>
        <span style="width:32px"></span>
      </div>
      <div class="help" style="margin:0">Everyone who joins with the code sees the leaderboard and who's studying what. Your own sets stay private either way.</div>
      <div class="field"><label>Team name</label>
        <input id="teamName" type="text" placeholder="e.g. MCAT study group" maxlength="80" autocomplete="off" aria-label="Team name" /></div>
      <button class="btn btn-primary btn-block" data-action="team-create-save">Create team</button>
    </div>`);
  topOfView();
  document.getElementById("teamName")?.focus();
  document.getElementById("teamName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createTeamFromForm();
  });
}
export async function createTeamFromForm() {
  const name = /** @type {HTMLInputElement} */ (document.getElementById("teamName"))?.value.trim();
  if (!name) return toast("Give the team a name first.");
  try {
    const r = await send({ type: "TEAM_CREATE", name });
    toast("Team created — share the code with your group");
    renderTeam(r.team.id);
  } catch (e) {
    toast(e.message);
  }
}

export async function joinTeamFromInput() {
  const code = parseTeamCode(/** @type {HTMLInputElement} */ (document.getElementById("teamCode"))?.value || "");
  if (!code) return toast("Enter a team code first.");
  try {
    const r = await send({ type: "TEAM_JOIN", code });
    toast(`Joined ${r.team.name}`);
    renderTeam(r.team.id);
  } catch (e) {
    toast(e.message);
  }
}

export async function renderTeam(id) {
  showChrome(false);
  let team = null;
  try {
    team = (await send({ type: "TEAM_GET", id })).team;
  } catch (e) {
    toast(e.message);
    return renderTeams();
  }
  const link = teamLinkFor(team.code, LANDING_BASE);
  const board = (team.leaderboard || [])
    .map(
      (m) => `
      <div class="lb-row">
        <span class="rank tnum">${m.rank}</span>
        <span class="who">${esc(m.email)}</span>
        <span class="tag">${m.mastered} mastered</span>
      </div>
      <div class="lb-sub">${m.reviews7d} review${m.reviews7d === 1 ? "" : "s"} this week · ${m.streak}-day streak</div>`
    )
    .join("");
  const learning = (team.learning || [])
    .map(
      (m) => `
      <div class="learn-row">
        <div class="who">${esc(m.email)}</div>
        <div class="tags">${
          m.titles?.length ? m.titles.map((t) => `<span class="tag">${esc(t)}</span>`).join("") : `<span class="tag">No sets yet</span>`
        }</div>
      </div>`
    )
    .join("");

  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-teams" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">${esc(team.name)}</div>
        <span style="width:32px"></span>
      </div>
      <div class="block" style="display:flex;flex-direction:column;gap:12px">
        ${copyRowHtml("Team link", link, "anyone with it can join")}
        ${copyRowHtml("Team code", team.code, "entered under Join a team", "share-code tnum")}
      </div>
      <div class="listhd"><span class="t-label">Leaderboard</span></div>
      <div class="block">${board || '<div class="empty">No members yet.</div>'}</div>
      <div class="listhd"><span class="t-label">Who's learning what</span></div>
      <div class="block">${learning || '<div class="empty">Nothing yet.</div>'}</div>
      <button class="btn btn-ghost btn-block" data-action="team-leave" data-id="${esc(team.id)}">Leave team</button>
    </div>`);
  topOfView();
}

export async function leaveTeam(id) {
  if (!confirm("Leave this team? You can re-join any time with the team code.")) return;
  try {
    await send({ type: "TEAM_LEAVE", id });
    toast("Left the team");
  } catch (e) {
    toast(e.message);
  }
  renderTeams();
}


export function setSharedPreview(v) { sharedPreview = v; }
