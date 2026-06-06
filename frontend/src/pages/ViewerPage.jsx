import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { jsPDF } from "jspdf";
import leafletImage from "leaflet-image";
import CesiumViewer from "../components/CesiumViewer.jsx";
import TrajectoryMap from "../components/TrajectoryMap.jsx";
import ProfileCharts from "../components/ProfileCharts.jsx";
import { getCorridor, getCorridors, simulate } from "../api/client.js";

// Draw the altitude colour legend onto the captured map canvas (matches the
// on-screen legend; leaflet-image doesn't capture HTML overlays).
function drawAltitudeLegend(canvas, trajectory) {
  const alts = trajectory.map((r) => r.altitude_agl_ft);
  const lo = Math.round(Math.min(...alts));
  const hi = Math.round(Math.max(...alts));
  const ctx = canvas.getContext("2d");
  const pad = 14;
  const boxW = 78;
  const boxH = 150;
  const x = canvas.width - boxW - pad;
  const y = pad;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = "#5d6b7e";
  ctx.font = "600 12px Inter, sans-serif";
  ctx.fillText("Alt AGL", x + 12, y + 20);
  const bx = x + 14;
  const by = y + 34;
  const bw = 16;
  const bh = boxH - 52;
  const grad = ctx.createLinearGradient(0, by + bh, 0, by);
  grad.addColorStop(0, "rgb(0,39,76)");
  grad.addColorStop(0.4, "rgb(0,150,200)");
  grad.addColorStop(0.7, "rgb(60,180,90)");
  grad.addColorStop(1, "rgb(250,205,30)");
  ctx.fillStyle = grad;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#1a2230";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.fillText(`${hi} ft`, bx + bw + 6, by + 8);
  ctx.fillText(`${lo} ft`, bx + bw + 6, by + bh);
}

