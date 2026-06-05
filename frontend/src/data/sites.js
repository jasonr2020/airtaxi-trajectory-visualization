// Predefined sites shown on the Planner map.
//  - "vertiport": ground-level pads (0 ft AGL) → ground take-off when used.
//  - "holding":   airborne holding fixes (altitude chosen by the user; defaults
//                 to DEFAULT_HOLDING_ALT_FT and is added as a holding waypoint).
export const SITES = [
  { id: "mcs", name: "Michigan Central Station", type: "vertiport", lat: 42.329655, lon: -83.076707, altitude_ft: 0 },
  { id: "mcity", name: "MCity – University of Michigan", type: "vertiport", lat: 42.298068, lon: -83.700864, altitude_ft: 0 },
  { id: "dtw-c", name: "DTW Concourse C", type: "vertiport", lat: 42.213632, lon: -83.358728, altitude_ft: 0 },
  { id: "hold-e", name: "East Holding Point", type: "holding", lat: 42.216532, lon: -83.323965 },
  { id: "hold-n", name: "North Holding Point", type: "holding", lat: 42.247147, lon: -83.331874 },
  { id: "hold-ne", name: "Northeast Holding Point", type: "holding", lat: 42.22711, lon: -83.373156 },
  { id: "hold-se", name: "Southeast Holding Point", type: "holding", lat: 42.202494, lon: -83.393488 },
  { id: "hold-s", name: "South Holding Point", type: "holding", lat: 42.193198, lon: -83.360158 },
];

export const DEFAULT_HOLDING_ALT_FT = 30;
