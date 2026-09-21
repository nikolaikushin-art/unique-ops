/**
 * Parametric top-down car model for the damage map.
 *
 * The car is drawn from above with the FRONT at the top, so the car's LEFT
 * side is on the viewer's left. Every clickable body element (bumpers, bonnet,
 * windshield, roof, doors, wings, wheels, mirrors, sills…) is generated from a
 * single body-width profile, so neighbouring panels share exact edges and the
 * outline is always smooth — no hand-placed polygons that can overlap.
 *
 * Body-type specs only change proportions (length, width, where the cabin
 * sits, how many doors), so a 911 looks like a coupe and a Cayenne looks like
 * an SUV.
 *
 * This file is dependency-free on purpose (pure geometry).
 */

export type BodyType = 'sedan' | 'coupe' | 'suv' | 'hatch';

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  sedan: 'Седан',
  coupe: 'Купе',
  suv: 'Внедорожник',
  hatch: 'Хэтчбек',
};

export type ZoneKind = 'body' | 'glass' | 'wheel' | 'sill' | 'mirror';

export interface CarZone {
  id: string;
  d: string;
  kind: ZoneKind;
  /** centre point, used for numbered damage badges */
  cx: number;
  cy: number;
}

export interface CarDecor {
  d: string;
  cls: string;
}

export interface CarModel {
  width: number;
  height: number;
  outline: string;
  zones: CarZone[];
  decor: CarDecor[];
}

interface Spec {
  top: number;
  bottom: number;
  /** max half-width of the body */
  W: number;
  /** half-width of the flat front / rear edge */
  nose: number;
  tail: number;
  /** fractions of body length (0 = front edge, 1 = rear edge) */
  t: {
    bumperF: number; // front bumper ends
    hoodEnd: number; // bonnet ends / windshield starts
    roofStart: number; // windshield ends / roof starts
    roofEnd: number; // roof ends / rear window starts
    glassEnd: number; // rear window ends / boot starts
    bumperR: number; // rear bumper starts
    doorStart: number;
    doorMid: number | null; // null = two-door body
    doorEnd: number;
  };
  axle: { f: number; r: number };
}

const SPECS: Record<BodyType, Spec> = {
  sedan: {
    top: 20, bottom: 480, W: 88, nose: 50, tail: 58,
    t: { bumperF: 0.085, hoodEnd: 0.30, roofStart: 0.40, roofEnd: 0.60, glassEnd: 0.69, bumperR: 0.915, doorStart: 0.32, doorMid: 0.52, doorEnd: 0.71 },
    axle: { f: 0.20, r: 0.80 },
  },
  coupe: {
    top: 28, bottom: 472, W: 90, nose: 48, tail: 62,
    t: { bumperF: 0.09, hoodEnd: 0.27, roofStart: 0.375, roofEnd: 0.53, glassEnd: 0.65, bumperR: 0.915, doorStart: 0.29, doorMid: null, doorEnd: 0.57 },
    axle: { f: 0.19, r: 0.79 },
  },
  suv: {
    top: 16, bottom: 484, W: 96, nose: 60, tail: 66,
    t: { bumperF: 0.085, hoodEnd: 0.27, roofStart: 0.35, roofEnd: 0.74, glassEnd: 0.80, bumperR: 0.915, doorStart: 0.29, doorMid: 0.50, doorEnd: 0.72 },
    axle: { f: 0.19, r: 0.80 },
  },
  hatch: {
    top: 46, bottom: 454, W: 86, nose: 52, tail: 62,
    t: { bumperF: 0.09, hoodEnd: 0.30, roofStart: 0.40, roofEnd: 0.68, glassEnd: 0.77, bumperR: 0.92, doorStart: 0.33, doorMid: 0.53, doorEnd: 0.72 },
    axle: { f: 0.20, r: 0.80 },
  },
};

const VIEW_W = 340;
const VIEW_H = 500;
const CX = VIEW_W / 2;
const STEP = 4;

