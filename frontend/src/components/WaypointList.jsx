/**
 * WaypointList — the editable list of route waypoints in the Planner sidebar.
 * Each row: number, lat/lon, altitude (ft), holding checkbox + hold time,
 * reorder up/down, and delete.
 */
export default function WaypointList({ waypoints, onUpdate, onDelete, onReorder }) {
  if (waypoints.length === 0) {
    return (
      <p className="muted">
        Click on the map to place your first waypoint. The first point is the
        take-off pad; the last is the landing pad.
      </p>
    );
  }

  return (
    <ol className="wp-list">
      {waypoints.map((w, i) => (
        <li className={`wp-row ${w.is_holding ? "wp-row-hold" : ""}`} key={w.id}>
          <div className="wp-row-head">
            <span className={`wp-badge ${w.is_holding ? "wp-badge-hold" : ""}`}>
              {i + 1}
            </span>
            <span className="wp-coords">
              {w.lat.toFixed(5)}, {w.lon.toFixed(5)}
            </span>
            <div className="wp-actions">
              <button
                className="icon-btn"
                title="Move up"
                disabled={i === 0}
                onClick={() => onReorder(w.id, -1)}
              >
                ↑
              </button>
              <button
                className="icon-btn"
                title="Move down"
                disabled={i === waypoints.length - 1}
                onClick={() => onReorder(w.id, 1)}
              >
                ↓
              </button>
              <button
                className="icon-btn icon-del"
                title="Delete"
                onClick={() => onDelete(w.id)}
              >
                ×
              </button>
            </div>
          </div>

          <div className="wp-row-fields">
            <label className="mini-field">
              <span>Altitude (ft AGL)</span>
              <input
                className="input input-sm"
                type="number"
                value={w.altitude_ft}
                onChange={(e) =>
                  onUpdate(w.id, { altitude_ft: Number(e.target.value) })
                }
              />
            </label>

            <label className="check-field">
              <input
                type="checkbox"
                checked={w.is_holding}
                onChange={(e) => onUpdate(w.id, { is_holding: e.target.checked })}
              />
              <span>Holding point</span>
            </label>

            {w.is_holding && (
              <label className="mini-field">
                <span>Hold time (s)</span>
                <input
                  className="input input-sm"
                  type="number"
                  min="0"
                  value={w.hold_time_s}
                  onChange={(e) =>
                    onUpdate(w.id, { hold_time_s: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
