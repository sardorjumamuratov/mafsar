
import os

with open("src/ui/panel.js", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
"""    case "you-practice-style": {
      const { STYLES, getDefaultPracticeStyle, setDefaultPracticeStyle } = await import("../storage/practice-style.js");
      const current = await getDefaultPracticeStyle();
      const isGuided = current === STYLES.GUIDED;
      openSheet("Practice style", `
        <div style="display:flex;flex-direction:column;gap:12px;padding:8px 16px 24px">
          <button type="button" data-action="set-you-practice-style" data-style="${STYLES.GUIDED}" class="opt-row ${isGuided ? "selected" : ""}" style="text-align:left;height:auto;padding:12px 14px">
            <span style="display:flex;flex-direction:column;gap:2px">
              <span style="font-weight:600;font-size:15px">Learn concepts</span>
              <span style="font-size:13px;color:var(--text-muted)">Step-by-step guidance and hints. Best for learning a new system.</span>
            </span>
          </button>
          <button type="button" data-action="set-you-practice-style" data-style="${STYLES.SIMULATION}" class="opt-row ${!isGuided ? "selected" : ""}" style="text-align:left;height:auto;padding:12px 14px">
            <span style="display:flex;flex-direction:column;gap:2px">
              <span style="font-weight:600;font-size:15px">Interview simulation</span>
              <span style="font-size:13px;color:var(--text-muted)">Blank canvas, elapsed timer, strict grading. No hints.</span>
            </span>
          </button>
        </div>
      `, false, null, { px: 0, pb: 0 });
      break;
    }""",
"""    case "you-practice-style":
      (async () => {
        const { STYLES, getDefaultPracticeStyle } = await import("../storage/practice-style.js");
        const { openSheet } = await import("./core.js");
        const current = await getDefaultPracticeStyle();
        const isGuided = current === STYLES.GUIDED;
        openSheet("Practice style", `
          <div style="display:flex;flex-direction:column;gap:12px;padding:8px 16px 24px">
            <button type="button" data-action="set-you-practice-style" data-style="${STYLES.GUIDED}" class="opt-row ${isGuided ? "selected" : ""}" style="text-align:left;height:auto;padding:12px 14px">
              <span style="display:flex;flex-direction:column;gap:2px">
                <span style="font-weight:600;font-size:15px">Learn concepts</span>
                <span style="font-size:13px;color:var(--text-muted)">Step-by-step guidance and hints. Best for learning a new system.</span>
              </span>
            </button>
            <button type="button" data-action="set-you-practice-style" data-style="${STYLES.SIMULATION}" class="opt-row ${!isGuided ? "selected" : ""}" style="text-align:left;height:auto;padding:12px 14px">
              <span style="display:flex;flex-direction:column;gap:2px">
                <span style="font-weight:600;font-size:15px">Interview simulation</span>
                <span style="font-size:13px;color:var(--text-muted)">Blank canvas, elapsed timer, strict grading. No hints.</span>
              </span>
            </button>
          </div>
        `, false, null, { px: 0, pb: 0 });
      })().catch(() => {});
      break;"""
)

code = code.replace(
"""        case "set-first-run-style": {
      const { setDefaultPracticeStyle } = await import("../storage/practice-style.js");
      await setDefaultPracticeStyle(t.getAttribute("data-style"));
      closeSheet();
      const nextAction = t.getAttribute("data-next");
      const id = t.getAttribute("data-id");
      if (nextAction === "start-design") startDesignDrill(id);
      else if (nextAction === "start-estimation") startEstimationDrill(id);
      else if (nextAction === "start-bottleneck") startBottleneckDrill(id);
      break;
    }""",
"""    case "set-first-run-style":
      (async () => {
        const { setDefaultPracticeStyle } = await import("../storage/practice-style.js");
        const { closeSheet } = await import("./core.js");
        await setDefaultPracticeStyle(t.getAttribute("data-style"));
        closeSheet();
        const nextAction = t.getAttribute("data-next");
        const did = t.getAttribute("data-id");
        if (nextAction === "start-design") startDesignDrill(did);
        else if (nextAction === "start-estimation") startEstimationDrill(did);
        else if (nextAction === "start-bottleneck") startBottleneckDrill(did);
      })().catch(() => {});
      break;"""
)

code = code.replace(
"""    case "set-you-practice-style": {
      const { setDefaultPracticeStyle } = await import("../storage/practice-style.js");
      await setDefaultPracticeStyle(t.getAttribute("data-style"));
      closeSheet();
      you();
      break;
    }""",
"""    case "set-you-practice-style":
      (async () => {
        const { setDefaultPracticeStyle } = await import("../storage/practice-style.js");
        const { closeSheet } = await import("./core.js");
        const { you } = await import("./views/you.js");
        await setDefaultPracticeStyle(t.getAttribute("data-style"));
        closeSheet();
        you();
      })().catch(() => {});
      break;"""
)

code = code.replace(
"""    case "start-design":
    case "start-estimation":
    case "start-bottleneck": {
      const { getDefaultPracticeStyle } = await import("../storage/practice-style.js");
      const current = await getDefaultPracticeStyle();
      if (!current) {
        const { openFirstRunSheet } = await import("./views/set-detail.js");
        openFirstRunSheet(action, id);
      } else {
        if (action === "start-design") startDesignDrill(id);
        else if (action === "start-estimation") startEstimationDrill(id);
        else if (action === "start-bottleneck") startBottleneckDrill(id);
      }
      break;
    }""",
"""    case "start-design":
    case "start-estimation":
    case "start-bottleneck":
      (async () => {
        const { getDefaultPracticeStyle } = await import("../storage/practice-style.js");
        const current = await getDefaultPracticeStyle();
        if (!current) {
          const { openFirstRunSheet } = await import("./views/set-detail.js");
          openFirstRunSheet(action, id);
        } else {
          if (action === "start-design") startDesignDrill(id);
          else if (action === "start-estimation") startEstimationDrill(id);
          else if (action === "start-bottleneck") startBottleneckDrill(id);
        }
      })().catch(() => {});
      break;"""
)

code = code.replace(
"""    case "set-practice-style":
      applyPracticeStyle(t.getAttribute("data-style"), document.getElementById("practice-style-default")?.checked);
      break;""",
"""    case "set-practice-style":
      (async () => {
        const el = document.getElementById("practice-style-default");
        await applyPracticeStyle(t.getAttribute("data-style"), el && el.checked);
      })().catch(() => {});
      break;"""
)

with open("src/ui/panel.js", "w", encoding="utf-8") as f:
    f.write(code)

