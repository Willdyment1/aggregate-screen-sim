// Domain model for the aggregate screening simulator.
// Units: material sizes (sieve openings, deck apertures) = MILLIMETRES;
// tonnage = tph (short tons/hr); screen width/length = ft; travel rate = ft/min;
// bulk density = lb/ft^3. (Aggregate practice: material metric, equipment imperial.)
// The VSMA coefficient tables are inch-keyed; sizes are converted mm->in only
// inside those lookups (see vsma.ts / MM_PER_IN).

/** A single point on a sieve/gradation analysis. */
export interface SievePoint {
  /** Sieve opening size in millimetres. */
  size: number;
  /** Cumulative percent of material passing this size (0-100). */
  percentPassing: number;
}

/** A gradation is a sorted list of sieve points (descending size). */
export type Gradation = SievePoint[];

export type OpeningShape = 'square' | 'shortSlot' | 'longSlot';

/** The feed stream entering the top deck of the screen. */
export interface Feed {
  /** Total feed rate, tph. */
  tph: number;
  /** Bulk density, lb/ft^3. */
  bulkDensity: number;
  /** Screening done with spray water (invokes Factor E). */
  wet: boolean;
  gradation: Gradation;
}

/** One deck of the vibrating screen. */
export interface Deck {
  /** Square-opening (aperture) size in millimetres. */
  aperture: number;
  /** Actual open area of the cloth, percent (0-100). */
  openAreaPct: number;
  openingShape: OpeningShape;
  /**
   * Optional per-deck objective efficiency (%). Falls back to the project
   * targetEfficiency when undefined. (The Handbook example runs the top two
   * decks at 95% and the bottom deck at 90%.)
   */
  efficiency?: number;
}

/** The vibrating screen: physical dimensions + 1..4 decks. */
export interface Screen {
  /** Deck width, ft. */
  width: number;
  /** Deck length, ft. */
  length: number;
  /** Material travel rate over the deck, ft/min (for bed-depth check). */
  travelRate: number;
  decks: Deck[];
}

/**
 * Crusher used to close the circuit on the top deck. Its oversize is crushed
 * and returned to the feed. Product size is modelled with a Gaudin-Schuhmann
 * curve topping out at the top-deck aperture:  %passing(x) = 100 (x/topSize)^n.
 * `exponent` (n) is a provisional, adjustable stand-in for the real crusher
 * production curve.
 */
export interface Crusher {
  /**
   * Closed-side setting (mm) — selects the Metso HP cone production curve. If
   * it's coarser than the top-deck opening, some crushed product is still
   * oversize and recirculates (the circulating load builds up).
   */
  css: number;
  /**
   * Rated throughput capacity, tph — the most material the crusher can process
   * (its feed = the recirculating load). The circuit "overflows" the crusher
   * when the recirculating load exceeds this. Default 200 (Metso HP 300 class).
   */
  maxTph?: number;
  /** Model label for display, e.g. "HP 300". */
  model?: string;
}

/** A material stream (feed, or any product) with a rate and a gradation. */
export interface Stream {
  tph: number;
  gradation: Gradation;
  /** Bulk density (lb/ft³) of this stream — a mass-weighted blend of the feeds
   *  that reach it. Lets each screen size on its real material weight. */
  density?: number;
}

/** Per-deck sizing + simulation result. */
export interface DeckResult {
  deckIndex: number;
  aperture: number;
  /** Feed rate arriving at this deck, tph. */
  feedTph: number;
  /** U: undersize passing this deck, tph (the sizing numerator). */
  undersizeTph: number;
  /** VSMA required screening area, ft^2. */
  requiredArea: number;
  /** Actual area of this deck (width x length), ft^2. */
  actualArea: number;
  /** actualArea / requiredArea; >= 1 means adequate. */
  utilization: number;
  adequate: boolean;
  /** Objective/design efficiency used for sizing this deck (Factor I input), percent. */
  efficiency: number;
  /**
   * Efficiency this deck actually achieves given its operating conditions (bed
   * depth, near-size, loading). Drives the realistic product curve. Equals
   * `efficiency` in ideal mode or when nothing degrades it.
   */
  achievedEfficiency: number;
  /** Bed depth at the discharge end, mm. */
  bedDepth: number;
  /** Recommended max bed depth (~4x the opening), mm. */
  bedDepthLimit: number;
  /** True when bed depth is within the limit. */
  bedDepthOk: boolean;
  /** The VSMA factors used, for transparency in the report. */
  factors: VsmaFactors;
  /** Material passing through this deck (undersize) -> next deck / product. */
  throughflow: Stream;
  /** Material retained on this deck (oversize). */
  overflow: Stream;
  /**
   * Where the oversize goes: 'product' (a sized pile) or 'crusher' (recirculated
   * on a closed circuit; only the top deck when closedCircuit is on).
   */
  overflowTo: 'product' | 'crusher';
}

/** The full A-I factor set applied to one deck. */
export interface VsmaFactors {
  A_basicCapacity: number;
  B_oversize: number;
  C_halfSize: number;
  D_deckLocation: number;
  E_wetScreening: number;
  F_materialWeight: number;
  G_openArea: number;
  H_openingShape: number;
  I_efficiency: number;
  /** A x B x ... x I -- the denominator of the area formula. */
  divisor: number;
}

export interface SimulationResult {
  decks: DeckResult[];
  /** Final undersize passing all decks. */
  finalUndersize: Stream;
  closedCircuit: boolean;
  /** Fresh feed rate into the circuit, tph. */
  freshFeedTph: number;
  /** Steady-state recirculating load returned to the crusher, tph. */
  recirculationTph: number;
  /** Total feed reaching the top deck = fresh + recirculation, tph. */
  totalTopFeedTph: number;
  /** Circulating load ratio = recirculation / fresh feed (0 if open circuit). */
  circulatingLoadPct: number;
  /** Top-deck oversize sent TO the crusher (closed circuit only). */
  crusherReturn?: Stream;
  /** Product coming OUT of the crusher (closed circuit only). */
  crusherOut?: Stream;
}

/** Equipment kinds drawn in the process diagram. */
export type FlowNodeType = 'feed' | 'crusher' | 'screen' | 'stockpile' | 'conveyor' | 'note';

/** A user-drawn overlay node (annotation / extra equipment; not simulated). */
export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  x: number;
  y: number;
}
export interface FlowEdge {
  id: string;
  from: string; // node id (may reference a live node id or an overlay node id)
  to: string;
  label?: string;
  dashed?: boolean;
}
/** Free-form overlay drawn on top of the live process diagram. */
export interface DiagramExtras {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** A complete saved project. */
export interface Project {
  name: string;
  feed: Feed;
  screen: Screen;
  /** Design screening efficiency target, percent. Scope default: 90. */
  targetEfficiency: number;
  /**
   * When true, the top deck makes no product: its oversize is crushed and
   * recirculated into the feed (closed circuit).
   */
  closedCircuit: boolean;
  crusher: Crusher;
  /**
   * When true, products are split by a non-ideal partition (Tromp) curve driven
   * by deck efficiency (realistic tails). When false, an ideal cut is used
   * (matches the VSMA Handbook). Sizing (required area) is unaffected either way.
   */
  realisticScreening: boolean;
  /** Free-form components drawn on the diagram (don't affect the simulation). */
  extras: DiagramExtras;
}
