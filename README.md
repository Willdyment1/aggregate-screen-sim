# Aggregate Screening Simulator

A web app that sizes and simulates a multi-deck vibrating screen for aggregate
processing using the **VSMA (Vibrating Screen Manufacturers Association) factor
method**.

- **Units:** material sizes in **mm**; feed rate STPH (short tons/hr); screen
  width/length in ft; bulk density lb/ft³. (VSMA tables are inch-keyed; sizes are
  converted mm→in only inside those lookups.)
- **Scope:** one screen, **1–4 decks** (add/remove). Design efficiency default 90%.
- Sizes each deck (required area vs. actual → utilization) **and** simulates the
  product streams (tonnage + gradation).
- **Closed circuit:** optionally the top deck makes no product — its oversize is
  crushed (Gaudin–Schuhmann product model, adjustable `n`) and recirculated into
  the feed; the sim solves the steady-state recirculating load.

## Run

```bash
nvm use              # Node 24 (installed via nvm)
npm install
npm run dev          # http://localhost:5173
npm test             # engine unit tests (Vitest)
npm run build        # typecheck + production build
```

## Coefficient data

The factor tables in [`src/engine/tables.ts`](src/engine/tables.ts) are
transcribed from the VSMA Handbook (9-factor method) and **validated against the
Handbook's own worked example** — the engine reproduces its 48 / 93 / 111 ft²
required-area results and 45 / 75 / 90 / 90 STPH product split exactly (see
`engine.test.ts`). A few `% open area` values (Factor G denominator) for openings
outside that example are marked `VERIFY` and should be confirmed against a
clearer scan; they only matter when a non-standard cloth is specified.

## Architecture

```
src/
  model/types.ts        Domain types (Feed, Screen, Deck, Stream, results)
  engine/               Pure TS, no UI, unit-tested
    gradation.ts        Sieve math: % passing, oversize/half-size, blending
    tables.ts           VSMA coefficient tables (inch-keyed)
    vsma.ts             A-I factor method (mm->in conversion), required-area calc
    separation.ts       Ideal split at the opening -> product gradations
    crusher.ts          Gaudin-Schuhmann crusher product (closed circuit)
    simulate.ts         Chains 1-4 decks + closed-circuit solver, mass balance
    engine.test.ts      12 tests (Handbook validation, closed circuit, mass)
  ui/                   React components (charts via inline SVG, no chart dep)
  App.tsx               Compose panels + JSON save/load + PDF (print) export
```

The engine is deliberately UI-free and fully tested so the math is verifiable in
isolation and reusable later (e.g. a crusher circuit or full flowsheet).

## The VSMA method (9-factor)

For each deck:

```
required area (ft^2) = U / (A . B . C . D . E . F . G . H . I)
U = STPH of undersize (material passing the deck opening)
```

| Factor | Meaning |
|--------|---------|
| A | Basic capacity (STPH/ft²) from opening size |
| B | % oversize in feed to the deck |
| C | % half-size (finer than ½ aperture) |
| D | Deck location (top 1.00 / 2nd 0.90 / 3rd 0.80) |
| E | Wet-screening bonus (dry = 1.00) |
| F | Material weight ÷ 100 lb/ft³ |
| G | Actual ÷ standard open area |
| H | Opening shape (square / short slot / long slot) |
| I | Objective efficiency (95% = 1.00, 90% = 1.15, …) |

Products split by ideal separation at each opening (matches the Handbook), and a
discharge-end bed-depth check is reported per deck.

## Screening model

- **Ideal cut** (default): perfect separation at each opening — matches the VSMA
  Handbook; product bands are narrow (steep gradation curves).
- **Realistic screening** (toggle): a Whiten partition (Tromp) curve driven by
  deck efficiency, so products have realistic tails and tonnages shift by the
  misplaced material. VSMA sizing (required area) is unaffected — it always uses
  the ideal undersize U.

## Roadmap

- Replace the provisional Gaudin–Schuhmann crusher curve with a digitized
  production curve (tied to the crusher's closed-side setting).
- Confirm the `VERIFY`-flagged open-area values.
- Product spec/tolerance bands; metric (t/h) feed-rate option.
- Later: multi-unit flowsheet.

Bed-depth check (flags decks over ~4× the opening) and a screen-size recommender
(smallest standard screen adequate on every deck) are built.
