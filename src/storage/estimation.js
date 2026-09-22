// Estimation drills: parse a human estimate ("12k QPS", "300 TB", "2.5 GB/s",
// "1.5 million users", "10 Gbps") into a value in base units plus its kind, and
// grade it against the reference by order of magnitude. Pure, so it's unit
// tested (tests/estimation.test.mjs). The model never grades the number.

const MULTIPLIERS = { thousand: 1e3, million: 1e6, mn: 1e6, billion: 1e9, bn: 1e9, trillion: 1e12 };
const PREFIX = { k: 1e3, m: 1e6, g: 1e9, t: 1e12, p: 1e15 };
const PER_SECONDS = { s: 1, sec: 1, second: 1, min: 60, minute: 60, h: 3600, hr: 3600, hour: 3600, d: 86400, day: 86400, mo: 2592000, month: 2592000, y: 31536000, yr: 31536000, year: 31536000 };
const COUNT_UNITS = /^(?:req(?:uest)?s?|users?|servers?|machines?|nodes?|ops?|messages?|msgs?|tweets?|posts?|events?|queries?|writes?|reads?|items?|rows?|objects?|files?|images?|videos?|connections?)$/i;

/** { value (base units), kind: "data" | "data_rate" | "rate" | "count", original } or null. */
export function parseEstimation(input) {
  if (input == null) return null;
  const original = String(input).trim();
  const s = original.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const m = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(.*)$/i);
  if (!m) return null;
  let value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  let rest = m[2].trim();

  // Time: "per day", "/s", "a month", or QPS-style units.
  let perSeconds = 0;
  const per = rest.match(/(?:\/\s*|\bper\s+|\ba\s+)(sec|second|s|minute|min|hour|hr|h|day|d|month|mo|year|yr|y)s?\.?$/i);
  if (per) {
    perSeconds = PER_SECONDS[per[1].toLowerCase()];
    rest = rest.slice(0, per.index).trim();
  }
  const qps = rest.match(/\s*\b(qps|rps|tps)$/i);
  if (qps) {
    perSeconds = perSeconds || 1;
    rest = rest.slice(0, qps.index).trim();
  }

  // Word multipliers: "1.5 million", "2 bn".
  const word = rest.match(/^(thousand|million|billion|trillion|bn|mn)\b\s*/i);
  if (word) {
    value *= MULTIPLIERS[word[1].toLowerCase()];
    rest = rest.slice(word[0].length);
  }

  let kind = "count";
  // Data: an optional SI prefix, then bytes or bits. Case matters for the unit
  // letter: B is bytes, b is bits (so "10 Gb" is 1.25 GB).
  const data = rest.match(/^([kKmMgGtTpP])?(bytes?|bits?|bps|Bps|B|b)(\/s)?(?:\s+.*)?$/);
  if (data) {
    const pre = data[1] ? PREFIX[data[1].toLowerCase()] : 1;
    const unit = data[2];
    const isBits = /^bits?$/.test(unit) || unit === "b" || unit === "bps";
    const isRate = unit === "bps" || unit === "Bps" || !!data[3];
    value = (value * pre) / (isBits ? 8 : 1);
    kind = "data";
    if (isRate) perSeconds = perSeconds || 1;
  } else {
    // A bare k/M/G before a count unit or nothing: "12k", "3M users", "5 k servers".
    const pre = rest.match(/^([kKmMgGtT])(?=\s|$)\s*/);
    if (pre) {
      value *= PREFIX[pre[1].toLowerCase()];
      rest = rest.slice(pre[0].length);
    }
    const unitWord = (rest.split(/\s+/)[0] || "").replace(/[.,]$/, "");
    if (unitWord && !COUNT_UNITS.test(unitWord)) return null;
  }

  if (perSeconds) {
    value /= perSeconds;
    kind = kind === "data" ? "data_rate" : "rate";
  }
  return { value, kind, original };
}

/** A reference answer from the model: number + unit string. */
export function parseReference(value, unit) {
  return parseEstimation(`${value} ${unit || ""}`.trim());
}

export function sameKind(ref, ans) {
  return !!ref && !!ans && ref.kind === ans.kind;
}

/** Tolerance bands: within 2x is spot on, within 10x is the right ballpark. */
export const BANDS = { spot_on: 2, ballpark: 10 };

export function gradeEstimation(ref, ans) {
  if (!ref || !ans || !sameKind(ref, ans)) return "off";
  if (ref.value === 0 && ans.value === 0) return "spot_on";
  if (ref.value <= 0 || ans.value <= 0) return "off";
  const ratio = Math.max(ref.value / ans.value, ans.value / ref.value);
  if (ratio <= BANDS.spot_on * 1.0001) return "spot_on";
  if (ratio <= BANDS.ballpark * 1.0001) return "ballpark";
  return "off";
}

const KIND_WORDS = { data: "a data size", data_rate: "a data rate", rate: "a rate per time", count: "a plain count" };
/** Why an answer can't be compared, for the feedback line ("" when it can). */
export function mismatchNote(ref, ans) {
  if (!ref || !ans || sameKind(ref, ans)) return "";
  return `The answer is ${KIND_WORDS[ref.kind]}, but you gave ${KIND_WORDS[ans.kind]}.`;
}