const r1 = (n: number) => Math.round(n * 10) / 10;

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

/** piecewise-linear interpolation over sorted [x, y] stops */
function piecewise(stops: [number, number][], x: number) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, y0] = stops[i - 1];
      const [x1, y1] = stops[i];
      return x1 === x0 ? y1 : lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return stops[stops.length - 1][1];
}

function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  return (
    `M${r1(x + r)},${r1(y)} H${r1(x + w - r)} Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + r)} ` +
    `V${r1(y + h - r)} Q${r1(x + w)},${r1(y + h)} ${r1(x + w - r)},${r1(y + h)} ` +
    `H${r1(x + r)} Q${r1(x)},${r1(y + h)} ${r1(x)},${r1(y + h - r)} ` +
    `V${r1(y + r)} Q${r1(x)},${r1(y)} ${r1(x + r)},${r1(y)} Z`
  );
}

export function buildCarModel(type: BodyType): CarModel {
  const s = SPECS[type];
  const len = s.bottom - s.top;
  const Y = (t: number) => s.top + t * len;

  /** half-width of the whole body at a given y (smooth, rounded nose and tail) */
  const hw = (y: number) => {
    const t = (y - s.top) / len;
    const edgeF = 0.17;
    const edgeR = 0.13;
    if (t < edgeF) {
      const x = Math.max(0, t / edgeF);
      return s.nose + (s.W - s.nose) * Math.sqrt(1 - (1 - x) * (1 - x));
    }
    if (t > 1 - edgeR) {
      const x = Math.max(0, (1 - t) / edgeR);
      return s.tail + (s.W - s.tail) * Math.sqrt(1 - (1 - x) * (1 - x));
    }
    return s.W;
  };

  /** width of the side strip (fenders/doors/quarters) at a given y */
  const strip = (y: number) => {
    const t = (y - s.top) / len;
    return piecewise(
      [
        [s.t.bumperF, 17],
        [s.t.hoodEnd, 17],
        [s.t.roofStart, 28],
        [s.t.roofEnd, 28],
        [s.t.glassEnd, 20],
        [s.t.bumperR, 16],
      ],
      t,
    );
  };

  /** half-width of the centre panels (bonnet, glass, roof, boot) */
  const cw = (y: number) => hw(y) - strip(y);

  const ys = (y0: number, y1: number) => {
    const out: number[] = [];
    for (let y = y0; y < y1; y += STEP) out.push(y);
    out.push(y1);
    return out;
  };

  const region = (
    y0: number,
    y1: number,
    xl: (y: number) => number,
    xr: (y: number) => number,
  ) => {
    const list = ys(y0, y1);
    const pts: [number, number][] = [];
    list.forEach((y) => pts.push([xl(y), y]));
    [...list].reverse().forEach((y) => pts.push([xr(y), y]));
    const d = 'M' + pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' L') + ' Z';
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return { d, cx: r1(cx), cy: r1(cy) };
  };

  // outer edges (left / right), and inner edges of the side strips
  const outL = (y: number) => CX - hw(y);
  const outR = (y: number) => CX + hw(y);
  const inL = (y: number) => CX - cw(y);
  const inR = (y: number) => CX + cw(y);

  const zones: CarZone[] = [];
  const decor: CarDecor[] = [];
  const add = (id: string, kind: ZoneKind, r: { d: string; cx: number; cy: number }) =>
    zones.push({ id, kind, d: r.d, cx: r.cx, cy: r.cy });

  const yBumperF = Y(s.t.bumperF);
  const yHoodEnd = Y(s.t.hoodEnd);
  const yRoofStart = Y(s.t.roofStart);
  const yRoofEnd = Y(s.t.roofEnd);
  const yGlassEnd = Y(s.t.glassEnd);
  const yBumperR = Y(s.t.bumperR);
  const yDoorStart = Y(s.t.doorStart);
  const yDoorMid = s.t.doorMid === null ? null : Y(s.t.doorMid);
  const yDoorEnd = Y(s.t.doorEnd);

  const outline = region(s.top, s.bottom, outL, outR).d;

  // ── wheels (drawn first; the body sits on top so only the tyre edge shows)
  const WHEEL_LEN = type === 'suv' ? 68 : 62;
  const WHEEL_W = 20;
  const wheelY = { f: Y(s.axle.f), r: Y(s.axle.r) };
  const wheel = (id: string, left: boolean, yc: number) => {
    const x = left ? CX - s.W - (WHEEL_W - 5) : CX + s.W - 5;
    add(id, 'wheel', {
      d: roundedRect(x, yc - WHEEL_LEN / 2, WHEEL_W, WHEEL_LEN, 7),
      cx: r1(left ? x + 6 : x + WHEEL_W - 6),
      cy: r1(yc),
    });
  };
  wheel('front_left_wheel', true, wheelY.f);
  wheel('front_right_wheel', false, wheelY.f);
  wheel('rear_left_wheel', true, wheelY.r);
  wheel('rear_right_wheel', false, wheelY.r);

  // ── sills (thin strips along the bottom of the doors, between the wheels)
  const sillY0 = wheelY.f + WHEEL_LEN / 2 + 4;
  const sillY1 = wheelY.r - WHEEL_LEN / 2 - 4;
  add('left_side', 'sill', region(sillY0, sillY1, (y) => outL(y) - 8, (y) => outL(y) + 1));
  add('right_side', 'sill', region(sillY0, sillY1, (y) => outR(y) - 1, (y) => outR(y) + 8));

  // ── bumpers
  add('front_bumper', 'body', region(s.top, yBumperF, outL, outR));
  add('rear_bumper', 'body', region(yBumperR, s.bottom, outL, outR));

  // ── centre line: bonnet → windshield → roof → rear window → boot
  add('bonnet', 'body', region(yBumperF, yHoodEnd, inL, inR));
  add('windshield', 'glass', region(yHoodEnd, yRoofStart, inL, inR));
  add('roof', 'body', region(yRoofStart, yRoofEnd, inL, inR));
  add('rear_window', 'glass', region(yRoofEnd, yGlassEnd, inL, inR));
  add('trunk', 'body', region(yGlassEnd, yBumperR, inL, inR));

  // ── side strips: wings, doors, rear quarters
  add('front_left_fender', 'body', region(yBumperF, yDoorStart, outL, inL));
  add('front_right_fender', 'body', region(yBumperF, yDoorStart, inR, outR));

  const frontDoorEnd = yDoorMid ?? yDoorEnd;
  add('front_left_door', 'body', region(yDoorStart, frontDoorEnd, outL, inL));
  add('front_right_door', 'body', region(yDoorStart, frontDoorEnd, inR, outR));
  if (yDoorMid !== null) {
    add('rear_left_door', 'body', region(yDoorMid, yDoorEnd, outL, inL));
    add('rear_right_door', 'body', region(yDoorMid, yDoorEnd, inR, outR));
  }
  add('rear_left_quarter', 'body', region(yDoorEnd, yBumperR, outL, inL));
  add('rear_right_quarter', 'body', region(yDoorEnd, yBumperR, inR, outR));

  // ── mirrors (on top of everything)
  const mirror = (id: string, left: boolean) => {
    const y = yDoorStart - 10;
    const sign = left ? -1 : 1;
    const x0 = CX + sign * (hw(y) - 4);
    const x1 = CX + sign * (hw(y) + 17);
    const d = `M${r1(x0)},${r1(y)} L${r1(x1)},${r1(y + 5)} L${r1(x1 + sign * 1)},${r1(y + 19)} L${r1(x0)},${r1(y + 25)} Z`;
    add(id, 'mirror', { d, cx: r1((x0 + x1) / 2), cy: r1(y + 13) });
  };
  mirror('left_mirror', true);
  mirror('right_mirror', false);

  // ── purely visual details (not clickable)
  const light = (left: boolean, y0: number, y1: number, cls: string) => {
    const r = left
      ? region(y0, y1, (y) => outL(y) + 5, (y) => Math.min(inL(y) - 3, outL(y) + 40))
      : region(y0, y1, (y) => Math.max(inR(y) + 3, outR(y) - 40), (y) => outR(y) - 5);
    decor.push({ d: r.d, cls });
  };
  light(true, yBumperF + 3, yBumperF + 19, 'car-light');
  light(false, yBumperF + 3, yBumperF + 19, 'car-light');
  light(true, yBumperR - 19, yBumperR - 3, 'car-light rear');
  light(false, yBumperR - 19, yBumperR - 3, 'car-light rear');

  return { width: VIEW_W, height: VIEW_H, outline, zones, decor };
}

