import { useMemo } from "react";
import {
  GeoJSON,
  LayersControl,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SITES } from "../data/sites.js";

const DTW_CENTER = [42.25, -83.34];

function siteIcon(site) {
  const cls = site.type === "vertiport" ? "site-vertiport" : "site-holding";
  const glyph = site.type === "vertiport" ? "⬢" : "H";
  const size = site.type === "vertiport" ? 24 : 22;
  return L.divIcon({
    className: "",
    html: `<div class="site-marker ${cls}">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Numbered circular marker (avoids Leaflet's broken default-icon paths in Vite).
function waypointIcon(label, holding) {
  return L.divIcon({
    className: "",
    html: `<div class="wp-marker ${holding ? "wp-hold" : ""}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function ClickToAdd({ onAdd }) {
  useMapEvents({
    click(e) {
      onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function PlannerMap({ waypoints, corridor, onAdd, onMove, onUseSite }) {
  // For the 2D map, only show the ground footprint (Bottom) + centerline.
  const corridor2d = useMemo(() => {
    if (!corridor) return null;
    return {
      ...corridor,
      features: corridor.features.filter((f) =>
        ["bottom", "centerline"].includes(f.properties?.role),
      ),
    };
  }, [corridor]);

  const line = waypoints.map((w) => [w.lat, w.lon]);

  const corridorStyle = (feature) =>
    feature.properties?.role === "centerline"
      ? { color: "#ff7a00", weight: 2, dashArray: "5 5" }
      : { color: "#ffcb05", weight: 1, fillColor: "#ffcb05", fillOpacity: 0.12 };

  return (
    <MapContainer center={DTW_CENTER} zoom={11} className="leaflet-map">
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Streets">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {corridor2d && (
        <GeoJSON
          key={corridor2d.name}
          data={corridor2d}
          style={corridorStyle}
        />
      )}

      {/* Predefined sites: vertiports + holding points */}
      {SITES.map((site) => (
        <Marker key={site.id} position={[site.lat, site.lon]} icon={siteIcon(site)}>
          <Tooltip direction="top" offset={[0, -12]}>{site.name}</Tooltip>
          <Popup>
            <div className="site-popup">
              <strong>{site.name}</strong>
              <div className="muted">
                {site.type === "vertiport" ? "Vertiport · ground" : "Holding point"}
              </div>
              <div className="site-popup-actions">
                <button onClick={() => onUseSite?.(site, false)}>Add to route</button>
                <button onClick={() => onUseSite?.(site, true)}>Set as start</button>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {line.length > 1 && (
        <Polyline positions={line} pathOptions={{ color: "#1f6fff", weight: 3 }} />
      )}

      {waypoints.map((w, i) => (
        <Marker
          key={w.id}
          position={[w.lat, w.lon]}
          draggable
          icon={waypointIcon(i + 1, w.is_holding)}
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng();
              onMove(w.id, lat, lng);
            },
          }}
        />
      ))}

      <ScaleControl position="bottomleft" />
      <ClickToAdd onAdd={onAdd} />
    </MapContainer>
  );
}
