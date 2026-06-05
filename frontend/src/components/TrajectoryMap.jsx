import { useMemo } from "react";
import {
  CircleMarker,
  GeoJSON,
  LayersControl,
  MapContainer,
  Polyline,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Simple blue→cyan→green→yellow ramp for altitude colouring.
function ramp(tt) {
  const stops = [
    [0, [0, 39, 76]],
    [0.4, [0, 150, 200]],
    [0.7, [60, 180, 90]],
    [1, [250, 205, 30]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (tt <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const f = (tt - a) / (b - a || 1);
      const c = ca.map((v, k) => Math.round(v + f * (cb[k] - v)));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(250,205,30)";
}

function FitBounds({ points }) {
  const map = useMap();
  useMemo(() => {
    if (points.length >= 2) map.fitBounds(points, { padding: [30, 30] });
  }, [map, points]);
  return null;
}

export default function TrajectoryMap({ trajectory, corridor, mapRef }) {
  // Downsample to ~200 coloured segments for performance.
  const { segs, lo, hi } = useMemo(() => {
    const n = trajectory.length;
    const step = Math.max(1, Math.floor(n / 200));
    const pts = trajectory.filter((_, i) => i % step === 0);
    const alts = pts.map((r) => r.altitude_agl_ft);
    const loV = Math.min(...alts);
    const hiV = Math.max(...alts);
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      out.push({
        positions: [
          [pts[i - 1].latitude, pts[i - 1].longitude],
          [pts[i].latitude, pts[i].longitude],
        ],
        color: ramp((pts[i].altitude_agl_ft - loV) / (hiV - loV || 1)),
      });
    }
    return { segs: out, lo: loV, hi: hiV };
  }, [trajectory]);

  const allPts = useMemo(
    () => trajectory.filter((_, i) => i % 20 === 0).map((r) => [r.latitude, r.longitude]),
    [trajectory],
  );

  const corridor2d = useMemo(() => {
    if (!corridor) return null;
    return {
      ...corridor,
      features: corridor.features.filter((f) =>
        ["bottom", "centerline"].includes(f.properties?.role),
      ),
    };
  }, [corridor]);

  const start = trajectory[0];
  const end = trajectory[trajectory.length - 1];

  return (
    <div className="trajmap-wrap">
      <div className="alt-legend">
        <span className="alt-legend-title">Alt AGL</span>
        <span>{Math.round(hi)} ft</span>
        <div className="alt-legend-bar" />
        <span>{Math.round(lo)} ft</span>
      </div>
      <MapContainer
        ref={mapRef}
        preferCanvas
        center={[start.latitude, start.longitude]}
        zoom={12}
        className="leaflet-map"
      >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
            maxZoom={19}
            crossOrigin="anonymous"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Streets">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
            crossOrigin="anonymous"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {corridor2d && (
        <GeoJSON
          key={corridor2d.name}
          data={corridor2d}
          style={(f) =>
            f.properties?.role === "centerline"
              ? { color: "#ff7a00", weight: 2, dashArray: "5 5" }
              : { color: "#ffcb05", weight: 1, fillColor: "#ffcb05", fillOpacity: 0.1 }
          }
        />
      )}

      {segs.map((s, i) => (
        <Polyline key={i} positions={s.positions} pathOptions={{ color: s.color, weight: 4 }} />
      ))}

      <CircleMarker center={[start.latitude, start.longitude]} radius={6}
        pathOptions={{ color: "#fff", fillColor: "#2bbf68", fillOpacity: 1, weight: 2 }}>
        <Tooltip>Start</Tooltip>
      </CircleMarker>
      <CircleMarker center={[end.latitude, end.longitude]} radius={6}
        pathOptions={{ color: "#fff", fillColor: "#e5564b", fillOpacity: 1, weight: 2 }}>
        <Tooltip>End</Tooltip>
      </CircleMarker>

      <ScaleControl position="bottomleft" />
      <FitBounds points={allPts} />
      </MapContainer>
    </div>
  );
}
