import { useEffect, useMemo, useRef, useState } from "react";
import Workspace from "../components/Workspace.jsx";
import PlannerMap from "../components/PlannerMap.jsx";
import WaypointList from "../components/WaypointList.jsx";
import VehiclePanel from "../components/VehiclePanel.jsx";
import { getCorridor, getCorridors, getPresets, simulate } from "../api/client.js";
import { DEFAULT_HOLDING_ALT_FT, SITES } from "../data/sites.js";
import { BUILTIN_ROUTES } from "../data/routes.js";

let nextId = 1;

export default function PlannerPage() {
  const [waypoints, setWaypoints] = useState([]);
  const [routeName, setRouteName] = useState("My Route");
  const [groundFt, setGroundFt] = useState(650);
  const [presets, setPresets] = useState(null);
  const [vehicle, setVehicle] = useState({ preset: null, values: {} });
  const [flows, setFlows] = useState([]);
  const [flow, setFlow] = useState("south_flow");
  const [corridor, setCorridor] = useState(null);
  const [status, setStatus] = useState({ state: "idle" });
  const fileRef = useRef(null);
  const lastTouchedRef = useRef(null); // id of the waypoint most recently added/edited
  const validateSeq = useRef(0);       // guards against out-of-order async validations

  // Load presets + corridor flow manifest once.
  useEffect(() => {
    getPresets()
      .then((d) => {
        setPresets(d.presets);
        setVehicle({ preset: d.default, values: { ...d.presets[d.default].values } });
      })
      .catch(() => {});
    getCorridors()
      .then((d) => setFlows(d.flows))
      .catch(() => {});
  }, []);

  // Load (or clear) the corridor whenever the selected flow changes.
  const flowInfo = useMemo(() => flows.find((f) => f.id === flow), [flows, flow]);
  useEffect(() => {
    if (flowInfo && flowInfo.available) {
      getCorridor(flow).then(setCorridor).catch(() => setCorridor(null));
    } else {
      setCorridor(null);
    }
  }, [flow, flowInfo]);

  // ── Waypoint operations ──────────────────────────────────────────
  const addWaypoint = (lat, lon) => {
    const id = nextId++;
    lastTouchedRef.current = id;
    setWaypoints((ws) => [
      ...ws,
      {
        id,
        name: `WP${ws.length}`,
        lat,
        lon,
        altitude_ft: ws.length === 0 ? 0 : 500, // AGL
        is_holding: false,
        hold_time_s: 10,
      },
    ]);
  };

  const moveWaypoint = (id, lat, lon) => {
    lastTouchedRef.current = id;
    setWaypoints((ws) => ws.map((w) => (w.id === id ? { ...w, lat, lon } : w)));
  };

  const updateWaypoint = (id, patch) => {
    lastTouchedRef.current = id;
    setWaypoints((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const deleteWaypoint = (id) => {
    lastTouchedRef.current = null; // a removal has no single "culprit" point
    setWaypoints((ws) => ws.filter((w) => w.id !== id));
  };

  const reorder = (id, dir) => {
    lastTouchedRef.current = null;
    setWaypoints((ws) => {
      const i = ws.findIndex((w) => w.id === id);
      const j = i + dir;
      if (j < 0 || j >= ws.length) return ws;
      const copy = [...ws];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const clearAll = () => {
    lastTouchedRef.current = null;
    setWaypoints([]);
  };

  // Add a predefined site as a waypoint (append, or prepend as the start).
  const useSite = (site, asStart) => {
    const id = nextId++;
    lastTouchedRef.current = id;
    const wp = {
      id,
      name: site.name,
      lat: site.lat,
      lon: site.lon,
      altitude_ft: site.type === "vertiport" ? 0 : DEFAULT_HOLDING_ALT_FT,
      is_holding: site.type === "holding",
      hold_time_s: 10,
    };
    setWaypoints((ws) => (asStart ? [wp, ...ws] : [...ws, wp]));
  };

  // ── Build / download / validate route ────────────────────────────
  const buildRoute = (list = waypoints) => ({
    name: routeName || "Route",
    preset: vehicle.preset,
    physics: vehicle.values,
    ground_elevation_ft: groundFt,
    waypoints: list.map((w, i) => ({
      name: w.name || `WP${i}`,
      latitude: w.lat,
      longitude: w.lon,
      altitude_ft: w.altitude_ft, // AGL
      is_holding: w.is_holding,
      hold_time_s: w.hold_time_s,
    })),
  });

  // Auto-validate (debounced) on every route change. The backend engine is the
  // source of truth for "can this be flown". On failure we blame the waypoint the
  // user most recently added/edited, and confirm it by re-simulating *without*
  // that point: if the route then flies, the point is provably the culprit.
  useEffect(() => {
    if (waypoints.length < 2) {
      setStatus({ state: "idle" });
      return;
    }
    const seq = ++validateSeq.current;
    setStatus({ state: "checking" });
    const timer = setTimeout(async () => {
      try {
        const res = await simulate(buildRoute());
        if (seq !== validateSeq.current) return; // a newer change superseded us
        setStatus({ state: "ok", summary: res.summary });
      } catch (e) {
        if (seq !== validateSeq.current) return;
        const culpritId = lastTouchedRef.current;
        const culprit = waypoints.find((w) => w.id === culpritId);
        let confirmed = false;
        if (culprit && waypoints.length >= 3) {
          try {
            await simulate(buildRoute(waypoints.filter((w) => w.id !== culpritId)));
            confirmed = true; // route flies once this point is removed
          } catch {
            /* still fails without it — the problem is broader than one point */
          }
        }
        if (seq !== validateSeq.current) return;
        setStatus({
          state: "invalid",
          message: e.message,
          culpritId: culprit ? culpritId : null,
          culpritName: culprit?.name,
          confirmed,
        });
      }
    }, 400);
    return () => clearTimeout(timer);
    // buildRoute is intentionally omitted (recreated each render); routeName only
    // affects the label, not flyability, so it is excluded too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, vehicle, groundFt]);

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(buildRoute(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(routeName || "route").replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load a route payload (from a file import or a built-in example) into the editor.
  const loadRoute = (data) => {
    setRouteName(data.name ?? "Imported route");
    if (data.ground_elevation_ft != null) setGroundFt(data.ground_elevation_ft);
    lastTouchedRef.current = null; // loaded as a whole; no single culprit
    setWaypoints(
      (data.waypoints ?? []).map((w, i) => ({
        id: nextId++,
        name: w.name ?? `WP${i}`,
        lat: w.latitude,
        lon: w.longitude,
        altitude_ft: w.altitude_ft ?? 500,
        is_holding: !!w.is_holding,
        hold_time_s: w.hold_time_s ?? 10,
      })),
    );
    if (presets && data.preset && presets[data.preset]) {
      setVehicle({
        preset: data.preset,
        values: { ...presets[data.preset].values, ...(data.physics ?? {}) },
      });
    }
    setStatus({ state: "idle" });
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadRoute(JSON.parse(reader.result));
      } catch {
        alert("Could not parse that file as a route JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <Workspace
      title="Planner"
      subtitle="Click the map to place waypoints. Drag to move. Set each altitude (AGL) and mark holding points, then validate and export the route."
      sideTitle="Route setup"
      main={
        <PlannerMap
          waypoints={waypoints}
          corridor={corridor}
          onAdd={addWaypoint}
          onMove={moveWaypoint}
          onUseSite={useSite}
          groundFt={groundFt}
        />
      }
      side={
        <>
          <div className="panel">
            <label className="field">
              <span className="field-label">Route name</span>
              <input
                className="input"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">Load a built-in route</span>
              <select
                className="select"
                value=""
                onChange={(e) => {
                  const r = BUILTIN_ROUTES.find((x) => x.id === e.target.value);
                  if (r) loadRoute(r.route);
                }}
              >
                <option value="">Choose an example route…</option>
                {BUILTIN_ROUTES.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>

            <div className="field-row">
              <label className="field">
                <span className="field-label">Airport flow</span>
                <select
                  className="select"
                  value={flow}
                  onChange={(e) => setFlow(e.target.value)}
                >
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                      {f.available ? "" : " (coming soon)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Ground elev. (ft MSL)</span>
                <input
                  className="input"
                  type="number"
                  value={groundFt}
                  onChange={(e) => setGroundFt(Number(e.target.value))}
                />
              </label>
            </div>
            {flowInfo && !flowInfo.available && (
              <p className="hint">
                {flowInfo.label} corridors aren’t defined yet — none shown.
              </p>
            )}

            <label className="field">
              <span className="field-label">Quick-add a site</span>
              <select
                className="select"
                value=""
                onChange={(e) => {
                  const s = SITES.find((x) => x.id === e.target.value);
                  if (s) useSite(s, false);
                }}
              >
                <option value="">Add a site as the next waypoint…</option>
                <optgroup label="Vertiports (ground)">
                  {SITES.filter((s) => s.type === "vertiport").map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Holding points (airborne)">
                  {SITES.filter((s) => s.type === "holding").map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <p className="hint">
              Adds the site as the next waypoint, in order (you can also click a
              site marker on the map). Vertiports are on the ground; holding points
              start airborne — edit altitude in the list.
            </p>

            <div className="row-between">
              <span className="muted">{waypoints.length} waypoint(s)</span>
              <div className="inline-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileRef.current?.click()}
                >
                  Import
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={clearAll}
                  disabled={!waypoints.length}
                >
                  Clear
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                hidden
                onChange={importJSON}
              />
            </div>
          </div>

          <div className="panel">
            <h3 className="panel-title">Waypoints</h3>
            <WaypointList
              waypoints={waypoints}
              onUpdate={updateWaypoint}
              onDelete={deleteWaypoint}
              onReorder={reorder}
              invalidId={status.state === "invalid" ? status.culpritId : null}
            />
          </div>

          <VehiclePanel presets={presets} vehicle={vehicle} onChange={setVehicle} />

          <button
            className="btn btn-primary"
            disabled={status.state !== "ok"}
            onClick={downloadJSON}
            title={
              waypoints.length < 2
                ? "Add at least two waypoints"
                : status.state === "checking"
                  ? "Validating route…"
                  : status.state === "invalid"
                    ? "Fix the route before exporting"
                    : ""
            }
          >
            Export JSON
          </button>
        </>
      }
      belowMain={
        <>
          {status.state === "checking" && (
            <div className="status status-checking">Validating route…</div>
          )}
          {status.state === "ok" && (
            <div className="status status-ok">
              ✓ Route is valid — {status.summary.duration_s}s flight, max{" "}
              {status.summary.max_ground_speed_kt} kt.
            </div>
          )}
          {status.state === "invalid" && (
            <div className="status status-warn">
              {status.confirmed && status.culpritName ? (
                <strong>⚠ “{status.culpritName}” breaks the route</strong>
              ) : status.culpritName ? (
                <strong>
                  ⚠ Route can’t be simulated (last change: “{status.culpritName}”)
                </strong>
              ) : (
                <strong>⚠ Route can’t be simulated</strong>
              )}
              <p>
                {status.confirmed && status.culpritName
                  ? "It simulates fine without that point — move it, change its altitude, or remove it. "
                  : status.culpritName
                    ? "Removing that point alone doesn’t fix it, so nearby points may be involved too. "
                    : ""}
                {status.message}
              </p>
              <button className="btn btn-ghost btn-sm" onClick={downloadJSON}>
                Export anyway
              </button>
            </div>
          )}
        </>
      }
    />
  );
}
