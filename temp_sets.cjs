import { app, bundle, setHTML, esc, topOfView } from "../core.js";
import { setNav } from "../nav.js";
import { renderSetDetail } from "./set-detail.js";
import { ICONS } from "../icons.js";
import { SetRow, BottomSheet, SectionLabel, PrimaryButton } from "../components.js";
import { cleanTitle } from "../../shared/titles.js";
import { saveSettings } from "../../storage/store.js";

let state = {
  query: "",
  filterShow: "All sets", // "All sets", "Due now", "Global", "Private"
};

export async function renderSets() {
  const { studySets, settings } = bundle();
  const sortOrder = settings.sortOrder || "Most due";
  let sets = [...studySets];
  
  // 1. Filter by Show
  if (state.filterShow === "Due now") {
    sets = sets.filter(s => s.due > 0);
  } else if (state.filterShow === "Global") {
    sets = sets.filter(s => s.mode === "global"); // Or however global is defined
  } else if (state.filterShow === "Private") {
    sets = sets.filter(s => s.mode !== "global");
  }

  // 2. Filter by search
  let query = state.query.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (query) {
    sets = sets.filter(s => {
      let t = cleanTitle(s.title).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (t.includes(query)) return true;
      // Note: searching cards requires loading them, we assume studySets has cards or we just search title here for now, wait, prompt says "matching the cleaned set title and the card question and answer text"
      // we have s.cards? We might not have cards in studySets if they are not loaded, wait! 
      // The prompt says "matching the cleaned set title and the card question and answer text."
      // Assuming studySets has `.cards` ? Wait, in previous MAFSAR, `studySets` is an array of Sets, wait, we need to check if `s.cards` exists.
      return false; // I'll fix this below
    });
  }

  // ... Wait, let me check how studySets are structured.
}
