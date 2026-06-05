"""Air-Taxi Trajectory Visualization — backend API.

A thin FastAPI wrapper around the self-contained ``trajectory_engine``. It takes
ordered waypoints (latitude/longitude/altitude in feet MSL, plus optional
holding points) from the planner UI, runs the kinematic simulation, and returns
the full trajectory time-series for the browser to render.

Physics is expressed in *human-friendly units* at the API boundary
(knots / feet-per-minute / g) and converted to SI for the engine. A set of
named presets lets a user pick a sensible vehicle profile without knowing any
specific aircraft's numbers.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CORRIDORS_DIR = DATA_DIR / "corridors"

from trajectory_engine import PhysicsParams, simulate
from trajectory_engine.geo import FT_TO_M, MPS_TO_FPM, MPS_TO_KT

G_CONST = 9.81

app = FastAPI(title="Air-Taxi Trajectory Visualization API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Columns returned to the frontend (SI + display units both included).
RESPONSE_COLUMNS = [
    "time_s", "latitude", "longitude",
    "altitude_agl_ft", "altitude_msl_ft", "altitude_m",
    "ground_speed_kt", "ground_speed_mps",
    "heading_deg", "dir_north", "dir_east",
    "climb_rate_fpm", "roll_deg", "pitch_deg", "yaw_deg",
    "g_fwd", "g_vert",
]

# ── Vehicle presets, in friendly units ─────────────────────────────────
# Each value block: cruise_speed_kt, climb_rate_fpm, max_accel_g, max_decel_g,
# max_yaw_rate_deg.
PRESETS: Dict[str, dict] = {
    "joby_s4": {
        "label": "Joby S4 (default)",
        "values": {"cruise_speed_kt": 90, "climb_rate_fpm": 492,
                   "max_accel_g": 0.15, "max_decel_g": 0.10, "max_yaw_rate_deg": 3},
    },
    "generic_evtol": {
        "label": "Generic eVTOL",
        "values": {"cruise_speed_kt": 100, "climb_rate_fpm": 800,
                   "max_accel_g": 0.20, "max_decel_g": 0.15, "max_yaw_rate_deg": 3},
    },
    "helicopter": {
        "label": "Helicopter-like",
        "values": {"cruise_speed_kt": 120, "climb_rate_fpm": 1000,
                   "max_accel_g": 0.15, "max_decel_g": 0.12, "max_yaw_rate_deg": 4},
    },
    "fast_airtaxi": {
        "label": "Fast air taxi",
        "values": {"cruise_speed_kt": 150, "climb_rate_fpm": 1200,
                   "max_accel_g": 0.25, "max_decel_g": 0.20, "max_yaw_rate_deg": 3},
    },
}
DEFAULT_PRESET = "joby_s4"


# --- request / response models -----------------------------------------
class Waypoint(BaseModel):
    name: Optional[str] = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    altitude_ft: float = Field(..., description="Altitude AGL (above field ground level), in feet")
    is_holding: bool = Field(False, description="Hover-and-hold at this waypoint")
    hold_time_s: float = Field(10.0, ge=0, description="Hold duration in seconds")


class PhysicsInput(BaseModel):
    """Friendly-unit physics overrides (applied on top of the chosen preset)."""

    cruise_speed_kt: Optional[float] = Field(None, gt=0)
    climb_rate_fpm: Optional[float] = Field(None, gt=0)
    max_accel_g: Optional[float] = Field(None, gt=0)
    max_decel_g: Optional[float] = Field(None, gt=0)
    max_yaw_rate_deg: Optional[float] = Field(None, gt=0)


class SimulateRequest(BaseModel):
    name: Optional[str] = "Trajectory"
    waypoints: List[Waypoint]
    preset: Optional[str] = Field(None, description=f"Preset name; defaults to {DEFAULT_PRESET}")
    physics: Optional[PhysicsInput] = None
    ground_elevation_ft: float = Field(
        650.0, description="Field ground elevation MSL (ft). Waypoint altitudes are AGL above this."
    )


def resolve_physics(preset: Optional[str], override: Optional[PhysicsInput]) -> tuple[PhysicsParams, dict]:
    """Combine preset + overrides (friendly units) and convert to SI PhysicsParams.

    Returns the engine params and the resolved friendly-unit values (for echoing
    back to the UI).
    """
    name = preset if preset in PRESETS else DEFAULT_PRESET
    friendly = dict(PRESETS[name]["values"])
    if override is not None:
        friendly.update(override.model_dump(exclude_none=True))

    params = PhysicsParams(
        v_cruise=friendly["cruise_speed_kt"] / MPS_TO_KT,
        v_climb=friendly["climb_rate_fpm"] / MPS_TO_FPM,
        max_accel=friendly["max_accel_g"] * G_CONST,
        max_decel=friendly["max_decel_g"] * G_CONST,
        max_yaw_rate_deg=friendly["max_yaw_rate_deg"],
    )
    return params, {"preset": name, **friendly}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "airtaxi-trajectory", "version": app.version}


@app.get("/api/presets")
def get_presets() -> dict:
    """All vehicle presets (friendly units) for the UI dropdown."""
    return {"default": DEFAULT_PRESET, "presets": PRESETS}


@app.get("/api/corridors")
def corridors_manifest() -> dict:
    """List the available approach-corridor flow modes (South / North Flow)."""
    manifest = CORRIDORS_DIR / "manifest.json"
    if not manifest.exists():
        raise HTTPException(status_code=404, detail="Corridor manifest not found.")
    return json.loads(manifest.read_text())


@app.get("/api/corridors/{flow}")
def corridor_flow(flow: str) -> dict:
    """Return the GeoJSON corridors for a flow mode (e.g. ``south_flow``)."""
    path = CORRIDORS_DIR / f"{flow}.geojson"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Unknown flow: {flow}")
    return json.loads(path.read_text())


@app.post("/api/simulate")
def run_simulation(req: SimulateRequest) -> dict:
    if len(req.waypoints) < 2:
        raise HTTPException(status_code=400, detail="At least two waypoints are required.")

    # Waypoint altitudes are AGL; convert to MSL metres for the engine.
    ground_m = req.ground_elevation_ft * FT_TO_M
    wpts = pd.DataFrame(
        {
            "latitude": [w.latitude for w in req.waypoints],
            "longitude": [w.longitude for w in req.waypoints],
            "altitude_m": [w.altitude_ft * FT_TO_M + ground_m for w in req.waypoints],
            "is_holding": [w.is_holding for w in req.waypoints],
            "hold_time_s": [w.hold_time_s for w in req.waypoints],
        }
    )

    params, physics_used = resolve_physics(req.preset, req.physics)

    # First waypoint at ground (0 ft AGL) -> vertical take-off; above ground ->
    # start airborne at that altitude (still accelerating from a standstill).
    vertical_takeoff = req.waypoints[0].altitude_ft < 1.0

    # Touchdown = the first waypoint of the trailing run of ground (0 ft AGL)
    # waypoints. Everything after it is reached by a ground taxi (10 kt). If only
    # the last waypoint is on the ground, that is the touchdown (no taxi).
    agls = [w.altitude_ft for w in req.waypoints]
    n = len(agls)
    touchdown_idx = n - 1
    if agls[-1] < 1.0:
        while touchdown_idx - 1 >= 1 and agls[touchdown_idx - 1] < 1.0:
            touchdown_idx -= 1
    taxi_speed_kt = 10.0

    try:
        states = simulate(
            wpts, params,
            vertical_takeoff=vertical_takeoff,
            touchdown_idx=touchdown_idx,
            taxi_speed=taxi_speed_kt / MPS_TO_KT,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if len(states) == 0 or states["time_s"].iloc[-1] >= params.max_sim_time - params.dt:
        raise HTTPException(
            status_code=422,
            detail="This route could not be simulated. The waypoints are likely "
                   "spaced too closely for the cruise turn radius, or adjacent "
                   "points change altitude too sharply. Try spreading the "
                   "waypoints farther apart or reducing the altitude difference "
                   "between neighbouring points.",
        )

    # AGL altitude for output (MSL minus the field ground elevation).
    states["altitude_agl_ft"] = states["altitude_msl_ft"] - req.ground_elevation_ft

    # Lat/lon need ~7 decimals (~1 cm); coarser rounding quantises slow taxi
    # motion onto a ~1 m grid and makes the rendered path zig-zag.
    round_map = {c: (7 if c in ("latitude", "longitude") else 4) for c in RESPONSE_COLUMNS}
    records = states[RESPONSE_COLUMNS].round(round_map).to_dict(orient="records")
    return {
        "name": req.name,
        "summary": {
            "num_waypoints": len(req.waypoints),
            "num_holding": int(sum(w.is_holding for w in req.waypoints)),
            "num_samples": len(states),
            "duration_s": round(float(states["time_s"].iloc[-1]), 1),
            "ground_elevation_ft": req.ground_elevation_ft,
            "start": "ground" if vertical_takeoff else "airborne",
            "landing": "taxi_to_park" if touchdown_idx < n - 1 else "vertical",
            "max_altitude_agl_ft": round(float(states["altitude_agl_ft"].max()), 1),
            "max_altitude_msl_ft": round(float(states["altitude_msl_ft"].max()), 1),
            "max_ground_speed_kt": round(float(states["ground_speed_kt"].max()), 1),
            "dt_s": params.dt,
        },
        "physics_used": physics_used,
        "columns": RESPONSE_COLUMNS,
        "trajectory": records,
    }
