# Aggregate Screening Simulator

A browser-based engineering tool that **sizes and simulates a whole aggregate crushing‑and‑screening plant** using the **VSMA (Vibrating Screen Manufacturers Association) 9‑factor method**. Build a circuit of feeds, screens and crushers, wire it up (branching and recycle loops included), and see live product gradations, deck loading, throughput bottlenecks, and a printable datasheet.

Everything runs client‑side — no backend — and your work auto‑saves to the browser.

## What it does

- **Multi‑unit plant builder** — start from a feed and add screens and crushers. Route every output anywhere: a deck's oversize to a crusher, a crusher back to a screen (a closed circuit), or to a product pile. **Splits** send, say, 60% of a stream one way and 40% another.
- **VSMA screen sizing** — each deck is sized by the 9‑factor method, **validated against the Handbook worked example** (reproduces its 48 / 93 / 111 ft² required areas exactly). Reports required vs. actual area, utilization, bed depth and efficiency.
- **Realistic screening** — product gradations use a Whiten/Tromp partition curve with an *achieved* efficiency derived from bed depth, near‑size content and loading, so product curves get realistic S‑shaped tails instead of perfect cuts. (VSMA sizing still uses the ideal undersize.)
- **Five crusher types** — Jaw, Gyratory, Cone, HSI and VSI, each with its own product curve (cone and HSI digitized from real Metso Nordberg charts), reduction‑ratio limits, capacity and feed‑size limit. The VSI is speed‑controlled (rotor m/s) rather than a size gap.
- **Routed‑graph solver** — the plant is a directed graph solved by successive substitution; recirculating loads build up and converge, and runaway loops are detected and flagged. Mass is conserved throughout, and per‑stream bulk density is tracked so each screen sizes on its real material weight.
- **Multiple feeds** — blend several feed sources (different materials, rates, densities) into one circuit.
- **Interactive flowsheet editor** — a pan/zoom canvas where you drag units around, wire them by dragging from output ports, and click a unit to edit it. Stays in sync with the form‑based Plant tab (both edit one shared model).
- **Analysis & output** — a plant‑wide gradation chart (every stream, spline‑smoothed), a **max‑feed / bottleneck** finder (largest fresh feed before a screen overloads or a crusher tops out, and which unit is the constraint), and a **printable one‑page datasheet** (Export PDF).

## Tech

- **React 19 · TypeScript · Vite**
- **Vitest** engine test suite (~60 tests)
- A pure, UI‑free calculation engine in `src/engine/` — all unit‑tested
- Browser‑only; state persists to `localStorage`

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173

npm run build    # type-check (tsc -b) + production build to dist/
npm test         # or: npx vitest run  — the engine test suite
```

## Architecture

```
src/
  model/     domain types, the Plant model, and pure plant mutations
  engine/    pure calculation logic (no React), fully unit-tested:
    tables.ts       VSMA coefficient tables (inch-keyed)
    vsma.ts         A–I factor method (mm→in conversion) + required-area calc
    gradation.ts    sieve math: % passing, oversize/half-size, blending
    separation.ts   ideal split at the opening → product gradations
    partition.ts    realistic (Whiten/Tromp) screening
    bedDepth.ts     discharge-end bed-depth check
    crusher.ts      per-type crusher product models (jaw/gyratory/cone/HSI/VSI)
    plant.ts        routed-graph solver (recycle loops, mass balance, runaway)
    plantMaxFeed.ts throughput / bottleneck finder
  ui/        React components (Plant builder, Flowsheet editor, Gradation, Simulator, Datasheet)
```

The plant is one source of truth (`Plant`): units (feed / screen / crusher) whose outputs are wired to targets. Every view — the editable Simulator overview, the Plant tab, the Flowsheet editor, the Gradation tab — reads and edits that same model, so they never drift. Charts are hand‑drawn inline SVG (no chart dependency).

## The VSMA method (9 factors)

For each deck, `required area (ft²) = U / (A·B·C·D·E·F·G·H·I)`, where `U` = tph of undersize (material finer than the opening):

| Factor | Meaning |
|--------|---------|
| A | Basic capacity from opening size |
| B | % oversize in feed to the deck |
| C | % half‑size (finer than ½ aperture) |
| D | Deck location (top 1.00 / 2nd 0.90 / 3rd 0.80) |
| E | Wet‑screening bonus (dry = 1.00) |
| F | Material weight ÷ 100 lb/ft³ |
| G | Actual ÷ standard open area |
| H | Opening shape (square / short slot / long slot) |
| I | Objective efficiency (95% = 1.00, 90% = 1.15, …) |

## Caveats

An engineering estimation tool, not a substitute for a manufacturer sizing. The VSMA tables are inch‑keyed (sizes convert mm→inch only inside those lookups). The cone and HSI crusher curves are digitized from Metso Nordberg charts; jaw/gyratory are grounded in Metso's published reduction ratios and product/fines specs; the VSI is a speed‑to‑fineness model (a real Barmac curve would refine it).
