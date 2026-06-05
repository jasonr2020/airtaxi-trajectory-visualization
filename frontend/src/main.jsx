import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

// NOTE: StrictMode is intentionally omitted. Its dev-only double mount/unmount
// destroys and recreates the Cesium Viewer between renders, which CesiumJS does
// not tolerate (async callbacks then touch a destroyed viewer).
ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
