// Mechanism chains (Medicine mode): pure rules, no DOM or chrome.*, so they're
// unit tested (tests/chains.test.mjs).
//
// A chain belongs to a study set: { id, template, title, updatedAt, deleted?, steps }.
// A step is { id, key, statement, why, edited?, updatedAt, deleted? }. Deletes are
// tombstones so they sync. Templates make other chain types (law, drugs) data,
// not code; only the medicine template ships.

export const TEMPLATES = {
  "medicine-condition": {
    label: "Condition",
    steps: [
      { key: "cause", label: "Cause" },
      { key: "mechanism", label: "Mechanism" },
      { key: "physiological", label: "Physiological change" },
      { key: "symptoms", label: "Symptoms" },
      { key: "signs", label: "Signs" },
      { key: "tests", label: "Tests" },
      { key: "diagnosis", label: "Diagnosis" },
      { key: "treatment", label: "Treatment" },
    ],
  },
};
export const DEFAULT_TEMPLATE = "medicine-condition";

export function templateSteps(templateId) {
  return (TEMPLATES[templateId] || TEMPLATES[DEFAULT_TEMPLATE]).steps;
}

export function stepLabel(templateId, key) {
  return templateSteps(templateId).find((s) => s.key === key)?.label || key;
}

const live = (x) => x && !x.deleted;

/** Chains not deleted, each with only its live steps. */
export function liveChains(chains) {
  return (chains || []).filter(live).map((ch) => ({ ...ch, steps: (ch.steps || []).filter(live) }));
}

/** The chain's steps in template order, with null where the source had nothing. */
export function orderedSteps(chain) {
  const byKey = new Map((chain.steps || []).filter(live).map((s) => [s.key, s]));
  return templateSteps(chain.template).map((t) => ({ ...t, step: byKey.get(t.key) || null }));
}

export function chainCoverage(chain) {
  const rows = orderedSteps(chain);
  return { filled: rows.filter((r) => r.step && r.step.statement).length, total: rows.length };
}

const norm = (t) => String(t || "").trim().toLowerCase();

/**
 * Merge freshly generated chains into the set's existing ones on (re)generation.
 * - A regenerated condition keeps its chain id; steps keep their ids by key.
 * - A step the learner edited is never overwritten, and survives even if the new
 *   output dropped it.
 * - A condition the new output dropped is tombstoned, unless it holds edits.
 * Everything that changes gets a fresh updatedAt so it syncs.
 * @param {any[]} existing
 * @param {any[]} generated
 * @param {{ now?: string, uid?: () => string }} [opts]
 */
export function mergeChains(existing, generated, { now = new Date().toISOString(), uid } = {}) {
  if (typeof uid !== "function") throw new Error("mergeChains needs uid");
  const out = [];
  const oldByTitle = new Map((existing || []).filter(live).map((ch) => [norm(ch.title), ch]));
  const seen = new Set();

  for (const g of generated || []) {
    const old = oldByTitle.get(norm(g.title));
    if (old) seen.add(old.id);
    const oldSteps = new Map(((old && old.steps) || []).filter(live).map((s) => [s.key, s]));
    const steps = [];
    for (const gs of g.steps || []) {
      const prev = oldSteps.get(gs.key);
      oldSteps.delete(gs.key);
      if (prev && prev.edited) {
        steps.push(prev);
      } else if (prev && prev.statement === gs.statement && (prev.why || "") === (gs.why || "")) {
        steps.push(prev); // unchanged: keep its timestamp, nothing to sync
      } else {
        steps.push({ id: prev ? prev.id : uid(), key: gs.key, statement: gs.statement, why: gs.why || "", updatedAt: now });
      }
    }
    // Steps the new output no longer has: keep edits, tombstone the rest.
    for (const prev of oldSteps.values()) {
      steps.push(prev.edited ? prev : { ...prev, deleted: true, updatedAt: now });
    }
    out.push({
      id: old ? old.id : uid(),
      template: (old && old.template) || DEFAULT_TEMPLATE,
      title: String(g.title).trim(),
      updatedAt: now,
      steps: [...steps, ...(((old && old.steps) || []).filter((s) => s.deleted))],
    });
  }

  for (const old of (existing || [])) {
    if (!live(old)) { out.push(old); continue; }
    if (seen.has(old.id)) continue;
    const hasEdits = (old.steps || []).some((s) => live(s) && s.edited);
    out.push(hasEdits ? old : { ...old, deleted: true, updatedAt: now });
  }
  return out;
}

/**
 * The learner edits (or fills) one step. Returns a new chain; marks the step
 * edited so regeneration keeps it. An empty statement deletes the step.
 * @param {any} chain
 * @param {string} key
 * @param {{ statement?: string, why?: string }} values
 * @param {{ now?: string, uid?: () => string }} [opts]
 */
export function editStep(chain, key, { statement, why }, { now = new Date().toISOString(), uid } = {}) {
  const text = String(statement || "").trim().slice(0, 1000);
  const reason = String(why || "").trim().slice(0, 1000);
  const steps = (chain.steps || []).map((s) => ({ ...s }));
  const current = steps.find((s) => live(s) && s.key === key);
  if (current) {
    if (!text) Object.assign(current, { deleted: true, updatedAt: now });
    else Object.assign(current, { statement: text, why: reason, edited: true, updatedAt: now });
  } else if (text) {
    if (typeof uid !== "function") throw new Error("editStep needs uid to add a step");
    steps.push({ id: uid(), key, statement: text, why: reason, edited: true, updatedAt: now });
  }
  return { ...chain, steps, updatedAt: now };
}
