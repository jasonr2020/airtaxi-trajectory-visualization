"""Geodesy helpers: flat-earth LLA<->NED conversion and unit conversions.

The trajectory engine works in a local North-East-Down (NED) metric frame so
that speeds and accelerations are simple Euclidean quantities.
"""

from __future__ import annotations

import numpy as np

# --- unit conversion constants -----------------------------------------
M_TO_FT = 3.280839895          # metres   -> feet
FT_TO_M = 1.0 / M_TO_FT        # feet     -> metres
MPS_TO_KT = 1.943844492        # m/s      -> knots
MPS_TO_FPM = 196.8503937       # m/s      -> feet per minute
EARTH_RADIUS_M = 6378137.0     # WGS-84 equatorial radius


class GeoConverter:
    """Flat-earth tangent-plane converter anchored at a reference LLA point.

    Accurate to well under a metre over the ~20 km corridors used here, while
    keeping the maths trivial and dependency-free.
    """

    def __init__(self, ref_lat: float, ref_lon: float, ref_alt: float):
        self.ref_lat = np.radians(ref_lat)
        self.ref_lon = np.radians(ref_lon)
        self.ref_alt = ref_alt
        self.R = EARTH_RADIUS_M

    def lla_to_ned(self, lat: float, lon: float, alt: float) -> np.ndarray:
        """Geodetic (deg, deg, m) -> local NED (m). Down is positive."""
        d_lat = np.radians(lat) - self.ref_lat
        d_lon = np.radians(lon) - self.ref_lon
        n = d_lat * self.R
        e = d_lon * self.R * np.cos(self.ref_lat)
        d = -(alt - self.ref_alt)
        return np.array([n, e, d])

    def ned_to_lla(self, n: float, e: float, d: float):
        """Local NED (m) -> geodetic (deg, deg, m)."""
        lat = np.degrees(self.ref_lat + n / self.R)
        lon = np.degrees(self.ref_lon + e / (self.R * np.cos(self.ref_lat)))
        alt = self.ref_alt - d
        return lat, lon, alt


def heading_deg(vel_north: np.ndarray, vel_east: np.ndarray) -> np.ndarray:
    """Compass heading in degrees [0, 360) from N/E velocity components."""
    return np.degrees(np.arctan2(vel_east, vel_north)) % 360.0


def ground_speed_mps(vel_north: np.ndarray, vel_east: np.ndarray) -> np.ndarray:
    """Horizontal ground speed (m/s)."""
    return np.hypot(vel_north, vel_east)
