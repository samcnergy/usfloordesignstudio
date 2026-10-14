// Inch formatting and parsing. Everything is stored in decimal inches and
// shown to the nearest 1/8".

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** 34.5 -> 34 1/2"   0.75 -> 3/4"   36 -> 36" */
export function fmtIn(value: number, withMark = true): string {
  const neg = value < 0;
  const eighths = Math.round(Math.abs(value) * 8);
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  let s = "";
  if (rem === 0) s = String(whole);
  else {
    const g = gcd(rem, 8);
    const frac = `${rem / g}/${8 / g}`;
    s = whole === 0 ? frac : `${whole} ${frac}`;
  }
  return (neg ? "-" : "") + s + (withMark ? '"' : "");
}

/** 150 -> 12'-6"  */
export function fmtFtIn(value: number): string {
  const eighths = Math.round(value * 8);
  const feet = Math.floor(eighths / 96);
  const inches = (eighths - feet * 96) / 8;
  return `${feet}'-${fmtIn(inches)}`;
}

/** Accepts 34.5, 34 1/2, 34-1/2", 3/4, 12', 12'6", 12' 6 1/2", 12ft 6in. Returns null if unreadable. */
export function parseLength(input: string): number | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/feet|foot|ft/g, "'").replace(/inches|inch|in/g, '"').replace(/”|″/g, '"').replace(/’|′/g, "'");
  let feet = 0;
  const ft = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(.*)$/);
  if (ft) {
    feet = parseFloat(ft[1]);
    s = ft[2];
  }
  s = s.replace(/"/g, "").trim();
  let inches = 0;
  if (s) {
    const mixed = s.match(/^(\d+(?:\.\d+)?)?\s*-?\s*(?:(\d+)\s*\/\s*(\d+))?$/);
    if (!mixed || (!mixed[1] && !mixed[2])) return null;
    if (mixed[1]) inches += parseFloat(mixed[1]);
    if (mixed[2] && mixed[3]) {
      const den = parseInt(mixed[3], 10);
      if (den === 0) return null;
      inches += parseInt(mixed[2], 10) / den;
    }
  }
  const total = feet * 12 + inches;
  return Number.isFinite(total) ? total : null;
}

export function round8(v: number): number {
  return Math.round(v * 8) / 8;
}

export function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}
