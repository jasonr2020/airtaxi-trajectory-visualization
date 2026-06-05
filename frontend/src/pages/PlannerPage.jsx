import { useEffect, useMemo, useRef, useState } from "react";
import Workspace from "../components/Workspace.jsx";
import PlannerMap from "../components/PlannerMap.jsx";
import WaypointList from "../components/WaypointList.jsx";
import VehiclePanel from "../components/VehiclePanel.jsx";
import { getCorridor, getCorridors, getPresets, simulate } from "../api/client.js";
import { DEFAULT_HOLDING_ALT_FT, SITES } from "../data/sites.js";

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
    setStatus({ state: "idle" });
    setWaypoints((ws) => [
      ...ws,
      {
        id: nextId++,
        name: `WP${ws.length}`,
        lat,
        lon,
        altitude_ft: ws.length === 0 ? 0 : 500, // AGL
        is_holding: false,
        hold_time_s: 10,
      },
    ]);
  };

  const moveWaypoint = (id, lat, lon) =>
    setWaypoints((ws) => ws.map((w) => (w.id === id ? { ...w, lat, lon } : w)));

  const updateWaypoint = (id, patch) =>
    setWaypoints((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const deleteWaypoint = (id) =>
    setWaypoints((ws) => ws.filter((w) => w.id !== id));

  const reorder = (id, dir) =>
    setWaypoints((ws) => {
      const i = ws.findIndex((w) => w.id === id);
      const j = i + dir;
      if (j < 0 || j >= ws.length) return ws;
      const copy = [...ws];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const clearAll = () => {
    setWaypoints([]);
    setStatus({ state: "idle" });
  };

  // Add a predefined site as a waypoint (append, or prepend as the start).
  const useSite = (site, asStart) => {
    setStatus({ state: "idle" });
    const wp = {
      id: nextId++,
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
  const buildRoute = () => ({
    name: routeName || "Route",
    preset: vehicle.preset,
    physics: vehicle.values,
    ground_elevation_ft: groundFt,
    waypoints: waypoints.map((w, i) => ({
      name: w.name || `WP${i}`,
      latitude: w.lat,
      longitude: w.lon,
      altitude_ft: w.altitude_ft, // AGL
      is_holding: w.is_holding,
      hold_time_s: w.hold_time_s,
    })),
  });

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

  // Validate by running the backend engine; only download a converging route.
  const handleExport = async () => {
    setStatus({ state: "checking" });
    try {
      const res = await simulate(buildRoute());
      setStatus({ state: "ok", summary: res.summary });
      downloadJSON();
    } catch (e) {
      setStatus({ state: "warn", message: e.message });
    }
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setRouteName(data.name ?? "Imported route");
        if (data.ground_elevation_ft != null) setGroundFt(data.ground_elevation_ft);
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
      } catch {
        alert("Could not parse that file as a route JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const canExport = waypoints.length >= 2 && status.state !== "checking";

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
            />
          </div>

          <VehiclePanel presets={presets} vehicle={vehicle} onChange={setVehicle} />

          <button
            className="btn btn-primary"
            disabled={!canExport}
            onClick={handleExport}
            title={waypoints.length < 2 ? "Add at least two waypoints" : ""}
          >
            {status.state === "checking" ? "Validating…" : "Validate & export JSON"}
          </button>

          {status.state === "ok" && (
            <div className="status status-ok">
              ✓ Route is valid — {status.summary.duration_s}s flight, max{" "}
              {status.summary.max_ground_speed_kt} kt. JSON downloaded.
            </div>
          )}
          {status.state === "warn" && (
            <div className="status status-warn">
              <strong>⚠ Route couldn’t be simulated</strong>
              <p>{status.message}</p>
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
