import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
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

type ChartCardProps = {
  eyebrow: string;
  title: string;
  tone: "signal" | "ember" | "ink";
  stats: TrafficStatsResponse;
  chart: "bar" | "area";
};

type ViewMode = "home" | "workspace";

const emptyStats: TrafficStatsResponse = { labels: [], values: [] };
const emptyInsights: TrafficInsightResponse = { insights: [] };

const recordTemplate: CreateTrafficRecordRequest = {
  timestamp: new Date().toISOString(),
  roadType: "ARTERIAL",
  vehicleVolume: 140,
  eventType: "",
  weather: "",
  region: "DEFAULT_REGION"
};

const simulationTemplate: SimulationRequest = {
  recordsToGenerate: 18,
  scenarioName: "Varredura do Corredor Noturno"
};

const roadTypeOptions = ["LOCAL", "ARTERIAL", "HIGHWAY"];
const chartPalette = ["#f25c3a", "#123c63", "#ffb24a", "#5f7c6f", "#1b1b1b", "#c9772b"];

function formatLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatDatetimeLocalValue(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 120);
}

function buildChartData(stats: TrafficStatsResponse) {
  return stats.labels.map((label, index) => ({
    label: formatLabel(label),
    value: stats.values[index] ?? 0
  }));
}

function getPeakLabel(stats: TrafficStatsResponse) {
  if (stats.labels.length === 0) {
    return "Sem dados";
  }

  let peakIndex = 0;
  stats.values.forEach((value, index) => {
    if (value > (stats.values[peakIndex] ?? 0)) {
      peakIndex = index;
    }
  });

  return formatLabel(stats.labels[peakIndex] ?? "Desconhecido");
}

function getAverageVolume(records: TrafficRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  return Math.round(records.reduce((sum, record) => sum + record.vehicleVolume, 0) / records.length);
}

function getUniqueRegions(records: TrafficRecord[]) {
  return new Set(records.map((record) => record.region).filter(Boolean)).size;
}

function getLatestTimestamp(records: TrafficRecord[]) {
  if (records.length === 0) {
    return "Sem registros recebidos";
  }

  const latest = [...records].sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
  return formatDateTime(latest.timestamp);
}

