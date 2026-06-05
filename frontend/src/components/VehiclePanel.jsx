/**
 * VehiclePanel — controlled vehicle/physics editor.
 * A preset dropdown sets baseline values; each value (friendly units) is then
 * individually editable. Parent owns the `{ preset, values }` state.
 */
const FIELDS = [
  ["cruise_speed_kt", "Cruise speed", "kt"],
  ["climb_rate_fpm", "Climb rate", "fpm"],
  ["max_accel_g", "Max accel", "g"],
  ["max_decel_g", "Max decel", "g"],
  ["max_yaw_rate_deg", "Max turn rate", "°/s"],
];

export default function VehiclePanel({ presets, vehicle, onChange }) {
  if (!presets) return <p className="muted">Loading vehicle presets…</p>;

  const selectPreset = (key) => {
    onChange({ preset: key, values: { ...presets[key].values } });
  };

  const setValue = (field, value) => {
    onChange({ ...vehicle, values: { ...vehicle.values, [field]: value } });
  };

  return (
    <div className="panel">
      <h3 className="panel-title">Vehicle</h3>
      <label className="field">
        <span className="field-label">Preset</span>
        <select
          className="select"
          value={vehicle.preset ?? ""}
          onChange={(e) => selectPreset(e.target.value)}
        >
          {Object.entries(presets).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <div className="veh-fields">
        {FIELDS.map(([key, label, unit]) => (
          <label className="mini-field" key={key}>
            <span>
              {label} <em className="unit">{unit}</em>
            </span>
            <input
              className="input input-sm"
              type="number"
              step="any"
              value={vehicle.values?.[key] ?? ""}
              onChange={(e) => setValue(key, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <p className="hint">
        Pick a preset, then tweak any value. These are exported with the route.
      </p>
    </div>
  );
}
