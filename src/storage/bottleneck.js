
/**
 * Renders an array of architecture components into an indented text diagram.
 * Example: ["Client", "CDN", "API (3x)", "Postgres primary"]
 * Output:
 * Client
 *   ↳ CDN
 *     ↳ API (3x)
 *       ↳ Postgres primary
 */
export function renderArchitecture(components) {
  if (!Array.isArray(components) || components.length === 0) return "";
  return components.map((comp, i) => {
    if (i === 0) return String(comp);
    const indent = " ".repeat((i - 1) * 2);
    return indent + "  ↳ " + String(comp);
  }).join("\n");
}

