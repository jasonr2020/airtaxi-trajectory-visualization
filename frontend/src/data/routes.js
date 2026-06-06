// Built-in example routes, available from both the Planner (load to edit) and the
// Viewer (run directly). Each entry's `route` is a ready-to-simulate payload in the
// same shape the Planner exports / the backend /api/simulate accepts.
import mcityNorth from "./routes/mcity_dtw_north.json";
import mcityWest from "./routes/mcity_dtw_west.json";
import miCentralEast from "./routes/micentral_dtw_east.json";
import miCentralNorth from "./routes/micentral_dtw_north.json";

export const BUILTIN_ROUTES = [
  { id: "mcity-dtw-north", label: "MCity → DTW (North Hold)", route: mcityNorth },
  { id: "mcity-dtw-west", label: "MCity → DTW (West Hold)", route: mcityWest },
  { id: "micentral-dtw-east", label: "MI Central → DTW (East Hold)", route: miCentralEast },
  { id: "micentral-dtw-north", label: "MI Central → DTW (North Hold)", route: miCentralNorth },
];
