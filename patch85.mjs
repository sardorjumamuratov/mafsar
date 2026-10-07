import fs from "fs";
let code = fs.readFileSync("src/ui/flows/design.js", "utf8");

const designActionOld = `export function designAction(action, payload) {
  const s = designState;
  if (!s) return;
  if (action === "nav") {
    if (!SECTIONS.some((x) => x.key === payload)) return;
    // The draft is saved on every keystroke, so switching only changes which section shows.
    s.activeSectionKey = payload;
    paintDesignForm();
  } else if (action === "toggle-brief") {`;

const designActionNew = `export function designAction(action, payload) {
  const s = designState;
  if (!s) return;
  
  if (action === "dontknow") {
    s.dontKnowLevel = (s.dontKnowLevel || 0) + 1;
    paintDesignForm();
  } else if (action === "chip") {
    s.conceptChipExpanded = s.conceptChipExpanded === payload ? null : payload;
    paintDesignForm();
  } else if (action === "improve") {
    s.checkpoint = null;
    paintDesignForm();
  } else if (action === "check") {
    const isGuided = s.practiceStyle === "guided";
    if (!isGuided) return;
    s.checkpoint = "Checking your thinking...";
    paintDesignForm();
    
    // Call checkpoint API
    const answer = s.sections[s.activeSectionKey] || "";
    send({ type: "DESIGN_CHECKPOINT", step: s.activeSectionKey, brief: s.brief, answer: answer }).then((res) => {
       if (designState !== s) return;
       if (!res || (!res.strength && !res.gap)) {
         s.checkpoint = null;
         paintDesignForm();
         return;
       }
       s.checkpoint = \`<div style="font-weight:600">You covered:</div><div>\${esc(res.strength)}</div><div style="font-weight:600" class="st-mt8">Consider adding:</div><div>\${esc(res.gap)}</div>\`;
       paintDesignForm();
    }).catch((e) => {
       if (designState !== s) return;
       toast(e.message);
       s.checkpoint = null;
       paintDesignForm();
    });
  } else if (action === "nav") {
    const isGuided = s.practiceStyle === "guided";
    const activeSections = isGuided ? GUIDED_SECTIONS : SECTIONS;
    if (payload !== "outline" && !activeSections.some((x) => x.key === payload)) return;
    s.activeSectionKey = payload;
    s.dontKnowLevel = 0;
    s.conceptChipExpanded = null;
    s.checkpoint = null;
    paintDesignForm();
  } else if (action === "toggle-brief") {`;

code = code.replace(designActionOld, designActionNew);

fs.writeFileSync("src/ui/flows/design.js", code, "utf8");
