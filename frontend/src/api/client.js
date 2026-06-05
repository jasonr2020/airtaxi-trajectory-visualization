// Thin wrapper around the backend API. Paths are same-origin (/api/...) and
// proxied to the FastAPI server by Vite in dev (see vite.config.js).

async function request(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function getHealth() {
  return request("/api/health");
}

export function getPresets() {
  return request("/api/presets");
}

export function getCorridors() {
  return request("/api/corridors");
}

export function getCorridor(flow) {
  return request(`/api/corridors/${flow}`);
}

export function simulate(payload) {
  return request("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
