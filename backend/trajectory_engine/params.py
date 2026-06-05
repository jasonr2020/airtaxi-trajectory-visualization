"""Kinematic limits for the eVTOL (defaults modelled on a Joby S4)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PhysicsParams:
    v_cruise: float = 46.3          # m/s  forward cruise speed
    v_climb: float = 2.5            # m/s  vertical take-off / landing speed
    max_accel: float = 1.5         # m/s^2 max comfortable forward accel (~0.15 g)
    max_decel: float = 1.0         # m/s^2 max smooth forward decel (~0.1 g)
    max_yaw_rate_deg: float = 3.0   # deg/s standard rate turn
    dt: float = 0.2                 # s    simulation time step

    # --- phase-transition thresholds ---
    hover_alt_threshold: float = 2.0     # m  rel. alt. for hover<->forward transition
    acceptance_radius: float = 10.0      # m  pass-through waypoint acceptance radius
    cruise_alt_margin: float = 2.0       # m  tolerance for reaching cruise altitude
    final_arrival_radius: float = 8.0    # m  distance tolerance to arrive at a stop
    capture_radius: float = 25.0         # m  if overshooting, capture the stop within this
    stop_margin: float = 2.0             # m  stand-off distance used in the stop profile
    max_sim_time: float = 3000.0         # s  safety cap on simulation length
