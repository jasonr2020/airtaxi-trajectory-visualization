/**
 * BravoAirspace — the inner shelves of DTW's Class B airspace, drawn on the 2D
 * Leaflet maps (Planner + Viewer) as a planning reference.
 *
 * Every shelf has the same 10,000 ft MSL ceiling ("100"); the floor steps up with
 * distance from the airport:
 *   inner polygon  → 100/SFC  (floor = surface)
 *   middle band    → 100/25   (floor = 2,500 ft MSL)
 *   beyond         → 100/30   (floor = 3,000 ft MSL)
 *
 * The boundaries are traced from the chart's own labelled fixes. The inner 100/SFC
 * shelf is the scalloped core: it runs at ~8 NM but indents to ~4 NM on the WNW side
 * (the YIP/ARB corridor) — N42°17.30' → 15.28' → 12.13'. The unlabelled east/south
 * side is closed with an 8 NM arc. The outer ring (~10 NM) passes through DXO 000°/10
 * and DXO 240°/10. The two short radial "steps" (2.3 NM on the north, 2.0 NM on the
 * SW) that the chart marks between the shelves are drawn as connectors.
 *
 * Floors are published in MSL; because the planner works in AGL, each band also shows
 * the floor in AGL using the route's ground elevation. Centred on the DTW reference.
 */
import { Polygon, Polyline, Marker } from "react-leaflet";
import L from "leaflet";

const BRAVO_CENTER = [42.2125, -83.3534];
const NM = 1852; // metres per nautical mile
const M_PER_DEG_LAT = 111195;
const RING_COLOR = "#4d9be0"; // light blue, echoing the FAA Class B chart

const [C_LAT, C_LON] = BRAVO_CENTER;
const C_LAT_R = (C_LAT * Math.PI) / 180;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos(C_LAT_R);

// Labelled chart fixes (decimal degrees), keyed by their N-minutes for readability.
const P = {
  n2080: [42.34667, -83.37], //    N42°20.80' W83°22.20'  (8.1 NM)
  n2041: [42.34017, -83.38467], // N42°20.41' W83°23.08'  YIP boundary (7.8 NM)
  n1730: [42.28833, -83.4575], //  N42°17.30' W83°27.45'  (6.5 NM)
  n1528: [42.25467, -83.4345], //  N42°15.28' W83°26.07'  (4.4 NM)  ← indent
  n1213: [42.20217, -83.44567], // N42°12.13' W83°26.74'  (4.1 NM)  ← deepest indent
  n0995: [42.16583, -83.53433], // N42°09.95' W83°32.06'  (8.5 NM)
  n0808: [42.13467, -83.51167], // DXO 240°/8 NM  N42°08.08' W83°30.70' (8.4 NM)
  dxo000_10: [42.379, -83.39017], // DXO 000°/10 NM  N42°22.74' W83°23.41' (10.1 NM)
  dxo240_10: [42.115, -83.54783], // DXO 240°/10 NM  N42°06.90' W83°32.87' (10.4 NM)
};

function arcPoint(brgRad, rNM) {
  return [
    C_LAT + (rNM * Math.cos(brgRad) * NM) / M_PER_DEG_LAT,
    C_LON + (rNM * Math.sin(brgRad) * NM) / M_PER_DEG_LON,
  ];
}

// Arc vertices at `rNM`, sweeping clockwise from `fromDeg` to `toDeg`.
function arcSpan(fromDeg, toDeg, rNM, stepDeg = 12) {
  if (toDeg < fromDeg) toDeg += 360;
  const pts = [];
  for (let b = fromDeg; b <= toDeg; b += stepDeg) pts.push(arcPoint(((b % 360) * Math.PI) / 180, rNM));
  return pts;
}

// 100/SFC core: the labelled WNW→SW scallop (with the indentation), then an 8 NM arc
// closing the unlabelled east/south side.
const SFC_POLY = [
  P.n0808, P.n0995, P.n1213, P.n1528, P.n1730, P.n2041, P.n2080,
  ...arcSpan(7, 228, 8),
];

// 100/25 outer edge (~10 NM): an OPEN arc on the east/south side only, from
// DXO 000°/10 (north) clockwise round to DXO 240°/10 (SW). The west side isn't a
// Class B boundary here — the SFC scallop plus the two step connectors close the
// shelf — so the arc stops at the two fixes rather than wrapping back across the NW.
const OUTER_ARC = [P.dxo000_10, ...arcSpan(352, 234, 10), P.dxo240_10];

function eastOf(nm) {
  return [C_LAT, C_LON + (nm * NM) / M_PER_DEG_LON];
}

function shelfLabel(code, floorMsl, groundFt) {
  const mslLine =
    floorMsl == null ? "10,000 – SFC ft MSL" : `10,000 – ${floorMsl.toLocaleString()} ft MSL`;
  const aglLine =
    floorMsl == null
      ? "floor = surface"
      : `floor ≈ ${Math.round(floorMsl - groundFt).toLocaleString()} ft AGL`;
  return L.divIcon({
    className: "",
    html: `<div class="bravo-label"><strong>${code}</strong><span>${mslLine}</span><span>${aglLine}</span></div>`,
    iconSize: [132, 48],
    iconAnchor: [66, 24],
  });
}

export default function BravoAirspace({ groundFt = 650 }) {
  // interactive:false so the rings/labels never swallow map clicks (the Planner
  // adds a waypoint on click).
  const ring = { color: RING_COLOR, weight: 2.5, fill: false, interactive: false };
  const step = { color: RING_COLOR, weight: 2, interactive: false };
  return (
    <>
      <Polygon positions={SFC_POLY} pathOptions={ring} />
      <Polyline positions={OUTER_ARC} pathOptions={ring} />
      {/* Chart "step" segments closing the 100/25 shelf (2.3 NM N, 2.0 NM SW). */}
      <Polyline positions={[P.dxo000_10, P.n2041]} pathOptions={step} />
      <Polyline positions={[P.dxo240_10, P.n0808]} pathOptions={step} />
      <Marker position={eastOf(4)} icon={shelfLabel("100/SFC", null, groundFt)} interactive={false} />
      <Marker position={eastOf(9)} icon={shelfLabel("100/25", 2500, groundFt)} interactive={false} />
      <Marker position={eastOf(12)} icon={shelfLabel("100/30", 3000, groundFt)} interactive={false} />
    </>
  );
}
