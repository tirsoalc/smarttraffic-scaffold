import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { MetricCard } from "./components/MetricCard";
import { Panel } from "./components/Panel";
import {
  API_BASE_URL,
  ApiError,
  createTrafficRecord,
  generateSimulation,
  getExport,
  getTrafficInsights,
  getTrafficMap,
  getTrafficRecords,
  getTrafficStats
} from "./lib/api";
import type {
  CreateTrafficRecordRequest,
  MapPoint,
  SimulationRequest,
  TrafficInsightResponse,
  TrafficRecord,
  TrafficStatsResponse
} from "./types/api";

type DashboardState = {
  records: TrafficRecord[];
  byHour: TrafficStatsResponse;
  byWeekday: TrafficStatsResponse;
  byRoadType: TrafficStatsResponse;
  insights: TrafficInsightResponse;
  mapPoints: MapPoint[];
};

type TrafficLevel = "LOW" | "MEDIUM" | "HIGH";

type MapTrafficSegment = {
  id: string;
  region: string;
  averageVolume: number;
  level: TrafficLevel;
  color: string;
  positions: [[number, number], [number, number]];
};

const emptyStats: TrafficStatsResponse = { labels: [], values: [] };
const emptyInsights: TrafficInsightResponse = { insights: [] };
const recordTemplate: CreateTrafficRecordRequest = {
  timestamp: new Date().toISOString(),
  roadType: "ARTERIAL",
  vehicleVolume: 120,
  eventType: "",
  weather: "",
  region: "DEFAULT_REGION"
};
const simulationTemplate: SimulationRequest = {
  recordsToGenerate: 24,
  scenarioName: "Rush Hour Stress Test"
};

function formatLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function buildChartData(stats: TrafficStatsResponse) {
  return stats.labels.map((label, index) => ({
    label: formatLabel(label),
    value: stats.values[index] ?? 0
  }));
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function toDatetimeLocalValue(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const normalized = new Date(date.getTime() - offset * 60_000);
  return normalized.toISOString().slice(0, 16);
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 100);
}