const SUV_RE = new RegExp(
  '\\b(x[1-7]|ix[1-3]?|q[2-8]|rs q8|e-tron|gl[abces]|glc|gle|gls|g-class|g\\s?63|eq[abcesx]|cayenne|macan|urus|cullinan|bentayga|dbx|purosangue|levante|grecale|stelvio|tonale|' +
    'escalade|tahoe|suburban|navigator|expedition|explorer|edge|kuga|traverse|equinox|' +
    'range rover|defender|discovery|freelander|f-pace|e-pace|i-pace|evoque|velar|' +
    'xc\\d+|ex30|ex90|tiguan|touareg|teramont|taos|id\\.[456]|' +
    'rav4|land cruiser|prado|highlander|rx|nx|lx|gx|ux|patrol|pajero|outlander|x-trail|qashqai|' +
    'cx-\\d+|sportage|sorento|tucson|santa fe|palisade|creta|seltos|kodiaq|karoq|' +
    'duster|kaptur|arkana|koleos|niva|patriot|' +
    'haval|tank|jolion|dargo|monjaro|coolray|tugella|atlas|emgrand x7|cx5|cx9|' +
    'model [xy]|lyriq|bronco|wrangler|cherokee|compass|grand cherokee|gladiator|jimny|vitara|' +
    'exeed|jetour|tiggo|omoda|jaecoo|voyah|zeekr 001|li [lm]\\d*)\\b',
  'i',
);

