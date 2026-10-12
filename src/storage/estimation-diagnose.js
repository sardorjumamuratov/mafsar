// A likely reasoning slip behind an estimate, found from the ratio between the
// answer and the reference (docs/prompts/38 §8.1). Pure and deterministic, so no
// model call per question; unit tested in tests/estimation-diagnose.test.mjs.
//
// It only explains a miss: callers show it when the verdict isn't "spot on", and
// it never contradicts that verdict.

const near = (ratio, target) => ratio > target * 0.9 && ratio < target * 1.11;

/**
 * @param {number} answer   the learner's value, in the reference's base unit
 * @param {number} expected the reference value, same unit
 * @param {boolean} [isPeakRequested] the question asks for peak, not average, traffic
 * @returns {string|null}
 */
export function diagnoseEstimation(answer, expected, isPeakRequested = false) {
  if (!Number.isFinite(answer) || !Number.isFinite(expected) || answer <= 0 || expected <= 0) return null;
  const ratio = Math.max(answer / expected, expected / answer);
  if (ratio <= 2) return null; // within 2x counts as correct: nothing to explain

  if (near(ratio, 8)) return "Off by a factor of 8: check whether bits and bytes got mixed up.";
  if (near(ratio, 24)) return "Off by a factor of 24: check the conversion between hours and days.";
  if (near(ratio, 60)) return "Off by a factor of 60: check the conversion between seconds, minutes and hours.";
  if (near(ratio, 3600)) return "Off by a factor of 3,600: check the conversion between hours and seconds.";
  if (near(ratio, 86400)) return "Off by a factor of 86,400: check the conversion between days and seconds.";
  if (near(ratio, 1000) || near(ratio, 1024)) return "Off by a factor of 1,000: check the unit prefixes (thousands, millions, billions).";
  if (near(ratio, 1e6)) return "Off by a factor of a million: check the unit prefixes.";
  // Forgetting the peak factor leaves the answer a few times too low.
  if (isPeakRequested && answer < expected && ratio < 5) return "Below the reference by a peak factor: the question asks for peak, not average, traffic.";
  return null;
}
