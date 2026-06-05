"""Physics engine: turn ordered waypoints into a smooth kinematic trajectory.

Model type
----------
A *kinematic* point-mass model (not a force/aerodynamics model). It moves a
point along the waypoints subject to speed / acceleration / turn-rate limits.

Flight is driven by an internal state machine:

    TAKEOFF (vertical) -> FORWARD -> [HOLD ...] -> FORWARD -> LANDING (vertical)

Forward speed uses a single "stopping-distance" speed profile:

    v_target = min(v_cruise, sqrt(2 * max_decel * distance_to_next_stop))

A "stop" is the next holding waypoint or the final landing waypoint. This one
rule yields, for free: cruise when far from a stop, automatic early
deceleration before a holding point or landing, and — when the next stop is
close — *not* accelerating all the way back to cruise after a hold.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .geo import (
    M_TO_FT,
    MPS_TO_FPM,
    MPS_TO_KT,
    GeoConverter,
    ground_speed_mps,
    heading_deg,
)
from .params import PhysicsParams

G_CONST = 9.81


def simulate(
    waypoints_df: pd.DataFrame,
    params: PhysicsParams | None = None,
    vertical_takeoff: bool = True,
    touchdown_idx: int | None = None,
    taxi_speed: float = 10.0 / MPS_TO_KT,
) -> pd.DataFrame:
    """Run the kinematic simulation and return the full state time-series.

    Parameters
    ----------
    waypoints_df
        Ordered waypoints with ``latitude``, ``longitude``, ``altitude_m`` and
        optionally ``is_holding`` (bool) and ``hold_time_s`` (float).
    params
        Physics limits; defaults to :class:`PhysicsParams`.
    vertical_takeoff
        If ``True`` (first waypoint at ground level), begin with a vertical
        take-off to hover. If ``False`` (first waypoint already airborne), start
        directly at the first waypoint's altitude and accelerate from a standstill
        into forward flight (no vertical take-off).
    touchdown_idx
        Index of the touchdown waypoint where the vertical landing occurs. The
        aircraft flies level to it, descends vertically, then taxis along the
        ground through every waypoint after it to the last (the parking spot),
        decelerating to a stop. ``None`` (default) means the last waypoint is the
        touchdown (vertical landing there, no taxi). Set this to the first of a
        trailing run of ground waypoints for a taxi-to-parking arrival.
    taxi_speed
        Ground taxi speed in m/s (default 10 kt).
    """
    p = params or PhysicsParams()
    wp_lla = waypoints_df[["latitude", "longitude", "altitude_m"]].values
    n_wp = len(wp_lla)
    if n_wp < 2:
        raise ValueError("At least two waypoints are required.")

    # Per-waypoint holding metadata (optional columns).
    is_holding = (
        waypoints_df["is_holding"].astype(bool).tolist()
        if "is_holding" in waypoints_df else [False] * n_wp
    )
    hold_time = (
        waypoints_df["hold_time_s"].astype(float).tolist()
        if "hold_time_s" in waypoints_df else [0.0] * n_wp
    )
    # Take-off and landing waypoints are never holding points.
    is_holding[0] = is_holding[-1] = False

    origin = wp_lla[0]
    geo = GeoConverter(origin[0], origin[1], origin[2])
    wp = np.array([geo.lla_to_ned(lat, lon, alt) for lat, lon, alt in wp_lla])

    # Horizontal leg lengths between consecutive waypoints.
    leg_len = [float(np.hypot(wp[k + 1][0] - wp[k][0], wp[k + 1][1] - wp[k][1]))
               for k in range(n_wp - 1)]
    last = n_wp - 1
    # Touchdown waypoint (where vertical landing happens) and parking waypoint.
    # Everything after the touchdown is reached by a ground taxi.
    park_idx = last
    land_idx = last if touchdown_idx is None else max(1, min(touchdown_idx, last))

    def next_stop_idx(i: int) -> int:
        """Next holding point in ``[i, land_idx)``, else the touchdown waypoint."""
        for j in range(i, land_idx):
            if is_holding[j]:
                return j
        return land_idx

    dt = p.dt
    max_yaw_rate = np.radians(p.max_yaw_rate_deg)

    states: list[dict] = []
    x, y, z = wp[0]
    v_fwd = vx = vy = vz = 0.0
    yaw = float(np.arctan2(wp[1][1] - y, wp[1][0] - x))
    roll = pitch = 0.0
    time_t = 0.0
    hold_elapsed = 0.0

    current = 1                # index of the waypoint we are flying toward
    # Ground take-off climbs to hover first; an airborne start begins forward
    # flight immediately at the first waypoint's altitude (still from v=0).
    phase = "TAKEOFF" if vertical_takeoff else "FORWARD"
    prev_dist = np.inf         # previous distance to the current target (overshoot detect)
    z_takeoff, z_landing = wp[0][2], wp[land_idx][2]

    while phase != "DONE" and time_t < p.max_sim_time:
        states.append({
            "time_s": time_t, "n": x, "e": y, "d": z,
            "vx": vx, "vy": vy, "vz": vz, "v_fwd": v_fwd,
            "roll_deg": np.degrees(roll), "pitch_deg": np.degrees(pitch),
            "yaw_deg": np.degrees(yaw),
        })

        # ── Phase: vertical take-off ──────────────────────────────────
        if phase == "TAKEOFF":
            target_z = z_takeoff - p.hover_alt_threshold
            if z > target_z:
                vz = max(-p.v_climb, vz - p.max_accel * dt)
            else:
                vz = min(0.0, vz + p.max_decel * dt)
                if vz >= 0.0:
                    vz, z, phase = 0.0, target_z, "FORWARD"
            z += vz * dt

        # ── Phase: hovering at a holding waypoint ─────────────────────
        elif phase == "HOLD":
            v_fwd = vx = vy = vz = 0.0
            roll = pitch = 0.0
            x, y, z = wp[current][0], wp[current][1], wp[current][2]
            hold_elapsed += dt
            if hold_elapsed >= hold_time[current]:
                hold_elapsed = 0.0
                current = min(current + 1, last)
                phase = "FORWARD"

        # ── Phase: forward flight (climb / cruise / descend) ──────────
        elif phase == "FORWARD":
            target = wp[current]
            dist_target = np.hypot(target[0] - x, target[1] - y)

            # Advance through ordinary (non-stop) waypoints we have reached
            # (but never past the touchdown point — taxi handles the rest).
            if (dist_target < p.acceptance_radius and current < land_idx
                    and not is_holding[current]):
                current += 1
                target = wp[current]
                dist_target = np.hypot(target[0] - x, target[1] - y)
                prev_dist = np.inf

            # Distance to the next stop (holding point or final waypoint).
            stop = next_stop_idx(current)
            dist_to_stop = dist_target + sum(leg_len[current:stop])

            # Stopping-distance speed profile (keeps speed low near a stop).
            v_stop = np.sqrt(2 * p.max_decel * max(0.0, dist_to_stop - p.stop_margin))
            v_target = min(p.v_cruise, v_stop)
            if v_fwd < v_target:
                v_fwd = min(v_target, v_fwd + p.max_accel * dt)
            else:
                v_fwd = max(v_target, v_fwd - p.max_decel * dt)

            # Arrived at the stop? Capture when inside the arrival radius, or when
            # overshooting (still close but the distance has started growing).
            if current == stop and (
                dist_target < p.final_arrival_radius
                or (dist_target < p.capture_radius and dist_target > prev_dist)
            ):
                x, y = target[0], target[1]
                v_fwd = 0.0
                prev_dist = np.inf
                if stop == land_idx:
                    vz, phase = 0.0, "LANDING"
                else:                                  # holding point
                    phase, hold_elapsed = "HOLD", 0.0
            else:
                prev_dist = dist_target

            # Heading: rate-limited turn toward the target.
            desired_yaw = np.arctan2(target[1] - y, target[0] - x)
            yaw_err = (desired_yaw - yaw + np.pi) % (2 * np.pi) - np.pi
            yaw_rate = np.clip(yaw_err / dt, -max_yaw_rate, max_yaw_rate)
            yaw += yaw_rate * dt
            roll = np.arctan2(v_fwd * yaw_rate, G_CONST)

            # Vertical: move toward the target waypoint altitude — but on the
            # final approach to the touchdown point, hold altitude (level flight)
            # so the descent is a clean vertical drop in the LANDING phase.
            if current == land_idx:
                vz = min(0.0, vz + p.max_decel * dt) if vz < 0 else max(0.0, vz - p.max_decel * dt)
            else:
                target_z = target[2]
                if z > target_z + p.cruise_alt_margin:
                    vz = max(-p.v_climb, vz - p.max_accel * dt)
                elif z < target_z - p.cruise_alt_margin:
                    vz = min(p.v_climb, vz + p.max_accel * dt)
                else:
                    vz = min(0.0, vz + p.max_decel * dt) if vz < 0 else max(0.0, vz - p.max_decel * dt)
            pitch = np.radians(-3.0) if vz < -0.3 else (np.radians(5.0) if vz > 0.3 else 0.0)

            vx, vy = v_fwd * np.cos(yaw), v_fwd * np.sin(yaw)
            x += vx * dt
            y += vy * dt
            z += vz * dt

        # ── Phase: vertical landing ───────────────────────────────────
        elif phase == "LANDING":
            roll = pitch = 0.0
            if z < z_landing:
                vz = min(p.v_climb, vz + p.max_accel * dt)
            else:
                vz = max(0.0, vz - p.max_decel * dt)
                if vz <= 0.0:
                    vz = 0.0
                    z = z_landing            # snap to ground (remove decel undershoot)
                    if land_idx < park_idx:
                        phase, current, prev_dist = "TAXI", land_idx + 1, np.inf
                    else:
                        phase = "DONE"
            z += vz * dt

        # ── Phase: ground taxi to the parking spot (one or more legs) ──
        elif phase == "TAXI":
            roll = pitch = vz = 0.0
            target = wp[current]
            dist_target = np.hypot(target[0] - x, target[1] - y)

            # Advance through intermediate taxi waypoints.
            if dist_target < p.acceptance_radius and current < park_idx:
                current += 1
                target = wp[current]
                dist_target = np.hypot(target[0] - x, target[1] - y)
                prev_dist = np.inf

            # Stopping-distance profile to the parking spot, capped at taxi speed.
            dist_to_park = dist_target + sum(leg_len[current:park_idx])
            v_stop = np.sqrt(2 * p.max_decel * max(0.0, dist_to_park - p.stop_margin))
            v_target = min(taxi_speed, v_stop)
            if v_fwd < v_target:
                v_fwd = min(v_target, v_fwd + p.max_accel * dt)
            else:
                v_fwd = max(v_target, v_fwd - p.max_decel * dt)

            if current == park_idx and (
                dist_target < p.final_arrival_radius
                or (dist_target < p.capture_radius and dist_target > prev_dist)
            ):
                x, y = target[0], target[1]
                v_fwd = vx = vy = 0.0
                phase = "DONE"
            else:
                prev_dist = dist_target
                # On the ground the taxi pivots to any heading freely (no
                # turn-rate limit) and heads straight for the next point.
                yaw = np.arctan2(target[1] - y, target[0] - x)
                vx, vy = v_fwd * np.cos(yaw), v_fwd * np.sin(yaw)
                x += vx * dt
                y += vy * dt

        time_t += dt

    # Record the final resting state (the loop exits on the capture that stops
    # the vehicle, so the last snap-to-zero would otherwise be missing).
    if phase == "DONE":
        states.append({
            "time_s": time_t, "n": x, "e": y, "d": z,
            "vx": 0.0, "vy": 0.0, "vz": 0.0, "v_fwd": 0.0,
            "roll_deg": 0.0, "pitch_deg": 0.0, "yaw_deg": np.degrees(yaw),
        })

    df = pd.DataFrame(states)
    return _add_derived(df, geo, dt)


def _add_derived(df: pd.DataFrame, geo: GeoConverter, dt: float) -> pd.DataFrame:
    """Append geodetic coordinates and derived kinematic quantities."""
    lla = np.array([geo.ned_to_lla(n, e, d) for n, e, d in df[["n", "e", "d"]].values])
    df["latitude"] = lla[:, 0]
    df["longitude"] = lla[:, 1]
    df["altitude_m"] = lla[:, 2]
    df["altitude_msl_ft"] = df["altitude_m"] * M_TO_FT

    # Horizontal ground speed and heading (vx = North, vy = East velocity).
    df["ground_speed_mps"] = ground_speed_mps(df["vx"].values, df["vy"].values)
    df["ground_speed_kt"] = df["ground_speed_mps"] * MPS_TO_KT
    df["heading_deg"] = heading_deg(df["vx"].values, df["vy"].values)
    gs = df["ground_speed_mps"].replace(0.0, np.nan)
    df["dir_north"] = (df["vx"] / gs).fillna(0.0)
    df["dir_east"] = (df["vy"] / gs).fillna(0.0)

    # Vertical speed: NED "down" is positive, so climb is -vz.
    df["climb_rate_fpm"] = -df["vz"] * MPS_TO_FPM

    # Accelerations and passenger g-load.
    df["fwd_accel"] = np.gradient(df["v_fwd"], dt)
    df["vert_accel"] = np.gradient(df["vz"], dt)
    df["g_fwd"] = df["fwd_accel"] / G_CONST
    df["g_vert"] = 1.0 - (df["vert_accel"] / G_CONST)
    return df
