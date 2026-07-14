import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
  className?: string;
  id?: string;
  placeholder?: string;
  title?: string;
  list?: string;
  'aria-label'?: string;
}

/**
 * A controlled number input that can be *emptied* while typing instead of
 * snapping straight back to 0. It keeps a local text string so intermediate
 * states ("", "-", "1.") are allowed; only a valid number is pushed to the
 * model, and an empty/invalid field reverts to the current value on blur.
 */
export function NumberField({ value, onChange, min, max, step, ...rest }: Props) {
  const [text, setText] = useState(() => String(value));
  const editing = useRef(false);

  // Reflect external changes (presets, undo, apply, back-solve) unless the user
  // is actively editing this field (so we don't fight their cursor).
  useEffect(() => {
    if (!editing.current) setText(Number.isFinite(value) ? String(value) : '');
  }, [value]);

  const handle = (raw: string) => {
    setText(raw);
    const t = raw.trim();
    // Empty or partial input stays local — don't clobber the model with 0.
    if (t === '' || t === '-' || t === '.' || t === '-.') return;
    const n = Number(t);
    if (Number.isFinite(n)) onChange(n);
  };

  const blur = () => {
    editing.current = false;
    const n = Number(text);
    // Left empty/invalid → restore the current model value.
    if (text.trim() === '' || !Number.isFinite(n)) {
      setText(Number.isFinite(value) ? String(value) : '');
      return;
    }
    // Clamp to the allowed range so out-of-range values (e.g. 7% efficiency,
    // negative feed) snap back into bounds instead of sticking.
    let clamped = n;
    if (min != null && clamped < min) clamped = min;
    if (max != null && clamped > max) clamped = max;
    if (clamped !== n) {
      setText(String(clamped));
      onChange(clamped);
    }
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      onFocus={() => (editing.current = true)}
      onChange={(e) => handle(e.target.value)}
      onBlur={blur}
      {...rest}
    />
  );
}
