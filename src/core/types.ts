/** Shared data model between the pipeline (Node) and the app (browser). */

export type StateCode = 'PR' | 'SC' | 'RS';
export type CalibRegion = 'PR' | 'SC-N' | 'SC-ILHA' | 'SC-S' | 'RS-N' | 'RS-S';
export type BreakType = 'beach' | 'point' | 'jetty' | 'reef' | 'pier';

export interface Spot {
  id: string;
  name: string;
  /** Municipality (IBGE) — or the seed list's city when IBGE is unavailable. */
  city?: string;
  state: StateCode;
  region: CalibRegion;
  lat: number;
  lon: number;
  /** seed = curated name list, osm = sport=surfing in OSM, virtual = generated along the coast. */
  kind: 'seed' | 'osm' | 'virtual';
  /** Compass bearing the beach faces (land → sea), from coastline geometry. */
  facing: number;
  /** Wind "from" direction that is straight offshore (facing + 180). */
  offshore: number;
  /** Exposure 0..1 for swell arriving FROM each 10° sector (36 entries, index 0 = 0°). */
  exposure: number[];
  /** Main open-ocean window, compass "from" range (clockwise from → to). */
  window: { from: number; to: number };
  breakType: BreakType;
  hazards: string[];
  /** Everything except name/coords is auto-inferred; this records how. */
  inferred: { coastSource: 'osm' | 'naturalearth'; breakSource: string; orientationQuality: 'good' | 'coarse' };
}

export type Confidence = 'alta' | 'média' | 'baixa';

/** Consensus value for one variable at one hour. */
export interface Cv {
  v: number;
  /** Spread across models (std-dev, or circular RMS in degrees for directions). */
  s: number;
  /** Number of models contributing. */
  n: number;
}

export interface HourPoint {
  t: string; // ISO local time America/Sao_Paulo, e.g. 2026-10-17T06:00
  // sea state (consensus)
  hs: Cv; // significant wave height (m)
  tp: Cv; // period (s) — swell peak when available, else mean
  dir: Cv; // wave/swell direction (from, deg)
  swH?: Cv; swT?: Cv; swD?: Cv; // primary swell
  sw2H?: number; sw2T?: number; sw2D?: number; // secondary swell (single best model)
  wwH?: number; // wind waves
  // atmosphere
  wind: Cv; // km/h
  windDir: Cv;
  gust: Cv;
  rain?: number; // mm/h
  cape?: number; // J/kg
  cloud?: number; // %
  temp?: number; // °C air
  uv?: number;
  sst?: number; // °C
  tide?: number; // sea level (m, relative MSL, model)
  day: boolean;
  /** Per-model raw values for comparison chart: model → [hs, tp, dir] / wind → [speed, dir]. */
  m?: Record<string, number[]>;
}

export type Verdict = 'Vai' | 'Talvez' | 'Fica em casa';

export interface HourScore {
  t: string;
  score: number; // 0-10, one decimal
  conf: Confidence;
  flags: SafetyFlag[];
  windRel: WindRelation;
  energyKj: number;
  reason: string;
}

export type WindRelation = 'terral' | 'terral-lateral' | 'lateral' | 'maral-lateral' | 'maral' | 'glassy';

export interface SafetyFlag {
  code: 'raio' | 'rajada' | 'grande' | 'aviso' | 'frio';
  label: string;
}

export interface DayBest {
  date: string; // YYYY-MM-DD
  score: number;
  conf: Confidence;
  window?: { start: string; end: string; score: number };
  red: boolean;
  /** One-line explanation at the day's best hour. */
  reason?: string;
  /** Key numbers at the day's best hour (breaking height m, period s, swell dir, wind km/h + relation). */
  facts?: { h: number; t: number; dir: number; wind: number; rel: WindRelation };
}

/** Per-spot summary (what Home / Week / Map need). */
export interface SpotSummary {
  id: string;
  days: DayBest[];
  /** Hourly scores for the whole horizon, compact: score*10 integers, -1 = night. */
  hourly: number[];
  now?: { score: number; conf: Confidence; reason: string; flags: SafetyFlag[] };
  sst?: number;
}

export interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  skipped?: string;
  error?: string;
  ms?: number;
  models?: string[];
}

export interface Summary {
  generatedAt: string; // ISO UTC
  start: string; // first local hour in series
  hours: number;
  /** Index of the generation-time local hour in hourly arrays. */
  nowIdx: number;
  skill: string;
  demo?: boolean;
  sources: SourceStatus[];
  warnings: OfficialWarning[];
  spots: SpotSummary[];
}

export interface OfficialWarning {
  source: string;
  title: string;
  severity: 'amarelo' | 'laranja' | 'vermelho' | 'info';
  areas: string[];
  start?: string;
  end?: string;
  url?: string;
  /** Applies to all spots whose state is listed (coarse matching). */
  states: StateCode[];
}

export interface SpotDetail {
  id: string;
  generatedAt: string;
  nowIdx: number;
  hours: HourPoint[];
  scores: HourScore[];
  sunrise: string[];
  sunset: string[];
}

/** Gridded fields for the map (quantised). */
export interface GridData {
  generatedAt: string;
  start: string;
  hours: number; // number of time steps
  step: number; // hours between steps
  lats: number[];
  lons: number[];
  /** Each field: [time][lat*lons.length + lon] ints; null cells = land / missing (encoded -9999). */
  fields: Record<'u' | 'v' | 'hs' | 'dir' | 'tp' | 'sst' | 'rain', { scale: number; data: number[][] }>;
}
