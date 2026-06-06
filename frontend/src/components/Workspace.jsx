/**
 * Workspace — the shared two-pane layout used by the Planner and Viewer.
 *
 * Left: the large main area (map / 3D view / charts).
 * Right: a fixed-width side panel (controls, waypoint list, etc.).
 *
 * Props: title, subtitle, main (node), side (node), sideTitle,
 * belowMain (node rendered directly under the main stage).
 */
export default function Workspace({ title, subtitle, main, side, sideTitle, belowMain }) {
  return (
    <div className="workspace">
      <div className="workspace-main">
        <div className="workspace-head">
          <h1 className="workspace-title">{title}</h1>
          {subtitle && <p className="workspace-sub">{subtitle}</p>}
        </div>
        <div className="workspace-stage">{main}</div>
        {belowMain && <div className="workspace-below">{belowMain}</div>}
      </div>
      <aside className="workspace-side">
        {sideTitle && <h2 className="side-title">{sideTitle}</h2>}
        <div className="side-body">{side}</div>
      </aside>
    </div>
  );
}
