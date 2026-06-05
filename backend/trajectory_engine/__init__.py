"""Self-contained eVTOL kinematic trajectory engine.

Copied and trimmed from the original ``flight_pipeline`` so this web app has no
external dependency on that package. Only the physics simulation and the
geodesy/unit helpers are kept; plotting, KML and basemap code are not needed
server-side (the browser handles visualization).
"""

from .engine import simulate
from .params import PhysicsParams

__all__ = ["simulate", "PhysicsParams"]
