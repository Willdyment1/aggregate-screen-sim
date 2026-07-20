import { useEffect } from 'react';

/** Methodology / assumptions modal — what the numbers mean and where they come from. */
export function HowItWorks({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="How it works" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>How it works</h2>
          <button className="link-btn" onClick={onClose} aria-label="Close">close ✕</button>
        </div>
        <div className="modal-body">
          <p>
            You build a plant (feeds, screens, crushers, stockpiles) and wire the outputs together. Everything
            else — sizing, tonnages, gradations and the flowsheet — is computed from that one model.
          </p>

          <h3>Screen sizing — VSMA 9-factor method</h3>
          <p>
            Each deck's required area is <code>Area = TPH&nbsp;passing / (A·B·C·D·E·F·G·H·I)</code>, where the nine
            factors adjust a base capacity <em>A</em> for the material and the job: <strong>B</strong> oversize,
            <strong> C</strong> half-size, <strong>D</strong> deck location, <strong>E</strong> wet screening,
            <strong> F</strong> material density, <strong>G</strong> open area, <strong>H</strong> opening shape and
            <strong> I</strong> near-size (efficiency). If the required area exceeds the deck's actual area, the deck
            is flagged as overloaded. This reproduces the Handbook worked example (48 / 93 / 111 ft²) exactly.
          </p>

          <h3>Ideal vs realistic screening</h3>
          <p>
            In <em>ideal</em> mode every particle finer than the opening passes — a perfectly sharp cut. Turn on
            <strong> Realistic screening</strong> and each deck instead uses a partition (Tromp) curve: near-size
            material is misplaced, so a little fine carries over into the oversize and vice-versa, and the deck only
            reaches the efficiency the VSMA factors allow. Results shift meaningfully — it's the more truthful model.
          </p>

          <h3>Crushers</h3>
          <p>
            Product curves are approximations: <strong>cone</strong> and <strong>HSI</strong> are digitized from Metso
            Nordberg gradation charts (~80–85% passing at the setting), <strong>jaw/gyratory</strong> use a coarse
            compression product, and the <strong>VSI</strong> is speed-controlled (higher rotor speed = more fines, top
            size barely drops). A crusher only reaches its rated product when it has enough reduction to do.
          </p>

          <h3>The plant solver</h3>
          <p>
            Streams flow from unit to unit along your wiring, including <strong>recycle loops</strong> (a crusher
            returning to a screen). Loops are converged by successive substitution; a loop that never settles is capped
            and flagged as a <em>runaway</em>. Mass is conserved end-to-end, and bulk density is tracked per stream.
          </p>

          <h3>Gradations &amp; stockpiles</h3>
          <p>
            <strong>% passing</strong> at a size is the weight fraction of material finer than that size (what would
            fall through a sieve of that opening). A stockpile's gradation is the tonnage-weighted blend of every stream
            routed into it — so combining a coarse and a medium product gives a curve between the two.
          </p>

          <p className="modal-note">
            This is an independent engineering demo styled in the Amrize brand for portfolio purposes — not affiliated
            with or endorsed by Amrize. It's for education and estimating; verify against manufacturer data and the VSMA
            Handbook before relying on it for real designs.
          </p>
        </div>
      </div>
    </div>
  );
}