function ChartCard({ eyebrow, title, tone, stats, chart }: ChartCardProps) {
  const data = buildChartData(stats);
  const areaTone = tone === "signal" ? "#f25c3a" : tone === "ember" ? "#ffb24a" : "#123c63";

  return (
    <section className={`card chart-card chart-card--${tone}`}>
      <div className="section-heading">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="chart-shell" aria-label={title}>
        <ResponsiveContainer width="100%" height={240}>
          {chart === "bar" ? (
            <BarChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(18, 60, 99, 0.12)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis tickLine={false} axisLine={false} tickMargin={10} width={44} />
              <Tooltip
                cursor={{ fill: "rgba(242, 92, 58, 0.08)" }}
                contentStyle={{ borderRadius: 18, border: "1px solid rgba(18, 60, 99, 0.12)" }}
              />
              <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`${entry.label}-${index}`} fill={chartPalette[index % chartPalette.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${tone}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={areaTone} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={areaTone} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(18, 60, 99, 0.12)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis tickLine={false} axisLine={false} tickMargin={10} width={44} />
              <Tooltip
                cursor={{ stroke: "rgba(18, 60, 99, 0.15)", strokeWidth: 1 }}
                contentStyle={{ borderRadius: 18, border: "1px solid rgba(18, 60, 99, 0.12)" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={areaTone}
                strokeWidth={3}
                fill={`url(#gradient-${tone})`}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
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
  const [tableQuery, setTableQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState("Conectando à central de tráfego.");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"record" | "simulation" | "export" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>("home");
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

      setStatusMessage(`Conexão ativa estabelecida com ${API_BASE_URL}.`);
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiError ? caughtError.message : "A central não conseguiu alcançar o backend.";
      setError(message);
      setStatusMessage("O backend precisa de atenção.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshDashboard();
  }, []);

  async function handleRecordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("record");
    setError(null);

    try {
      await createTrafficRecord({
        ...recordForm,
        timestamp: new Date(recordForm.timestamp).toISOString()
      });
      setStatusMessage("Novo registro de tráfego adicionado ao painel.");
      await refreshDashboard();
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiError ? caughtError.message : "Não foi possível criar o registro de tráfego.";
      setError(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSimulationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("simulation");
    setError(null);

    try {
      const generated = await generateSimulation(simulationForm);
      setStatusMessage(`A simulação gerou ${generated.length} novos registros.`);
      await refreshDashboard();
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiError ? caughtError.message : "Não foi possível gerar os registros da simulação.";
      setError(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExport(format: "csv" | "json") {
    setBusyAction("export");
    setError(null);

    try {
      const blob = await getExport(format);
      downloadBlob(blob, format === "csv" ? "traffic-data.csv" : "traffic-data.json");
      setStatusMessage(`Exportação preparada no formato ${format.toUpperCase()}.`);
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiError ? caughtError.message : "Não foi possível exportar os dados de tráfego.";
      setError(message);
    } finally {
      setBusyAction(null);
    }
  }

  const filteredRecords = dashboard.records.filter((record) => {
    const query = deferredQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [record.roadType, record.region, record.weather, record.eventType]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const summaryCards = [
    {
      label: "Veículos capturados",
      value: formatCompactNumber(dashboard.records.reduce((sum, record) => sum + record.vehicleVolume, 0)),
      meta: "Volume acumulado em todos os registros"
    },
    {
      label: "Janela de pico",
      value: getPeakLabel(dashboard.byHour),
      meta: "Maior concentração nos dados atuais"
    },
    {
      label: "Regiões mapeadas",
      value: String(getUniqueRegions(dashboard.records)),
      meta: "Corredores monitorados com tráfego"
    },
    {
      label: "Carga média",
      value: formatCompactNumber(getAverageVolume(dashboard.records)),
      meta: "Veículos por registro capturado"
    }
  ];

  const insightList =
    dashboard.insights.insights.length > 0
      ? dashboard.insights.insights
      : [
          "Aguardando registros suficientes para destacar insights narrativos.",
          "Alimente a base manualmente ou execute uma simulação para gerar sinal."
        ];

  const isHomeView = activeView === "home";
  const heroTitle = isHomeView
    ? "Inteligência de tráfego com ritmo editorial e estrutura de central operacional."
    : "Registre ocorrências, execute cenários e acompanhe o fluxo operacional em uma área dedicada.";
  const heroText = isHomeView
    ? "O novo frontend organiza os dados viários ao vivo como uma central visual: cabeçalhos editoriais, cards táteis, formulários prontos para operação e um mapa conectado ao contrato real do backend."
    : "A área de operação concentra formulários e registros em uma página própria, mantendo o mesmo acabamento visual e deixando a navegação entre leitura e ação mais direta.";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <div className="ambient ambient--left" />
      <div className="ambient ambient--right" />

      <header className="hero">
        <div className={`hero-copy reveal reveal-1 ${isHomeView ? "" : "hero-copy--workspace"}`.trim()}>
          <p className="kicker">SmartTrafficFlow / Central de Sinais Urbanos</p>
          <h1>{heroTitle}</h1>
          <p className="hero-text">{heroText}</p>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={() => void handleExport("csv")}>
              Exportar CSV
            </button>
            <button type="button" className="ghost-button" onClick={() => void handleExport("json")}>
              Exportar JSON
            </button>
          </div>
        </div>

        <aside className="hero-panel reveal reveal-2">
          <div className="view-switcher" aria-label="Navegação principal">
            <button
              type="button"
              className={`view-switcher__button ${isHomeView ? "view-switcher__button--active" : ""}`}
              aria-pressed={isHomeView}
              onClick={() => setActiveView("home")}
            >
              Página de insights
            </button>
            <button
              type="button"
              className={`view-switcher__button ${!isHomeView ? "view-switcher__button--active" : ""}`}
              aria-pressed={!isHomeView}
              onClick={() => setActiveView("workspace")}
            >
              Formulários e registros
            </button>
          </div>
          <div className="status-strip">
            <span className={`status-dot ${loading ? "status-dot--loading" : ""}`} />
            <strong>Pulso ao vivo</strong>
            <span>{loading ? "Sincronizando" : "Conectado"}</span>
          </div>
          <div className="hero-metrics">
            <div>
              <span className="metric-label">Última entrada</span>
              <strong>{getLatestTimestamp(dashboard.records)}</strong>
            </div>
            <div>
              <span className="metric-label">Endpoint</span>
              <strong>{API_BASE_URL}</strong>
            </div>
          </div>
          <p className="hero-note">
            Feito para leitura rápida, não para uma coleção genérica de widgets. O layout prioriza hierarquia, ritmo
            e clareza operacional.
          </p>
        </aside>
      </header>

      <main id="main-content" className="main-grid">
        {isHomeView ? (
          <>
            <section className="summary-grid reveal reveal-2">
              {summaryCards.map((card) => (
                <article key={card.label} className="card summary-card">
                  <p>{card.label}</p>
                  <h2>{card.value}</h2>
                  <span>{card.meta}</span>
                </article>
              ))}
            </section>

            <section className="card bulletin-card reveal reveal-3">
              <div className="section-heading">
                <p>Boletim operacional</p>
                <h2>Notas da central</h2>
              </div>
              <div className="bulletin-copy">
                <p>
                  Registros, pontos do mapa, estatísticas e insights são carregados diretamente do backend em Spring
                  Boot. Se a API falhar, a interface expõe o problema em vez de mascará-lo com placeholders.
                </p>
                <div className="badge-row">
                  <span className="pill">React + Vite</span>
                  <span className="pill">API Spring integrada</span>
                  <span className="pill">Mapeamento com Leaflet</span>
                </div>
              </div>
              <div className="status-box" aria-live="polite">
                <strong>Situação</strong>
                <p>{error ?? statusMessage}</p>
              </div>
            </section>

            <div className="charts-grid reveal reveal-3">
              <ChartCard eyebrow="Cadência de volume" title="Curva horária de pressão" tone="signal" chart="area" stats={dashboard.byHour} />
              <ChartCard eyebrow="Padrão semanal" title="Distribuição por dia útil" tone="ink" chart="bar" stats={dashboard.byWeekday} />
              <ChartCard eyebrow="Mistura viária" title="Divisão por tipo de via" tone="ember" chart="bar" stats={dashboard.byRoadType} />
            </div>

            <section className="card map-card reveal reveal-4">
              <div className="section-heading">
                <p>Visão da rede</p>
                <h2>Monitor do mapa de tráfego</h2>
              </div>
              <div className="map-shell">
                <MapContainer center={[-23.5505, -46.6333]} zoom={11} scrollWheelZoom={false} zoomControl={true}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {dashboard.mapPoints.map((point) => (
                    <CircleMarker
                      key={`${point.region}-${point.lat}-${point.lng}`}
                      center={[point.lat, point.lng]}
                      radius={10}
                      pathOptions={{ color: "#123c63", fillColor: "#f25c3a", fillOpacity: 0.78, weight: 2 }}
                    >
                      <Popup>
                        <strong>{point.region}</strong>
                        <br />
                        {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            </section>

            <section className="card insight-card reveal reveal-4">
              <div className="section-heading section-heading--centered">
                <p>Camada narrativa</p>
                <h2>Insights gerados</h2>
              </div>
              <ol className="insight-list">
                {insightList.map((insight) => (
                  <li key={insight}>{insight}</li>
                ))}
              </ol>
            </section>
          </>
        ) : (
          <>
            <section className="card workspace-intro reveal reveal-3">
              <div className="section-heading">
                <p>Área operacional</p>
                <h2>Formulários e registros</h2>
              </div>
              <div className="workspace-intro__body">
                <p>
                  Esta página concentra a captura manual, a geração de cenários e o painel tabular de registros para
                  uma rotina mais direta de operação.
                </p>
                <div className="status-box" aria-live="polite">
                  <strong>Situação</strong>
                  <p>{error ?? statusMessage}</p>
                </div>
              </div>
            </section>

            <section className="form-grid reveal reveal-4">
              <section className="card form-card">
                <div className="section-heading">
                  <p>Entrada de campo</p>
                  <h2>Adicionar registro de tráfego</h2>
                </div>
                <form className="stack-form" onSubmit={handleRecordSubmit}>
                  <label>
                    Data e hora
                    <input
                      type="datetime-local"
                      value={formatDatetimeLocalValue(recordForm.timestamp)}
                      onChange={(event) =>
                        setRecordForm((current) => ({
                          ...current,
                          timestamp: new Date(event.target.value).toISOString()
                        }))
                      }
                    />
                  </label>
                  <label>
                    Tipo de via
                    <select
                      value={recordForm.roadType}
                      onChange={(event) =>
                        setRecordForm((current) => ({ ...current, roadType: event.target.value }))
                      }
                    >
                      {roadTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Volume de veículos
                    <input
                      type="number"
                      min="1"
                      value={recordForm.vehicleVolume}
                      onChange={(event) =>
                        setRecordForm((current) => ({
                          ...current,
                          vehicleVolume: Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label>
                    Região
                    <input
                      type="text"
                      value={recordForm.region}
                      onChange={(event) =>
                        setRecordForm((current) => ({ ...current, region: event.target.value }))
                      }
                      placeholder="REGIAO_PADRAO"
                    />
                  </label>
                  <label>
                    Tipo de evento
                    <input
                      type="text"
                      value={recordForm.eventType}
                      onChange={(event) =>
                        setRecordForm((current) => ({ ...current, eventType: event.target.value }))
                      }
                      placeholder="Obra, show, incidente"
                    />
                  </label>
                  <label>
                    Clima
                    <input
                      type="text"
                      value={recordForm.weather}
                      onChange={(event) =>
                        setRecordForm((current) => ({ ...current, weather: event.target.value }))
                      }
                      placeholder="Céu limpo, chuva, neblina"
                    />
                  </label>
                  <button type="submit" className="primary-button" disabled={busyAction === "record"}>
                    {busyAction === "record" ? "Salvando registro..." : "Salvar registro"}
                  </button>
                </form>
              </section>

              <section className="card form-card form-card--accent">
                <div className="section-heading">
                  <p>Motor de cenários</p>
                  <h2>Gerar tráfego simulado</h2>
                </div>
                <form className="stack-form" onSubmit={handleSimulationSubmit}>
                  <label>
                    Nome do cenário
                    <input
                      type="text"
                      value={simulationForm.scenarioName}
                      onChange={(event) =>
                        setSimulationForm((current) => ({ ...current, scenarioName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Registros a gerar
                    <input
                      type="number"
                      min="1"
                      max="250"
                      value={simulationForm.recordsToGenerate}
                      onChange={(event) =>
                        setSimulationForm((current) => ({
                          ...current,
                          recordsToGenerate: Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <div className="simulation-note">
                    <strong>Uso sugerido</strong>
                    <p>Popular demos rapidamente, validar estados dos gráficos ou testar exportações e insights.</p>
                  </div>
                  <button
                    type="submit"
                    className="ghost-button ghost-button--dark"
                    disabled={busyAction === "simulation"}
                  >
                    {busyAction === "simulation" ? "Gerando..." : "Executar simulação"}
                  </button>
                </form>
              </section>
            </section>

            <section className="card table-card reveal reveal-5">
              <div className="table-header">
                <div className="section-heading">
                  <p>Painel de tráfego</p>
                  <h2>Registros recebidos</h2>
                </div>
                <label className="search-field">
                  <span>Filtro</span>
                  <input
                    type="search"
                    value={tableQuery}
                    onChange={(event) => setTableQuery(event.target.value)}
                    placeholder="Buscar por região, tipo de via, clima"
                  />
                </label>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data e hora</th>
                      <th>Via</th>
                      <th>Volume</th>
                      <th>Região</th>
                      <th>Clima</th>
                      <th>Evento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="empty-row">
                          Nenhum registro corresponde ao filtro atual.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((record) => (
                        <tr key={record.id}>
                          <td>{formatDateTime(record.timestamp)}</td>
                          <td>{formatLabel(record.roadType)}</td>
                          <td>{record.vehicleVolume}</td>
                          <td>{record.region ?? "Não atribuída"}</td>
                          <td>{record.weather ?? "n/d"}</td>
                          <td>{record.eventType ?? "n/d"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
