import { useState } from 'react';

/** A small ⓘ that reveals a plain-English explanation when pressed (click/tap or
 *  keyboard). Press again, click away, or hit Esc to dismiss. */
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="infotip-wrap">
      <button
        type="button"
        className="infotip"
        aria-label={text}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        ⓘ
      </button>
      {open && (
        <span className="infotip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
