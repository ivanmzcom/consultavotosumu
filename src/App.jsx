import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

const REFRESH_MS = 15_000;
const API_URL = import.meta.env.PROD
  ? "https://www.um.es/ws-siu/elecciones/elecciones_2026_1v.php"
  : "/api/elections";
const THEME_STORAGE_KEY = "recuento-theme";
const CANDIDATE_PHOTOS = {
  "Juan Samuel Baixauli Soler": "https://www.um.es/documents/d/universidad/samuel_baixauli_png",
  "María Senena Corbalán García": "https://www.um.es/documents/d/universidad/senena_corbalan_png-1",
  "Francisco Guillermo Díaz Baños": "https://www.um.es/documents/d/universidad/guillermo_diaz_png",
  "Alfonsa García Ayala": "https://www.um.es/documents/d/universidad/alfonsa_garcia_png",
  "Alicia María Rubio Bañón": "https://www.um.es/documents/d/universidad/alicia_rubio_png"
};

function getInitialTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toNumber(value) {
  if (value === "" || value == null) {
    return 0;
  }

  const normalized = String(value).replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(
    toNumber(value)
  );
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(2).replace(".", ",")}%`;
}

function normalizeCandidateResults(entries = []) {
  return entries
    .map((entry) => {
      const results = entry.ResultadosTotalesCandidato?.[0]?.ResultadosTotales ?? [];
      return {
        name: entry.NombreCandidato ?? results[0]?.Candidato ?? "Sin nombre",
        value: toNumber(results[1]?.Valor),
        photo: CANDIDATE_PHOTOS[entry.NombreCandidato ?? results[0]?.Candidato] ?? ""
      };
    })
    .sort((left, right) => right.value - left.value);
}

function normalizeResultsByGroup(entries = []) {
  return entries.map((group) => ({
    group: group.NombreGrupo,
    results: (group.ResultadosTotalesPorGrupo ?? [])
      .map((result) => {
        const item = result.ResultadosTotales?.[0] ?? {};
        return {
          name: item.Candidato ?? "Sin nombre",
          value: toNumber(item.Valor)
        };
      })
      .sort((left, right) => right.value - left.value)
  }));
}

function normalizePollingTables(entries = []) {
  return entries.map((table) => {
    const rawResults = table.MesaElectoral?.ResultadosMesaElectoral ?? [];
    const groups = [...new Set(rawResults.map((result) => String(result.GrupoVotantesCandidato).split(".")[0]))];
    const totalVotes = rawResults.reduce((sum, result) => sum + toNumber(result.Valor), 0);

    return {
      name: table.NombreMesaElectoralElectoral,
      counted: table.escrutada === "si",
      groups,
      totalVotes,
      results: rawResults
        .map((result) => ({
          key: result.GrupoVotantesCandidato,
          value: toNumber(result.Valor)
        }))
        .filter((result) => result.value > 0)
        .sort((left, right) => right.value - left.value)
    };
  });
}

function normalizeParticipation(entries = []) {
  return entries
    .map((entry) => ({
      name: entry.NombreMesa,
      groups: entry.Grupos,
      census: toNumber(entry.Censo),
      voted14h: toNumber(entry.Votantes14h),
      votedFinal: toNumber(entry.VotantesFinal),
      pct14h: toNumber(entry.ParticipacionPct14h),
      pctFinal: toNumber(entry.ParticipacionPctFinal),
      countedAt: entry.Escrutada,
      validatedAt: entry.Validada,
      breakdown: Object.entries(entry.DesgloseGrupos ?? {}).map(([group, values]) => ({
        group,
        census: toNumber(values.Censo),
        voted14h: toNumber(values.Votantes14h),
        votedFinal: toNumber(values.VotantesFinal),
        pct14h: toNumber(values.ParticipacionPct14h),
        pctFinal: toNumber(values.ParticipacionPctFinal)
      }))
    }))
    .sort((left, right) => right.pctFinal - left.pctFinal);
}

function extractSummary(payload) {
  const election = payload?.EleccionesRector2026;

  if (!election) {
    return null;
  }

  const turnout = election.VotoEscrutado?.[0] ?? {};
  const liveTotals = election.ParticipacionTotal?.[0] ?? {};

  return {
    updatedAt: election.Actualizacion?.[0]?.UltimaActualizacion ?? "Sin dato",
    countedPct: toNumber(turnout.PorcentajeTotalEscrutado),
    totalCensus: toNumber(turnout.TotalCensados),
    totalVotes: toNumber(turnout.TotalCensadosQueHanVotado),
    turnoutPct: toNumber(liveTotals.ParticipaciongrupoTotal),
    lastCounted: (election.UltimasEscrutadas ?? []).filter((item) => item.NombreMesaElectoral),
    candidateResults: normalizeCandidateResults(election.ResultadosTotalesCandidatoGrafica),
    resultsByGroup: normalizeResultsByGroup(election.ResultadosTotalesCandidatoGraficaPorGrupo),
    pollingTables: normalizePollingTables(election.ListadoMesaElectorales),
    participationByFaculty: normalizeParticipation(election.ParticipacionFacultades)
  };
}

function SummaryCard({ label, value, hint }) {
  return (
    <article className="summary-card">
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
      <span className="summary-hint">{hint}</span>
    </article>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showCountedOnly, setShowCountedOnly] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setStatus((current) => (current === "ready" ? "refreshing" : "loading"));
        const response = await fetch(API_URL, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!active) {
          return;
        }

        startTransition(() => {
          setData(extractSummary(payload));
          setError("");
          setStatus("ready");
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Error desconocido");
        setStatus("error");
      }
    }

    loadData();
    const timer = window.setInterval(loadData, REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filteredTables = useMemo(() => {
    const tables = data?.pollingTables ?? [];

    return tables.filter((table) => {
      if (showCountedOnly && !table.counted) {
        return false;
      }

      if (!deferredQuery) {
        return true;
      }

      return table.name.toLowerCase().includes(deferredQuery);
    });
  }, [data?.pollingTables, deferredQuery, showCountedOnly]);

  const topFaculties = useMemo(
    () => (data?.participationByFaculty ?? []).slice(0, 10),
    [data?.participationByFaculty]
  );

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Universidad de Murcia · Elecciones 2026 · 1ª vuelta</p>
          <h1>Recuento en directo con lectura operativa del escrutinio.</h1>
          <p className="hero-text">
            Consulta el porcentaje escrutado, la participación, los resultados por candidatura
            y el detalle por mesa en una sola vista.
          </p>
        </div>

        <div className="hero-side">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}
          >
            <span className="theme-toggle-label">Tema</span>
            <strong>{theme === "dark" ? "Oscuro" : "Claro"}</strong>
          </button>

          <div className="hero-panel">
            <span className={`status-dot status-${status}`} />
            <span>
              {status === "loading" && "Cargando datos"}
              {status === "refreshing" && "Actualizando"}
              {status === "ready" && `Última actualización: ${data?.updatedAt ?? "sin dato"}`}
              {status === "error" && "Error de actualización"}
            </span>
          </div>
        </div>
      </section>

      {error && <p className="error-banner">No se pudo cargar el recuento: {error}</p>}

      <section className="summary-grid">
        <SummaryCard
          label="Escrutado"
          value={data ? formatPercent(data.countedPct) : "—"}
          hint="Porcentaje total de voto ya contado"
        />
        <SummaryCard
          label="Participación"
          value={data ? formatPercent(data.turnoutPct) : "—"}
          hint="Participación global acumulada"
        />
        <SummaryCard
          label="Censo"
          value={data ? formatInteger(data.totalCensus) : "—"}
          hint="Total de personas censadas"
        />
        <SummaryCard
          label="Votos contabilizados"
          value={data ? formatInteger(data.totalVotes) : "—"}
          hint="Votos recogidos en el escrutinio actual"
        />
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>Resultado global</h2>
            <span>Distribución porcentual por candidatura</span>
          </div>

          <div className="ranking-list">
            {(data?.candidateResults ?? []).map((candidate) => (
              <div className="ranking-row" key={candidate.name}>
                <div className="ranking-main">
                  <div className="candidate-head">
                    {candidate.photo ? (
                      <img
                        className="candidate-photo"
                        src={candidate.photo}
                        alt={candidate.name}
                        loading="lazy"
                      />
                    ) : null}
                    <strong>{candidate.name}</strong>
                  </div>
                </div>
                <div className="ranking-meter">
                  <div style={{ width: `${candidate.value}%` }} />
                </div>
                <span className="ranking-value">{formatPercent(candidate.value)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>Últimas mesas escrutadas</h2>
            <span>Actividad de recuento más reciente</span>
          </div>

          <div className="recent-list">
            {(data?.lastCounted ?? []).map((entry) => (
              <div className="recent-item" key={`${entry.NombreMesaElectoral}-${entry.HoraEscrutada}`}>
                <div>
                  <strong>{entry.NombreMesaElectoral}</strong>
                </div>
                <span className="recent-time">{entry.HoraEscrutada}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Resultado por colectivo</h2>
          <span>Comparativa A, B, C y D</span>
        </div>

        <div className="group-grid">
          {(data?.resultsByGroup ?? []).map((group) => (
            <div className="group-block" key={group.group}>
              <h3>Grupo {group.group}</h3>
              {group.results.map((candidate) => (
                <div className="group-row" key={`${group.group}-${candidate.name}`}>
                  <span>{candidate.name}</span>
                  <strong>{formatPercent(candidate.value)}</strong>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="content-grid content-grid-large">
        <article className="panel">
          <div className="panel-heading">
            <h2>Mesas electorales</h2>
            <span>{filteredTables.length} mesas visibles</span>
          </div>

          <div className="toolbar">
            <input
              className="search-input"
              type="search"
              placeholder="Buscar por facultad o mesa"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={showCountedOnly}
                onChange={(event) => setShowCountedOnly(event.target.checked)}
              />
              <span>Solo escrutadas</span>
            </label>
          </div>

          <div className="table-list">
            {filteredTables.map((table) => (
              <div className="table-item" key={table.name}>
                <div className="table-item-head">
                  <div>
                    <strong>{table.name}</strong>
                    <span>{table.groups.join(" · ")}</span>
                  </div>
                  <div className={table.counted ? "badge-counted" : "badge-pending"}>
                    {table.counted ? "Escrutada" : "Pendiente"}
                  </div>
                </div>

                <div className="table-item-meta">
                  <span>{formatInteger(table.totalVotes)} votos registrados</span>
                </div>

                {table.results.length > 0 ? (
                  <div className="chips">
                    {table.results.slice(0, 6).map((result) => (
                      <span className="chip" key={`${table.name}-${result.key}`}>
                        {result.key}: {formatInteger(result.value)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="empty-text">Sin votos publicados todavía.</p>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>Participación destacada</h2>
            <span>Top 10 mesas por participación final</span>
          </div>

          <div className="participation-list">
            {topFaculties.map((faculty) => (
              <div className="participation-item" key={faculty.name}>
                <div className="participation-main">
                  <strong>{faculty.name}</strong>
                  <span>{faculty.groups}</span>
                </div>
                <div className="participation-stats">
                  <span>{formatPercent(faculty.pctFinal)}</span>
                  <small>
                    {formatInteger(faculty.votedFinal)} / {formatInteger(faculty.census)}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