const COUPE_RE = new RegExp(
  '\\b(911|718|cayman|boxster|tt|r8|mustang|camaro|corvette|challenger|' +
    'm2|m4|m8|[2468] series|z4|f-type|huracan|aventador|revuelto|296|f8|roma|portofino|812|458|488|sf90|mc20|' +
    'amg gt|sl|cle|gt|continental gt|continental gtc|vantage|db11|db12|dbs|wraith|' +
    '540c|570s|720s|750s|artura|emira|brz|gt86|supra|370z|400z|gt-r|rcf)\\b',
  'i',
);

const HATCH_RE = new RegExp(
  '\\b(golf|polo|up|a1|a3|rs3|1 series|mini|cooper|panda|corsa|astra|208|308|c3|c4|' +
    'sandero|clio|megane|logan|fit|jazz|yaris|aygo|swift|i10|i20|i30|rio|ceed|picanto|' +
    'focus|fiesta|kalina|granta|vesta|xray|id\\.3|i3|leaf|citigo|fabia|scala)\\b',
  'i',
);

/** best-effort body type from make + model; user can always override in the UI */
export function detectBodyType(brand?: string | null, model?: string | null): BodyType {
  const text = `${brand ?? ''} ${model ?? ''}`.trim();
  if (!text) return 'sedan';
  if (SUV_RE.test(text)) return 'suv';
  if (COUPE_RE.test(text)) return 'coupe';
  if (HATCH_RE.test(text)) return 'hatch';
  return 'sedan';
}
