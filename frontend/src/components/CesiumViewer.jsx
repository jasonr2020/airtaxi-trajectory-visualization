import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { FT_TO_M, buildTrajectoryCZML } from "../util/czml.js";

const ESRI = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

// DTW control tower (from Google Earth). Heights are AGL metres in this scene.
const TOWER = { lat: 42.2127081, lon: -83.3543163, heightM: 60 };
const TOWER_FOV = Math.PI / 3; // 60° default; tower zoom narrows this like a telephoto

// Point the camera at `from`, looking toward `target` (used by tower/onboard cams).
function lookFromAt(viewer, from, target) {
  const dir = Cesium.Cartesian3.subtract(target, from, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitude(dir) < 1e-3) return;
  Cesium.Cartesian3.normalize(dir, dir);
  const inv = Cesium.Matrix4.inverseTransformation(
    Cesium.Transforms.eastNorthUpToFixedFrame(from),
    new Cesium.Matrix4(),
  );
  const local = Cesium.Matrix4.multiplyByPointAsVector(inv, dir, new Cesium.Cartesian3());
  const heading = Math.atan2(local.x, local.y);
  const pitch = Math.asin(Cesium.Math.clamp(local.z, -1, 1));
  viewer.camera.setView({ destination: from, orientation: { heading, pitch, roll: 0 } });
}

// Draw the approach-corridor volumes (walls/top/bottom) plus a ground "shadow".
// Corridor polygon heights are absolute MSL metres; convert to AGL with the
// route's ground elevation so they line up with the AGL-referenced trajectory.
function renderCorridor(ds, geojson, groundM) {
  ds.entities.removeAll();
  if (!geojson) return;
  for (const f of geojson.features) {
    if (f.geometry?.type !== "Polygon") continue;
    const role = f.properties?.role;
    const ring = f.geometry.coordinates[0];

    if (role === "wall" || role === "top" || role === "bottom") {
      const heights = [];
      for (const [lon, lat, alt] of ring) heights.push(lon, lat, (alt ?? 0) - groundM);
      ds.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArrayHeights(heights),
          perPositionHeight: true,
          material: Cesium.Color.fromCssColorString("#ffcb05").withAlpha(role === "wall" ? 0.16 : 0.1),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#ffcb05").withAlpha(0.55),
        },
      });
    }
    if (role === "bottom") {
      const flat = [];
      for (const [lon, lat] of ring) flat.push(lon, lat);
      ds.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
          material: Cesium.Color.BLACK.withAlpha(0.18), // shadow on the ground
        },
      });
    }
  }
}

