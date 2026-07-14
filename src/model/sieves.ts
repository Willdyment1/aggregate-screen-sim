// Standard sieve designations <-> opening size (mm).
// Lets the UI show gradations by their sieve designation (#200, 3/8", 1.06", ...)
// exactly as on the Lafarge report, while the engine keeps working in mm.

export interface StandardSieve {
  /** Designation shown to the user, e.g. "#200", "3/8\"", "1.06\"". */
  label: string;
  /** Square opening, mm. */
  mm: number;
  /** Whether to draw/label this sieve as a tick on the gradation chart. */
  major: boolean;
}

// Descending by size. Includes the exact designations used on the Lafarge
// "Dundas Washplant Feed" report (1.06", 0.530", #4 ... #200).
export const STANDARD_SIEVES: StandardSieve[] = [
  { label: '4"', mm: 101.6, major: true },
  { label: '3"', mm: 76.2, major: true },
  { label: '2.5"', mm: 63.5, major: false },
  { label: '2"', mm: 50.8, major: true },
  { label: '1.5"', mm: 37.5, major: true },
  { label: '1-1/4"', mm: 31.75, major: false },
  { label: '1.06"', mm: 26.5, major: false },
  { label: '1"', mm: 25.4, major: true },
  { label: '7/8"', mm: 22.2, major: false },
  { label: '3/4"', mm: 19.0, major: true },
  { label: '5/8"', mm: 15.9, major: false },
  { label: '9/16"', mm: 14.3, major: false },
  { label: '0.530"', mm: 13.2, major: false },
  { label: '1/2"', mm: 12.5, major: false },
  { label: '7/16"', mm: 11.1, major: false },
  { label: '3/8"', mm: 9.5, major: true },
  { label: '5/16"', mm: 7.9, major: false },
  { label: '1/4"', mm: 6.3, major: false },
  { label: '#4', mm: 4.75, major: true },
  { label: '#8', mm: 2.36, major: true },
  { label: '#10', mm: 2.0, major: false },
  { label: '#16', mm: 1.18, major: true },
  { label: '#30', mm: 0.6, major: true },
  { label: '#50', mm: 0.3, major: true },
  { label: '#100', mm: 0.15, major: true },
  { label: '#200', mm: 0.075, major: true },
];

/** Designation for an opening in mm (nearest standard sieve, else the mm value). */
export function sieveLabel(mm: number): string {
  const match = STANDARD_SIEVES.find((s) => Math.abs(s.mm - mm) < Math.max(0.01, mm * 0.02));
  return match ? match.label : `${mm} mm`;
}

/** Major sieves that fall within [min, max] mm, for chart tick marks. */
export function chartSieves(min: number, max: number): StandardSieve[] {
  return STANDARD_SIEVES.filter((s) => s.major && s.mm >= min && s.mm <= max);
}
