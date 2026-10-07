export function diagnoseEstimation(answer, expected, isPeakRequested) {
  if (!answer || !expected || answer <= 0 || expected <= 0) return null;
  const ratio = Math.max(answer / expected, expected / answer);

  const near = (target) => ratio > target * 0.9 && ratio < target * 1.11;

  if (near(8)) return "Your answer is off by a factor of 8. Check if you mixed up bits and bytes.";
  if (near(24)) return "Your answer is off by a factor of 24. Did you forget to convert between hours and days?";
  if (near(60)) return "Your answer is off by a factor of 60. Did you forget to convert between minutes and seconds, or hours and minutes?";
  if (near(3600)) return "Your answer is off by a factor of 3,600. Did you forget to convert between hours and seconds?";
  if (near(86400)) return "Your answer is off by a factor of 86,400. Did you forget to convert between days and seconds?";
  if (near(1000) || near(1024)) return "Your answer is off by a factor of 1,000. Double-check your prefixes (e.g. millions vs billions).";
  
  if (isPeakRequested && near(2)) return "Your answer is off by a factor of 2. Did you account for peak vs average traffic?";

  return null;
}
