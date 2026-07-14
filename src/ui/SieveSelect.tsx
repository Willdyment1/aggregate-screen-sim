import { STANDARD_SIEVES } from '../model/sieves';

/**
 * Parse a user-typed size into mm. A fraction or a quote means inches
 * (e.g. "9/16", "1-1/4", "0.5\"" → ×25.4); a plain number is millimetres.
 */
export function parseSize(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const isInch = raw.includes('"') || raw.includes('/') || /\bin(ch(es)?)?\b/i.test(raw);
  const clean = raw.replace(/["']|in(ch(es)?)?|mm/gi, '').trim();
  let val: number;
  if (clean.includes('/')) {
    const m = clean.match(/^(\d+(?:\.\d+)?)?[\s-]*(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const whole = m[1] ? parseFloat(m[1]) : 0;
    const denom = parseFloat(m[3]);
    if (!denom) return null;
    val = whole + parseFloat(m[2]) / denom;
  } else {
    val = parseFloat(clean);
    if (!Number.isFinite(val)) return null;
  }
  const mm = isInch ? val * 25.4 : val;
  return mm > 0 ? Math.round(mm * 100) / 100 : null;
}

const CUSTOM = '__custom__';

/** Opening/size dropdown of standard sieves, plus a "Custom…" entry that lets
 *  you type any size in mm or inches. */
export function SieveSelect({ value, onChange, className }: { value: number; onChange: (mm: number) => void; className?: string }) {
  const isStandard = STANDARD_SIEVES.some((s) => s.mm === value);
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => {
        if (e.target.value === CUSTOM) {
          const s = window.prompt('Custom opening — enter mm (e.g. 14.3) or inches (e.g. 9/16 or 0.5")');
          const mm = s ? parseSize(s) : null;
          if (mm) onChange(mm);
          return;
        }
        onChange(+e.target.value);
      }}
    >
      {!isStandard && <option value={value}>{value} mm (custom)</option>}
      {STANDARD_SIEVES.map((s) => (
        <option key={s.mm} value={s.mm}>
          {s.label} ({s.mm} mm)
        </option>
      ))}
      <option value={CUSTOM}>Custom size…</option>
    </select>
  );
}
