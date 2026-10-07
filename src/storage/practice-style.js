import { getSettings, saveSettings } from "./store.js";

export const STYLES = {
  GUIDED: "guided",
  SIMULATION: "simulation"
};

export async function getDefaultPracticeStyle() {
  const s = await getSettings();
  return s.systemDesignPracticeStyle || null;
}

export async function setDefaultPracticeStyle(style) {
  if (style !== STYLES.GUIDED && style !== STYLES.SIMULATION) return;
  await saveSettings({ systemDesignPracticeStyle: style });
}
