# Air-Taxi Trajectory Visualization

An interactive web application for planning and visualizing eVTOL air-taxi trajectories. Users place ordered waypoints on a 2-D map, choose a vehicle physics preset, and the backend kinematic engine simulates the full flight — which is then rendered as a smooth 3-D animation in a Cesium globe alongside altitude, speed, and g-load profile charts.

---

## Quick Start

Choose one of the two methods below. Both serve the app at **http://localhost:5173**.

---

## Method 1 — Local Python (for developers / teammates)

### Requirements

| Tool | Version |
|------|---------|
| Python | **3.11** (other versions may work but are untested) |
| Node.js | **20** or later |

Download Python 3.11: https://www.python.org/downloads/release/python-3110/
Download Node.js 20: https://nodejs.org/en/download

### Backend setup

```bash
cd backend
python3.11 -m venv .venv

# Mac / Linux
source .venv/bin/activate

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
```

Install dependencies and start the API server:

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend is ready when you see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

### Frontend setup

Open a **second terminal** in the project root:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Method 2 — Docker (recommended for professors / graders)

No Python or Node installation needed. Docker handles everything.

### Install Docker Desktop

| Platform | Link |
|----------|------|
| Mac (Apple Silicon M1/M2/M3/M4) | https://docs.docker.com/desktop/install/mac-install/ — choose **Apple Chip** |
| Mac (Intel) | https://docs.docker.com/desktop/install/mac-install/ — choose **Intel Chip** |
| Windows | https://docs.docker.com/desktop/install/windows-install/ |

> **Windows note:** The installer will prompt you to enable WSL 2. Accept and restart when asked.

Launch Docker Desktop after installation and wait for the whale icon in your menu bar / taskbar to become steady (not animating).

### Run the app

```bash
# In the project root directory
docker compose up --build
```

The first run downloads base images and compiles the frontend — this takes a few minutes. Subsequent runs are faster.

The app is ready when you see these lines in the terminal output:

```
backend-1  | INFO:     Started server process [1]
backend-1  | INFO:     Waiting for application startup.
backend-1  | INFO:     Application startup complete.
backend-1  | INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

Open **http://localhost:5173** in your browser.

To stop: press `Ctrl+C` in the terminal, then run `docker compose down`.

---

## Project Structure

```
.
├── backend/
│   ├── main.py                   # FastAPI application and API routes
│   ├── requirements.txt
│   └── trajectory_engine/
│       ├── engine.py             # Kinematic simulation loop
│       ├── geo.py                # LLA ↔ NED coordinate conversion
│       └── params.py             # Default physics parameters (Joby S4)
├── data/
│   ├── corridors/                # GeoJSON approach corridor overlays
│   └── sample_waypoints.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CesiumViewer.jsx  # 3-D globe with animated drone model
│   │   │   ├── PlannerMap.jsx    # Leaflet map for waypoint placement
│   │   │   ├── ProfileCharts.jsx # Altitude / speed / g-load time series
│   │   │   ├── TrajectoryMap.jsx # 2-D trajectory overlay
│   │   │   ├── VehiclePanel.jsx  # Physics preset controls
│   │   │   └── WaypointList.jsx  # Editable waypoint table
│   │   └── pages/
│   │       ├── PlannerPage.jsx   # Route-planning workspace
│   │       └── ViewerPage.jsx    # 3-D replay workspace
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

---

## Kinematic Model

The backend uses a **point-mass kinematic model** — it enforces speed, acceleration, and turn-rate limits without modelling aerodynamic forces. All physics is expressed in a local flat-earth **North-East-Down (NED)** coordinate frame anchored at the first waypoint, which keeps the maths Euclidean and accurate to within a metre over the ~20 km corridors used here.

### State machine

The simulation advances through the following phases:

```
TAKEOFF → FORWARD → [HOLD → FORWARD] → LANDING → [TAXI]
```

| Phase | Behaviour |
|-------|-----------|
| **TAKEOFF** | Vertical climb at `v_climb` to a hover altitude, then transition to forward flight |
| **FORWARD** | Fly toward each waypoint in order; climb or descend to match each waypoint's altitude |
| **HOLD** | Stop and hover at a designated holding waypoint for the configured duration |
| **LANDING** | Decelerate to level flight, then descend vertically onto the touchdown point |
| **TAXI** | Ground roll to the parking spot at ≤ 10 kt if additional ground waypoints exist |

### Speed profile

Forward speed is governed by a single **stopping-distance rule**:

```
v_target = min(v_cruise, sqrt(2 × max_decel × d_to_next_stop))
```

where `d_to_next_stop` is the cumulative path distance to the next holding or landing waypoint. This one rule produces automatic early deceleration before stops and prevents re-acceleration when the next stop is close.

### Turn dynamics

Heading is **rate-limited**: the yaw rate is clamped to `max_yaw_rate_deg` (default 3 °/s, a standard-rate turn). Bank angle is derived from the coordinated-turn relationship:

```
roll = arctan(v_fwd × yaw_rate / g)
```

### Default parameters (Joby S4 preset)

| Parameter | Value |
|-----------|-------|
| Cruise speed | 90 kt (46.3 m/s) |
| Vertical climb / descent | 492 fpm (2.5 m/s) |
| Max forward acceleration | 0.15 g (1.47 m/s²) |
| Max forward deceleration | 0.10 g (0.98 m/s²) |
| Max yaw rate | 3 °/s |
| Time step | 0.2 s |

Additional presets (Generic eVTOL, Helicopter-like, Fast air taxi) and per-parameter overrides are available from the Vehicle Panel in the UI.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, CesiumJS 1.131, Leaflet, Plotly |
| Backend | FastAPI, Uvicorn, NumPy, Pandas |
| Containerization | Docker Compose (nginx + Python 3.11 slim) |
