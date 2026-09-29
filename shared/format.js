export function formatAvg(avg) {
  if (typeof avg !== "number" || isNaN(avg)) return null;
  return avg.toFixed(1);
}

export function formatCount(count) {
  if (typeof count !== "number" || isNaN(count)) return "0";
  if (count < 1000) return String(count);
  if (count < 1000000) {
    const k = (count / 1000).toFixed(1);
    return k.endsWith(".0") ? k.slice(0, -2) + "k" : k + "k";
  }
  const m = (count / 1000000).toFixed(1);
  return m.endsWith(".0") ? m.slice(0, -2) + "M" : m + "M";
}
