import { NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { getHealth } from "./api/client.js";
import HomePage from "./pages/HomePage.jsx";
import PlannerPage from "./pages/PlannerPage.jsx";
import ViewerPage from "./pages/ViewerPage.jsx";

function BackendStatus() {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    getHealth()
      .then(() => setOk(true))
      .catch(() => setOk(false));
  }, []);
  const label = ok == null ? "checking…" : ok ? "backend online" : "backend offline";
  const cls = ok == null ? "dot dot-wait" : ok ? "dot dot-ok" : "dot dot-bad";
  return (
    <span className="backend-status" title={label}>
      <span className={cls} /> {label}
    </span>
  );
}

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▲</span>
          <div className="brand-text">
            <span className="brand-title">Air-Taxi Trajectory</span>
            <span className="brand-sub">LATTICE Lab · U-M Aerospace</span>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className="nav-link">Home</NavLink>
          <NavLink to="/planner" className="nav-link">Planner</NavLink>
          <NavLink to="/viewer" className="nav-link">Viewer</NavLink>
        </nav>
        <BackendStatus />
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/viewer" element={<ViewerPage />} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="footer-lab">
          <strong>LATTICE Lab</strong> — University of Michigan, Department of
          Aerospace Engineering
        </div>
        <div className="footer-people">
          Team: Sinan Abdulhak · Armaan Kamat · Karis Hu · Zerong Huang · Ben
          Donaldson &nbsp;|&nbsp; Advisor: Prof. Max Li
        </div>
      </footer>
    </div>
  );
}
