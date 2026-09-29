export function cleanTitle(raw) {
  if (!raw) return "Untitled set";
  let t = raw;
  // strip leading speaker labels (User, You, Me, Assistant, ChatGPT, Claude, Gemini, Model)
  // with or without a following time ("9:59 AM", "09:59", "14:02"), a "said" or a colon.
  t = t.replace(/^(User|You|Me|Assistant|ChatGPT|Claude|Gemini|Model)(?:\s+(?:said|says))?(?:\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?:?\s*/i, "");
  // strip leading timestamps and dates
  t = t.replace(/^\d{1,2}:\d{2}(?:\s*(?:AM|PM))?:?\s*/i, "");
  
  t = t.replace(/\s+/g, " ").trim();
  return t || "Untitled set";
}