const CesiumViewer = forwardRef(function CesiumViewer(
  { trajectory, corridor, groundElevationFt = 650, cameraMode = "free", towerZoom = 1 },
  ref,
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const trajDsRef = useRef(null);
  const corridorDsRef = useRef(null);
  const [hud, setHud] = useState(null);
  const lastHud = useRef(0);
  const cameraModeRef = useRef(cameraMode);
  const towerZoomRef = useRef(towerZoom);
  useEffect(() => {
    towerZoomRef.current = towerZoom;
  }, [towerZoom]);
  useEffect(() => {
    cameraModeRef.current = cameraMode;
    // Reset the telephoto zoom (FOV) when leaving the tower view.
    const v = viewerRef.current;
    if (cameraMode !== "tower" && v && !v.isDestroyed() && v.camera.frustum.fov !== undefined) {
      v.camera.frustum.fov = TOWER_FOV;
    }
  }, [cameraMode]);

  // Init once.
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(Cesium.ArcGisMapServerImageryProvider.fromUrl(ESRI)),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      animation: true,
      timeline: true,
      contextOptions: { webgl: { preserveDrawingBuffer: true } }, // for PDF snapshot
    });
    viewer.scene.globe.enableLighting = false;
    viewer.clock.shouldAnimate = false;
    const corridorDs = new Cesium.CustomDataSource("corridor");
    viewer.dataSources.add(corridorDs);
    corridorDsRef.current = corridorDs;
    viewerRef.current = viewer;
    return () => {
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Load / reload the trajectory.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !trajectory) return;
    if (trajDsRef.current) viewer.dataSources.remove(trajDsRef.current, true);

    const czml = buildTrajectoryCZML(trajectory);
    Cesium.CzmlDataSource.load(czml).then((ds) => {
      if (viewer.isDestroyed()) return;
      viewer.dataSources.add(ds);
      trajDsRef.current = ds;

      const doc = czml[0].clock;
      const start = Cesium.JulianDate.fromIso8601(doc.interval.split("/")[0]);
      const stop = Cesium.JulianDate.fromIso8601(doc.interval.split("/")[1]);
      viewer.clock.startTime = start;
      viewer.clock.stopTime = stop;
      viewer.clock.currentTime = Cesium.JulianDate.clone(start);
      viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
      viewer.clock.multiplier = 8;
      viewer.clock.shouldAnimate = false;
      if (viewer.timeline) viewer.timeline.zoomTo(start, stop);
      viewer.flyTo(ds, { duration: 1.5 });
    });
  }, [trajectory]);

  // Render / re-render corridor on flow change.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !corridorDsRef.current) return;
    renderCorridor(corridorDsRef.current, corridor, groundElevationFt * FT_TO_M);
  }, [corridor, groundElevationFt]);

  // Live HUD: interpolate the trajectory at the current clock time (throttled).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !trajectory) return;
    const onTick = (clock) => {
      const now = performance.now();
      if (now - lastHud.current < 120) return;
      lastHud.current = now;
      const elapsed = Cesium.JulianDate.secondsDifference(clock.currentTime, clock.startTime);
      const i = Math.max(0, Math.min(trajectory.length - 1, Math.round(elapsed / 0.2)));
      const r = trajectory[i];
      setHud({ t: r.time_s, alt: r.altitude_agl_ft, gs: r.ground_speed_kt, hdg: r.heading_deg });
    };
    viewer.clock.onTick.addEventListener(onTick);
    return () => {
      if (!viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(onTick);
    };
  }, [trajectory]);

  // Camera modes: "free" (user-controlled), "tower" (fixed at the tower, tracking
  // the aircraft), "onboard" (chase camera just behind/above the aircraft).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !trajectory) return;
    const ellipsoid = viewer.scene.globe.ellipsoid;
    const towerPos = Cesium.Cartesian3.fromDegrees(TOWER.lon, TOWER.lat, TOWER.heightM);
    const scratchTime = new Cesium.JulianDate();
    let lastFwd = null;

    const onCam = (clock) => {
      const mode = cameraModeRef.current;
      if (mode === "free") return;
      const entity = trajDsRef.current?.entities.getById("vehicle");
      const p = entity?.position.getValue(clock.currentTime);
      if (!p) return;

      if (mode === "tower") {
        lookFromAt(viewer, towerPos, p);
        if (viewer.camera.frustum.fov !== undefined) {
          viewer.camera.frustum.fov = TOWER_FOV / towerZoomRef.current;
        }
        return;
      }
      // onboard chase: look forward along the direction of travel.
      Cesium.JulianDate.addSeconds(clock.currentTime, 1.5, scratchTime);
      const ahead = entity.position.getValue(scratchTime);
      let fwd = ahead ? Cesium.Cartesian3.subtract(ahead, p, new Cesium.Cartesian3()) : null;
      if (fwd && Cesium.Cartesian3.magnitude(fwd) > 1) {
        Cesium.Cartesian3.normalize(fwd, fwd);
        lastFwd = fwd;
      } else {
        fwd = lastFwd;
      }
      if (!fwd) return;
      const up = ellipsoid.geodeticSurfaceNormal(p, new Cesium.Cartesian3());
      const camPos = Cesium.Cartesian3.clone(p, new Cesium.Cartesian3());
      Cesium.Cartesian3.add(camPos, Cesium.Cartesian3.multiplyByScalar(fwd, -100, new Cesium.Cartesian3()), camPos);
      Cesium.Cartesian3.add(camPos, Cesium.Cartesian3.multiplyByScalar(up, 3, new Cesium.Cartesian3()), camPos);
      // Look ahead at the aircraft (camera is nearly at its altitude).
      const target = Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(fwd, 60, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      lookFromAt(viewer, camPos, target);
    };

    viewer.clock.onTick.addEventListener(onCam);
    return () => {
      if (!viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(onCam);
    };
  }, [trajectory]);

  useImperativeHandle(ref, () => ({
    play: () => viewerRef.current && (viewerRef.current.clock.shouldAnimate = true),
    pause: () => viewerRef.current && (viewerRef.current.clock.shouldAnimate = false),
    reset: () => {
      const v = viewerRef.current;
      if (!v) return;
      v.clock.currentTime = Cesium.JulianDate.clone(v.clock.startTime);
      v.clock.shouldAnimate = false;
    },
    setSpeed: (m) => viewerRef.current && (viewerRef.current.clock.multiplier = m),
    snapshot: () => {
      const v = viewerRef.current;
      if (!v) return null;
      v.render();
      return v.canvas.toDataURL("image/png");
    },
  }));

  return (
    <div className="cesium-wrap">
      <div ref={containerRef} className="cesium-container" />
      {hud && (
        <div className="cesium-hud">
          <div><span>t</span> {hud.t.toFixed(1)} s</div>
          <div><span>alt</span> {hud.alt.toFixed(0)} ft AGL</div>
          <div><span>gs</span> {hud.gs.toFixed(1)} kt</div>
          <div><span>hdg</span> {hud.hdg.toFixed(0)}°</div>
        </div>
      )}
    </div>
  );
});

export default CesiumViewer;
