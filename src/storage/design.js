
export const MAX_DESIGN_CHARS = 4000;

const TITLES = {
  requirements: "Requirements",
  estimates: "Estimates",
  api: "API",
  dataModel: "Data model",
  components: "Components & flow",
  bottlenecks: "Bottlenecks & trade-offs"
};

export function assembleAnswer(sections) {
  let ans = "";
  for (const [key, title] of Object.entries(TITLES)) {
    const val = (sections[key] || "").trim();
    if (val) {
      ans += `${ans ? "\n\n" : ""}${title}:\n${val}`;
    }
  }
  return ans.slice(0, MAX_DESIGN_CHARS);
}

export function reviewGradeForDesign(status) {
  if (status === "strong" || status === "covered") return 4;
  if (status === "partial") return 2;
  if (status === "weak" || status === "missed") return 1;
  return null;
}