export default function ViewerPage() {
  const [route, setRoute] = useState(null); // imported route JSON
  const [result, setResult] = useState(null); // { summary, trajectory }
  const [status, setStatus] = useState({ state: "idle" });
  const [flows, setFlows] = useState([]);
  const [flow, setFlow] = useState("south_flow");
  const [corridor, setCorridor] = useState(null);
  const [speed, setSpeed] = useState(8);
  const [cameraMode, setCameraMode] = useState("free");
  const [towerZoom, setTowerZoom] = useState(1);
  const cesiumRef = useRef(null);
  const fileRef = useRef(null);
  const trajMapRef = useRef(null);

  useEffect(() => {
    getCorridors().then((d) => setFlows(d.flows)).catch(() => {});
  }, []);

  const flowInfo = useMemo(() => flows.find((f) => f.id === flow), [flows, flow]);
  useEffect(() => {
    if (flowInfo && flowInfo.available) {
      getCorridor(flow).then(setCorridor).catch(() => setCorridor(null));
    } else {
      setCorridor(null);
    }
  }, [flow, flowInfo]);

  const groundFt = route?.ground_elevation_ft ?? 650;

  const runRoute = async (routeJson) => {
    setRoute(routeJson);
    setStatus({ state: "running" });
    try {
      const res = await simulate(routeJson);
      setResult(res);
      setStatus({ state: "ok" });
    } catch (e) {
      setResult(null);
      setStatus({ state: "error", message: e.message });
    }
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        runRoute(JSON.parse(reader.result));
      } catch {
        setStatus({ state: "error", message: "Could not parse that file as route JSON." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const setPlaybackSpeed = (m) => {
    setSpeed(m);
    cesiumRef.current?.setSpeed(m);
  };

  const downloadPDF = async () => {
    if (!result) return;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const W = pdf.internal.pageSize.getWidth();
    const m = 40;
    const cw = W - 2 * m;
    let y = m;

    pdf.setFontSize(16);
    pdf.text(result.name || "Air-taxi trajectory", m, y);
    y += 22;
    pdf.setFontSize(10);
    const s = result.summary;
    const lines = [
      `Start: ${s.start}   Landing: ${s.landing}   Duration: ${s.duration_s} s`,
      `Waypoints: ${s.num_waypoints} (${s.num_holding} holding)   Ground elev: ${s.ground_elevation_ft} ft MSL`,
      `Max altitude: ${s.max_altitude_agl_ft} ft AGL (${s.max_altitude_msl_ft} ft MSL)   Max ground speed: ${s.max_ground_speed_kt} kt`,
    ];
    lines.forEach((l) => { pdf.text(l, m, y); y += 14; });
    y += 8;

    // 2D top-view map (satellite + altitude-coloured trajectory) via leaflet-image,
    // which renders the Leaflet map (tiles + canvas vector layers) correctly.
    if (trajMapRef.current) {
      try {
        const canvas = await new Promise((resolve, reject) =>
          leafletImage(trajMapRef.current, (err, c) => (err ? reject(err) : resolve(c))),
        );
        drawAltitudeLegend(canvas, result.trajectory);
        const img = canvas.toDataURL("image/png");
        const h = (cw * canvas.height) / canvas.width;
        if (y + h > pdf.internal.pageSize.getHeight() - m) { pdf.addPage(); y = m; }
        pdf.addImage(img, "PNG", m, y, cw, h);
        y += h + 14;
      } catch {
        /* map capture failed — skip the map figure, keep the rest of the report */
      }
    }
    for (const id of ["chart-alt", "chart-spd"]) {
      const img = await Plotly.toImage(id, { format: "png", width: 1000, height: 320 });
      const h = cw * 0.32;
      if (y + h > pdf.internal.pageSize.getHeight() - m) { pdf.addPage(); y = m; }
      pdf.addImage(img, "PNG", m, y, cw, h);
      y += h + 12;
    }
    pdf.save(`${(result.name || "trajectory").replace(/\s+/g, "_")}.pdf`);
  };

  const hasResult = status.state === "ok" && result;

  return (
    <div className="viewer">
      <div className="viewer-top">
        <div className="viewer-stage">
          {hasResult ? (
            <CesiumViewer
              ref={cesiumRef}
              trajectory={result.trajectory}
              corridor={corridor}
              groundElevationFt={groundFt}
              cameraMode={cameraMode}
              towerZoom={towerZoom}
            />
          ) : (
            <div className="stage-placeholder viewer-empty">
              <div className="placeholder-icon">🎬</div>
              <p>Import a route JSON to generate and replay the flight</p>
              <p className="muted">Use a file exported from the Planner</p>
            </div>
          )}
        </div>

        <aside className="viewer-side">
          <div className="panel">
            <h3 className="panel-title">Route</h3>
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              Import route JSON…
            </button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={importJSON} />
            {status.state === "running" && <p className="hint">Running simulation…</p>}
            {status.state === "error" && (
              <div className="status status-warn" style={{ marginTop: 10 }}>{status.message}</div>
            )}
          </div>

          {hasResult && (
            <>
              <div className="panel">
                <h3 className="panel-title">Summary</h3>
                <div className="kv-grid">
                  <div className="kv"><span className="kv-key">Start</span><span className="kv-val">{result.summary.start}</span></div>
                  <div className="kv"><span className="kv-key">Landing</span><span className="kv-val">{result.summary.landing}</span></div>
                  <div className="kv"><span className="kv-key">Duration</span><span className="kv-val">{result.summary.duration_s} <em>s</em></span></div>
                  <div className="kv"><span className="kv-key">Max alt</span><span className="kv-val">{result.summary.max_altitude_agl_ft} <em>ft AGL</em></span></div>
                  <div className="kv"><span className="kv-key">Max gs</span><span className="kv-val">{result.summary.max_ground_speed_kt} <em>kt</em></span></div>
                  <div className="kv"><span className="kv-key">Holds</span><span className="kv-val">{result.summary.num_holding}</span></div>
                </div>
              </div>

              <div className="side-spacer" />
              <button className="btn btn-primary" onClick={downloadPDF}>Download report (PDF)</button>
            </>
          )}
        </aside>
      </div>

      {hasResult && (
        <>
          <div className="viewer-controls">
            <div className="panel">
              <h3 className="panel-title">Approach corridor</h3>
              <label className="field">
                <span className="field-label">Airport flow</span>
                <select className="select" value={flow} onChange={(e) => setFlow(e.target.value)}>
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}{f.available ? "" : " (coming soon)"}</option>
                  ))}
                </select>
              </label>
              {flowInfo && !flowInfo.available && (
                <p className="hint">{flowInfo.label} corridors aren’t defined yet.</p>
              )}
            </div>

            <div className="panel">
              <h3 className="panel-title">Camera</h3>
              <div className="seg">
                {[
                  ["free", "Free"],
                  ["tower", "Tower"],
                  ["onboard", "Onboard"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`seg-btn ${cameraMode === id ? "seg-active" : ""}`}
                    onClick={() => setCameraMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {cameraMode === "tower" && (
                <div className="inline-actions" style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTowerZoom((z) => Math.max(1, +(z / 1.4).toFixed(2)))}
                  >
                    Zoom −
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTowerZoom((z) => Math.min(8, +(z * 1.4).toFixed(2)))}
                  >
                    Zoom +
                  </button>
                  <span className="muted" style={{ alignSelf: "center" }}>×{towerZoom.toFixed(1)}</span>
                </div>
              )}
              <p className="hint">
                Tower = fixed at the DTW tower tracking the aircraft. Onboard =
                chase view behind the aircraft.
              </p>
            </div>

            <div className="panel">
              <h3 className="panel-title">Playback</h3>
              <div className="inline-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => cesiumRef.current?.play()}>▶ Play</button>
                <button className="btn btn-ghost btn-sm" onClick={() => cesiumRef.current?.pause()}>⏸ Pause</button>
                <button className="btn btn-ghost btn-sm" onClick={() => cesiumRef.current?.reset()}>↺ Reset</button>
              </div>
              <label className="field" style={{ marginTop: 10 }}>
                <span className="field-label">Speed ×{speed}</span>
                <select className="select" value={speed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}>
                  {[1, 4, 8, 16, 32].map((m) => <option key={m} value={m}>×{m}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="viewer-bottom">
            <div className="panel viewer-map-panel">
              <h3 className="panel-title">2D top view (coloured by altitude)</h3>
              <TrajectoryMap trajectory={result.trajectory} corridor={corridor} mapRef={trajMapRef} groundFt={groundFt} />
            </div>
            <div className="panel">
              <h3 className="panel-title">Profiles</h3>
              <ProfileCharts trajectory={result.trajectory} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