function hashRegion(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTrafficLevel(averageVolume: number): TrafficLevel {
  if (averageVolume >= 200) {
    return "HIGH";
  }
  if (averageVolume >= 100) {
    return "MEDIUM";
  }
  return "LOW";
}

function getTrafficColor(level: TrafficLevel) {
  if (level === "HIGH") {
    return "#ef4444";
  }
  if (level === "MEDIUM") {
    return "#facc15";
  }
  return "#22c55e";
}

function buildMapTrafficSegments(mapPoints: MapPoint[], records: TrafficRecord[]): MapTrafficSegment[] {
  const fallbackAverage =
    records.length > 0
      ? records.reduce((sum, record) => sum + record.vehicleVolume, 0) / records.length
      : 0;

  const regionTraffic = new Map<string, { total: number; count: number }>();
  for (const record of records) {
    if (!record.region) {
      continue;
    }
    const current = regionTraffic.get(record.region) ?? { total: 0, count: 0 };
    current.total += record.vehicleVolume;
    current.count += 1;
    regionTraffic.set(record.region, current);
  }

  return mapPoints.map((point, index) => {
    const traffic = regionTraffic.get(point.region);
    const averageVolume = traffic ? traffic.total / traffic.count : fallbackAverage;
    const level = getTrafficLevel(averageVolume);
    const color = getTrafficColor(level);

    // Create a short deterministic segment around each point to represent the street load.
    const angle = (hashRegion(`${point.region}-${index}`) % 360) * (Math.PI / 180);
    const latOffset = 0.004 * Math.cos(angle);
    const lngOffset = 0.006 * Math.sin(angle);

    return {
      id: `${point.region}-${point.lat}-${point.lng}-${index}`,
      region: point.region,
      averageVolume,
      level,
      color,
      positions: [
        [point.lat - latOffset, point.lng - lngOffset],
        [point.lat + latOffset, point.lng + lngOffset]
      ]
    };
  });
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardState>({
    records: [],
    byHour: emptyStats,
    byWeekday: emptyStats,
    byRoadType: emptyStats,
    insights: emptyInsights,
    mapPoints: []
  });
  const [recordForm, setRecordForm] = useState<CreateTrafficRecordRequest>(recordTemplate);
  const [simulationForm, setSimulationForm] = useState<SimulationRequest>(simulationTemplate);
  const [statusMessage, setStatusMessage] = useState("Awaiting dataset sync.");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableQuery, setTableQuery] = useState("");
  const deferredQuery = useDeferredValue(tableQuery);

  async function refreshDashboard() {
    setLoading(true);
    setError(null);

    try {
      const [records, byHour, byWeekday, byRoadType, insights, mapPoints] = await Promise.all([
        getTrafficRecords(),
        getTrafficStats("hour"),
        getTrafficStats("weekday"),
        getTrafficStats("roadType"),
        getTrafficInsights(),
        getTrafficMap()
      ]);

      startTransition(() => {
        setDashboard({ records, byHour, byWeekday, byRoadType, insights, mapPoints });
      });
      setStatusMessage(`Data link active against ${API_BASE_URL}.`);
    } catch (caughtError) {
      const nextError =
        caughtError instanceof ApiError ? caughtError.message : "Unable to load traffic intelligence data.";
      setError(nextError);
      setStatusMessage("Backend connection requires attention.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshDashboard();
  }, []);

  const totals = useMemo(() => {
    const totalVolume = dashboard.records.reduce((sum, record) => sum + record.vehicleVolume, 0);
    const averageVolume = dashboard.records.length ? Math.round(totalVolume / dashboard.records.length) : 0;
    const peakHourIndex = dashboard.byHour.values.reduce(
      (bestIndex, value, currentIndex, all) => (value > (all[bestIndex] ?? 0) ? currentIndex : bestIndex),
      0
    );
    const peakRoadTypeIndex = dashboard.byRoadType.values.reduce(
      (bestIndex, value, currentIndex, all) => (value > (all[bestIndex] ?? 0) ? currentIndex : bestIndex),
      0
    );

    return {
      totalVolume,
      averageVolume,
      totalRecords: dashboard.records.length,
      peakHour: dashboard.byHour.labels[peakHourIndex] ?? "--",
      peakRoadType: dashboard.byRoadType.labels[peakRoadTypeIndex] ?? "--"
    };
  }, [dashboard.byHour.labels, dashboard.byHour.values, dashboard.byRoadType.labels, dashboard.byRoadType.values, dashboard.records]);

  const filteredRecords = useMemo(() => {
    if (!deferredQuery.trim()) {
      return dashboard.records;
    }

    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return dashboard.records.filter((record) =>
      [record.roadType, record.eventType, record.weather, record.region]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery))
    );
  }, [dashboard.records, deferredQuery]);

  async function handleRecordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await createTrafficRecord(recordForm);
      setStatusMessage("Traffic record ingested.");
      await refreshDashboard();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Record creation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSimulationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const generated = await generateSimulation(simulationForm);
      setStatusMessage(`${generated.length} simulated records generated.`);
      await refreshDashboard();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Simulation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport(format: "csv" | "json") {
    try {
      const blob = await getExport(format);
      downloadBlob(blob, `smarttrafficflow-export.${format}`);
      setStatusMessage(`Exported ${format.toUpperCase()} dataset.`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : `Unable to export ${format}.`);
    }
  }

  const hourData = buildChartData(dashboard.byHour);
  const weekdayData = buildChartData(dashboard.byWeekday);
  const roadTypeData = buildChartData(dashboard.byRoadType);
  const mapTrafficSegments = useMemo(
    () => buildMapTrafficSegments(dashboard.mapPoints, dashboard.records),
    [dashboard.mapPoints, dashboard.records]
  );
  const mapCenter: [number, number] = dashboard.mapPoints.length
    ? [dashboard.mapPoints[0].lat, dashboard.mapPoints[0].lng]
    : [-23.5505, -46.6333];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to dashboard
      </a>
      <header className="hero">
        <div className="hero__copy">
          <span className="eyebrow">SmartTrafficFlow / Urban Control Deck</span>
          <h1>Watch movement patterns, inject scenarios, and act on traffic pressure before it stacks.</h1>
          <p>
            A frontend command surface for descriptive mobility analysis, grounded in the current Spring API.
          </p>
          <div className="hero__actions">
            <button className="button button--primary" onClick={() => void refreshDashboard()} type="button">
              Refresh Live Data
            </button>
            <button className="button button--ghost" onClick={() => handleExport("csv")} type="button">
              Export CSV
            </button>
          </div>
        </div>
        <aside className="hero__rail">
          <div className="signal-block">
            <span className="eyebrow">Status</span>
            <strong>{loading ? "Syncing" : "Online"}</strong>
            <p>{statusMessage}</p>
          </div>
          <div className="signal-block">
            <span className="eyebrow">Current API</span>
            <strong>REST / JSON</strong>
            <p>{API_BASE_URL}</p>
          </div>
        </aside>
      </header>

      <main id="main" className="dashboard">
        <section className="metric-grid" aria-label="Traffic summary">
          <MetricCard
            label="Total records"
            value={formatCompactNumber(totals.totalRecords)}
            helper="Current persisted observations"
            tone="accent"
          />
          <MetricCard
            label="Volume tracked"
            value={formatCompactNumber(totals.totalVolume)}
            helper="Aggregated across all records"
          />
          <MetricCard
            label="Average volume"
            value={formatCompactNumber(totals.averageVolume)}
            helper="Mean vehicles per record"
          />
          <MetricCard
            label="Peak corridor"
            value={formatLabel(totals.peakRoadType)}
            helper={`Highest aggregate pressure near ${totals.peakHour}:00`}
          />
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="dashboard-grid">
          <Panel
            title="Volume by hour"
            subtitle="Backend aggregation from `/traffic-stats?groupBy=hour`."
          >
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={hourData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip cursor={{ fill: "rgba(59, 130, 246, 0.08)" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {hourData.map((entry, index) => (
                      <Cell
                        key={`${entry.label}-${index}`}
                        fill={index % 3 === 0 ? "#3b82f6" : index % 3 === 1 ? "#10b981" : "#64748b"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="Throughput by weekday"
            subtitle="Useful for operations planning and staffing calibration."
          >
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={weekdayData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip cursor={{ fill: "rgba(16, 185, 129, 0.08)" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="Pressure by road type"
            subtitle="Mapped directly from the backend's `roadType` grouping."
          >
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={roadTypeData} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <Tooltip cursor={{ fill: "rgba(255, 255, 255, 0.04)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="Insight feed"
            subtitle="Narrative output from `/traffic-insights`."
            action={<span className="chip">{dashboard.insights.insights.length} live notes</span>}
          >
            <div className="insight-list">
              {dashboard.insights.insights.length ? (
                dashboard.insights.insights.map((insight, index) => (
                  <article className="insight-card" key={`${insight}-${index}`}>
                    <span className="insight-card__index">{String(index + 1).padStart(2, "0")}</span>
                    <p>{insight}</p>
                  </article>
                ))
              ) : (
                <p className="muted-copy">No insights available until records exist.</p>
              )}
            </div>
          </Panel>

          <Panel
            title="Map signals"
            subtitle="Street traffic lines colored by intensity (red high, yellow medium, green low)."
          >
            <div className="map-shell">
              <MapContainer center={mapCenter} zoom={11} scrollWheelZoom={false}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {mapTrafficSegments.map((segment) => (
                  <Polyline
                    key={segment.id}
                    positions={segment.positions}
                    pathOptions={{ color: segment.color, weight: 7, opacity: 0.9 }}
                  >
                    <Popup>
                      <strong>{segment.region}</strong>
                      <div>
                        {segment.level === "HIGH"
                          ? "Intense traffic"
                          : segment.level === "MEDIUM"
                            ? "Medium traffic"
                            : "Low traffic"}
                      </div>
                      <div>Average volume: {Math.round(segment.averageVolume)} vehicles</div>
                    </Popup>
                  </Polyline>
                ))}
              </MapContainer>
            </div>
          </Panel>

          <Panel
            title="Simulation launcher"
            subtitle="Posts directly to `/simulations/generate` and refreshes analytics."
          >
            <form className="form-grid" onSubmit={handleSimulationSubmit}>
              <label>
                <span>Records to generate</span>
                <input
                  min={1}
                  name="recordsToGenerate"
                  onChange={(event) =>
                    setSimulationForm((current) => ({
                      ...current,
                      recordsToGenerate: Number(event.target.value)
                    }))
                  }
                  type="number"
                  value={simulationForm.recordsToGenerate}
                />
              </label>
              <label>
                <span>Scenario label</span>
                <input
                  name="scenarioName"
                  onChange={(event) =>
                    setSimulationForm((current) => ({ ...current, scenarioName: event.target.value }))
                  }
                  placeholder="Rush Hour Stress Test"
                  value={simulationForm.scenarioName}
                />
              </label>
              <button className="button button--primary" disabled={submitting} type="submit">
                Generate Scenario
              </button>
            </form>
          </Panel>

          <Panel
            title="Create record"
            subtitle="Manual ingestion form for the traffic record payload."
          >
            <form className="form-grid" onSubmit={handleRecordSubmit}>
              <label>
                <span>Timestamp</span>
                <input
                  name="timestamp"
                  onChange={(event) =>
                    setRecordForm((current) => ({
                      ...current,
                      timestamp: new Date(event.target.value).toISOString()
                    }))
                  }
                  type="datetime-local"
                  value={toDatetimeLocalValue(recordForm.timestamp)}
                />
              </label>
              <label>
                <span>Road type</span>
                <select
                  name="roadType"
                  onChange={(event) =>
                    setRecordForm((current) => ({ ...current, roadType: event.target.value }))
                  }
                  value={recordForm.roadType}
                >
                  <option value="LOCAL">LOCAL</option>
                  <option value="ARTERIAL">ARTERIAL</option>
                  <option value="HIGHWAY">HIGHWAY</option>
                </select>
              </label>
              <label>
                <span>Vehicle volume</span>
                <input
                  min={0}
                  name="vehicleVolume"
                  onChange={(event) =>
                    setRecordForm((current) => ({
                      ...current,
                      vehicleVolume: Number(event.target.value)
                    }))
                  }
                  type="number"
                  value={recordForm.vehicleVolume}
                />
              </label>
              <label>
                <span>Event type</span>
                <input
                  name="eventType"
                  onChange={(event) =>
                    setRecordForm((current) => ({ ...current, eventType: event.target.value }))
                  }
                  placeholder="Concert, accident, parade"
                  value={recordForm.eventType}
                />
              </label>
              <label>
                <span>Weather</span>
                <input
                  name="weather"
                  onChange={(event) =>
                    setRecordForm((current) => ({ ...current, weather: event.target.value }))
                  }
                  placeholder="SUNNY"
                  value={recordForm.weather}
                />
              </label>
              <label>
                <span>Region</span>
                <input
                  name="region"
                  onChange={(event) =>
                    setRecordForm((current) => ({ ...current, region: event.target.value }))
                  }
                  placeholder="DEFAULT_REGION"
                  value={recordForm.region}
                />
              </label>
              <button className="button button--primary" disabled={submitting} type="submit">
                Send Record
              </button>
            </form>
          </Panel>
        </div>

        <Panel
          title="Live records"
          subtitle="Searchable table backed by `GET /traffic-records`."
          action={
            <div className="panel__tools">
              <input
                aria-label="Search records"
                className="search-input"
                onChange={(event) => setTableQuery(event.target.value)}
                placeholder="Filter by road type, weather, event, region"
                value={tableQuery}
              />
              <button className="button button--ghost" onClick={() => handleExport("json")} type="button">
                Export JSON
              </button>
            </div>
          }
        >
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Road type</th>
                  <th>Volume</th>
                  <th>Event</th>
                  <th>Weather</th>
                  <th>Region</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length ? (
                  filteredRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.timestamp)}</td>
                      <td>{formatLabel(record.roadType)}</td>
                      <td>{record.vehicleVolume}</td>
                      <td>{record.eventType || "None"}</td>
                      <td>{record.weather || "None"}</td>
                      <td>{record.region || "Unknown"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="table-empty" colSpan={6}>
                      {loading ? "Loading records..." : "No records match the current filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>
    </div>
  );
}
