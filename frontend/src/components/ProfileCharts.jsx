import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

const Plot = createPlotlyComponent(Plotly);

const FONT = { family: "Inter, sans-serif", size: 12, color: "#1a2230" };

export default function ProfileCharts({ trajectory }) {
  const t = trajectory.map((r) => r.time_s);
  const alt = trajectory.map((r) => r.altitude_agl_ft);
  const spd = trajectory.map((r) => r.ground_speed_kt);

  const common = {
    margin: { l: 60, r: 16, t: 30, b: 40 },
    font: FONT,
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    showlegend: false,
  };

  return (
    <div className="charts">
      <Plot
        divId="chart-alt"
        data={[
          {
            x: t,
            y: alt,
            type: "scatter",
            mode: "lines",
            line: { color: "#00274c", width: 2 },
            fill: "tozeroy",
            fillcolor: "rgba(0,39,76,0.08)",
          },
        ]}
        layout={{
          ...common,
          title: { text: "Altitude (ft AGL)", font: { ...FONT, size: 14 } },
          xaxis: { title: "Time (s)", gridcolor: "#eee" },
          yaxis: { title: "ft AGL", gridcolor: "#eee", rangemode: "tozero" },
        }}
        config={{ displaylogo: false, responsive: true }}
        style={{ width: "100%", height: "260px" }}
        useResizeHandler
      />
      <Plot
        divId="chart-spd"
        data={[
          {
            x: t,
            y: spd,
            type: "scatter",
            mode: "lines",
            line: { color: "#1f8a4c", width: 2 },
            fill: "tozeroy",
            fillcolor: "rgba(31,138,76,0.08)",
          },
        ]}
        layout={{
          ...common,
          title: { text: "Ground speed (kt)", font: { ...FONT, size: 14 } },
          xaxis: { title: "Time (s)", gridcolor: "#eee" },
          yaxis: { title: "kt", gridcolor: "#eee", rangemode: "tozero" },
        }}
        config={{ displaylogo: false, responsive: true }}
        style={{ width: "100%", height: "260px" }}
        useResizeHandler
      />
    </div>
  );
}
