
export function parseEstimation(input) {
  if (!input) return null;
  const str = String(input).toLowerCase().replace(/,/g, "");
  
  const numMatch = str.match(/^(-?\d+(\.\d+)?(?:e[+-]?\d+)?)/);
  if (!numMatch) return null;
  
  let val = parseFloat(numMatch[1]);
  let rest = str.slice(numMatch[0].length).trim();
  
  let replaced = rest
    .replace(/million/, "m")
    .replace(/billion/, "g")
    .replace(/trillion/, "t");
    
  if (replaced.startsWith("k")) { val *= 1e3; replaced = replaced.slice(1); }
  else if (replaced.startsWith("m") && !replaced.startsWith("min") && !replaced.startsWith("mo")) { val *= 1e6; replaced = replaced.slice(1); }
  else if (replaced.startsWith("g")) { val *= 1e9; replaced = replaced.slice(1); }
  else if (replaced.startsWith("t")) { val *= 1e12; replaced = replaced.slice(1); }
  else if (replaced.startsWith("p")) { val *= 1e15; replaced = replaced.slice(1); }
  
  let isBits = false;
  
  if (replaced.includes("bit") || replaced.includes("bps")) isBits = true;
  
  if (isBits) val /= 8;
  
  let timeDivisor = 1;
  if (replaced.includes("/day") || replaced.includes("/ day") || replaced.includes("per day")) timeDivisor = 86400;
  else if (replaced.includes("/h") || replaced.includes("/ h") || replaced.includes("per hour")) timeDivisor = 3600;
  else if (replaced.includes("/m") || replaced.includes("/ m") || replaced.includes("per min")) timeDivisor = 60;
  else if (replaced.includes("/mo") || replaced.includes("/ mo") || replaced.includes("per month")) timeDivisor = 86400 * 30;
  else if (replaced.includes("/y") || replaced.includes("/ y") || replaced.includes("per year")) timeDivisor = 86400 * 365;
  
  return { value: val / timeDivisor, original: input };
}

export function gradeEstimation(ref, ans) {
  if (!ref || !ans) return "off";
  if (ref.value === 0 && ans.value === 0) return "spot_on";
  if (ref.value === 0 || ans.value === 0) return "off";
  
  // same sign check
  if ((ref.value < 0) !== (ans.value < 0)) return "off";
  
  const ratio = Math.max(ref.value / ans.value, ans.value / ref.value);
  if (ratio <= 2.01) return "spot_on";
  if (ratio <= 10.01) return "ballpark";
  return "off";
}

