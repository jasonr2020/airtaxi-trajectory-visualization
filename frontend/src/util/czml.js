// Build a CZML document from a trajectory time-series for Cesium playback.
//
// Heights are expressed in metres AGL (above ground level) so the scene works
// without a Cesium Ion terrain token — 0 ft AGL sits on the globe surface.

export const FT_TO_M = 0.3048;
const SUBSAMPLE = 2; // keep every Nth sample to keep the CZML compact

export function buildTrajectoryCZML(trajectory, name = "Air taxi") {
  const rows = trajectory.filter((_, i) => i % SUBSAMPLE === 0);
  if (rows[rows.length - 1] !== trajectory[trajectory.length - 1]) {
    rows.push(trajectory[trajectory.length - 1]); // always keep the final point
  }

  const epoch = new Date();
  const totalSec = rows[rows.length - 1].time_s;
  const endISO = new Date(epoch.getTime() + totalSec * 1000).toISOString();
  const epochISO = epoch.toISOString();

  // CZML cartographicDegrees: [t, lon, lat, height_m, ...]
  const carto = [];
  for (const r of rows) {
    carto.push(r.time_s, r.longitude, r.latitude, r.altitude_agl_ft * FT_TO_M);
  }

  return [
    {
      id: "document",
      name: "Air-Taxi Trajectory",
      version: "1.0",
      clock: {
        interval: `${epochISO}/${endISO}`,
        currentTime: epochISO,
        multiplier: 8,
        range: "CLAMPED",
      },
    },
    {
      id: "vehicle",
      name,
      availability: `${epochISO}/${endISO}`,
      position: {
        interpolationAlgorithm: "LAGRANGE",
        interpolationDegree: 1,
        epoch: epochISO,
        cartographicDegrees: carto,
      },
      orientation: { velocityReference: "#position" },
      // 3D aircraft model at a fixed real-world size (~7 m). No minimumPixelSize
      // / maximumScale, which would balloon the model when viewed from far away.
      // The small point below keeps it visible when zoomed out.
      model: {
        gltf: "/models/CesiumDrone.glb",
        scale: 1.5,
      },
      point: {
        pixelSize: 7,
        color: { rgba: [0, 80, 255, 220] },
        outlineColor: { rgba: [255, 255, 255, 220] },
        outlineWidth: 1,
      },
      path: {
        material: {
          polylineGlow: { glowPower: 0.25, color: { rgba: [0, 120, 255, 255] } },
        },
        width: 5,
        leadTime: 0,
        trailTime: totalSec,
        resolution: 1,
      },
    },
  ];
}
