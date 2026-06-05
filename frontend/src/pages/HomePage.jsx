import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="page home">
      <section className="hero">
        <h1>
          Air-Taxi Trajectory <span className="accent">Visualization</span>
        </h1>
        <p className="hero-lead">
          Plan eVTOL air-taxi routes on a satellite map, generate smooth
          kinematic trajectories, and replay them in 2D and 3D.
        </p>
      </section>

      <section className="cards">
        <Link to="/planner" className="card">
          <div className="card-icon">🛰️</div>
          <h2>Planner</h2>
          <p>
            Drop waypoints on a satellite map, set each altitude, and mark
            holding points. Export the route as a JSON file.
          </p>
          <span className="card-cta">Open Planner →</span>
        </Link>

        <Link to="/viewer" className="card">
          <div className="card-icon">🎬</div>
          <h2>Viewer</h2>
          <p>
            Import a route, run the trajectory engine, and view the path,
            altitude / speed charts, and a 3D flight animation.
          </p>
          <span className="card-cta">Open Viewer →</span>
        </Link>
      </section>

      <section className="about">
        <h3>About this project</h3>
        <p>
          Developed by the <strong>LATTICE Lab</strong> in the University of
          Michigan Department of Aerospace Engineering. The tool models
          air-taxi flight as a kinematic trajectory subject to comfortable
          speed, acceleration, and turn-rate limits — letting researchers
          sketch and visualize routes without detailed vehicle data.
        </p>
        <p>
          The ultimate goal is to provide clearer trajectory visualization that
          supports <strong>air traffic control</strong> and{" "}
          <strong>operation management</strong> for emerging air-taxi networks —
          helping controllers and operators understand, plan, and coordinate
          eVTOL flights more effectively.
        </p>
      </section>
    </div>
  );
}
