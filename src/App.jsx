import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

const REFRESH_MS = 15_000;
const CURRENT_API_URL = import.meta.env.PROD
  ? "https://www.um.es/ws-siu/elecciones/elecciones_2026_2v.php"
  : "/api/elections-2v";
const HISTORICAL_API_URL = import.meta.env.PROD
  ? "https://www.um.es/ws-siu/elecciones/elecciones_2026_1v.php"
  : "/api/elections-1v";
const THEME_STORAGE_KEY = "recuento-theme";
const GROUP_ORDER = ["A", "B", "C", "D"];
const REPO_URL = "https://github.com/ivanmzcom/consultavotosumu";
const OFFICIAL_RESULTS_URL =
  "https://www.um.es/web/universidad/elecciones/2026/resultados-segunda-vuelta";
const OFFICIAL_CANDIDATE_ORDER = [
  { code: "C1", name: "Juan Samuel Baixauli Soler" },
  { code: "C2", name: "Alicia María Rubio Bañón" }
];
const CANDIDATE_PHOTOS = {
  "Juan Samuel Baixauli Soler": "https://www.um.es/documents/d/universidad/samuel_baixauli_png",
  "María Senena Corbalán García": "https://www.um.es/documents/d/universidad/senena_corbalan_png-1",
  "Francisco Guillermo Díaz Baños": "https://www.um.es/documents/d/universidad/guillermo_diaz_png",
  "Alfonsa García Ayala": "https://www.um.es/documents/d/universidad/alfonsa_garcia_png",
  "Alicia María Rubio Bañón": "https://www.um.es/documents/d/universidad/alicia_rubio_png"
};

function AppIcon({ children }) {
  return (
    <span className="nav-icon" aria-hidden="true">
      {children}
    </span>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="6" height="6" rx="1.2" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" />
      <rect x="14" y="14" width="6" height="6" rx="1.2" />
    </svg>
  );
}

function LiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
      <path d="M5 8.5a10 10 0 0 0 0 7" />
      <path d="M19 8.5a10 10 0 0 1 0 7" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="M8.3 10.9 15.7 6.6" />
      <path d="m8.3 13.1 7.4 4.3" />
    </svg>
  );
}

function ThemeIcon({ theme }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14.7 3.2a8.8 8.8 0 1 0 6.1 11.1 7.7 7.7 0 0 1-9.8-9.8 8.7 8.7 0 0 0 3.7-1.3Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2" />
      <path d="M12 19.3v2.2" />
      <path d="M21.5 12h-2.2" />
      <path d="M4.7 12H2.5" />
      <path d="m18.7 5.3-1.6 1.6" />
      <path d="m6.9 17.1-1.6 1.6" />
      <path d="m18.7 18.7-1.6-1.6" />
      <path d="m6.9 6.9-1.6-1.6" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

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
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(toNumber(value));
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(2).replace(".", ",")}%`;
}

function formatSignedPercent(value) {
  const numeric = toNumber(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(2).replace(".", ",")} pp`;
}

function normalizeCandidateResults(entries = []) {
  return entries
    .map((entry) => {
      const results = entry.ResultadosTotalesCandidato?.[0]?.ResultadosTotales ?? [];
      const name = entry.NombreCandidato ?? results[0]?.Candidato ?? "Sin nombre";

      return {
        code: `C${entries.indexOf(entry) + 1}`,
        name,
        value: toNumber(results[1]?.Valor),
        photo: CANDIDATE_PHOTOS[name] ?? ""
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

function resolveLatestValue(...values) {
  for (const value of values) {
    if (value !== "" && value != null) {
      return toNumber(value);
    }
  }

  return 0;
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
      votedLatest: resolveLatestValue(entry.VotantesFinal, entry.Votantes14h),
      pctLatest: resolveLatestValue(entry.ParticipacionPctFinal, entry.ParticipacionPct14h),
      countedAt: entry.Escrutada,
      validatedAt: entry.Validada,
      breakdown: Object.entries(entry.DesgloseGrupos ?? {}).map(([group, values]) => ({
        group,
        census: toNumber(values.Censo),
        voted14h: toNumber(values.Votantes14h),
        votedFinal: toNumber(values.VotantesFinal),
        pct14h: toNumber(values.ParticipacionPct14h),
        pctFinal: toNumber(values.ParticipacionPctFinal),
        votedLatest: resolveLatestValue(values.VotantesFinal, values.Votantes14h),
        pctLatest: resolveLatestValue(values.ParticipacionPctFinal, values.ParticipacionPct14h)
      }))
    }))
    .sort((left, right) => right.pctLatest - left.pctLatest);
}

function normalizePollingTables(entries = [], participationByFaculty = []) {
  const turnoutMap = new Map(participationByFaculty.map((item) => [item.name, item]));

  return entries.map((table) => {
    const rawResults = table.MesaElectoral?.ResultadosMesaElectoral ?? [];
    const groups = [...new Set(rawResults.map((result) => String(result.GrupoVotantesCandidato).split(".")[0]))];
    const totalVotes = rawResults.reduce((sum, result) => sum + toNumber(result.Valor), 0);
    const participation = turnoutMap.get(table.NombreMesaElectoralElectoral);

    return {
      name: table.NombreMesaElectoralElectoral,
      counted: table.escrutada === "si",
      groups,
      totalVotes,
      turnoutPct: participation?.pctLatest ?? 0,
      turnout14Pct: participation?.pct14h ?? 0,
      results: rawResults
        .map((result) => ({
          key: result.GrupoVotantesCandidato,
          rawValue: result.Valor,
          value: toNumber(result.Valor)
        }))
        .filter((result) => result.value > 0)
        .sort((left, right) => right.value - left.value)
    };
  });
}

function buildDetailedVotesTable(entries = [], candidateResults = []) {
  const candidateLookup = new Map(candidateResults.map((candidate) => [candidate.name, candidate]));
  const candidateColumns = OFFICIAL_CANDIDATE_ORDER.map((candidate) => ({
    code: candidate.code,
    name: candidate.name,
    photo: candidateLookup.get(candidate.name)?.photo ?? CANDIDATE_PHOTOS[candidate.name] ?? ""
  }));
  const extraColumns = [
    { code: "W", name: "Blancos", photo: "" },
    { code: "N", name: "Nulos", photo: "" }
  ];
  const columns = [...candidateColumns, ...extraColumns];

  const totals = Object.fromEntries(
    columns.map((column) => [column.code, Object.fromEntries(GROUP_ORDER.map((group) => [group, 0]))])
  );

  const rows = entries.map((entry) => {
    const cellMap = Object.fromEntries(
      columns.map((column) => [column.code, Object.fromEntries(GROUP_ORDER.map((group) => [group, ""]))])
    );

    for (const result of entry.MesaElectoral?.ResultadosMesaElectoral ?? []) {
      const [group, rawCode] = String(result.GrupoVotantesCandidato).split(".");
      const normalizedCode = group === "D" && rawCode?.startsWith("D") ? `C${rawCode.slice(1)}` : rawCode;

      if (!(normalizedCode in cellMap) || !GROUP_ORDER.includes(group)) {
        continue;
      }

      cellMap[normalizedCode][group] = result.Valor;
      if (result.Valor !== "" && result.Valor != null) {
        totals[normalizedCode][group] += toNumber(result.Valor);
      }
    }

    return {
      name: entry.NombreMesaElectoralElectoral,
      counted: entry.escrutada === "si",
      cells: cellMap
    };
  });

  return { columns, rows, totals };
}

function extractElection(payload) {
  const rootKey = Object.keys(payload ?? {}).find((key) => key.startsWith("EleccionesRector"));
  const election = rootKey ? payload?.[rootKey] : null;

  if (!election) {
    return null;
  }

  const candidateResults = normalizeCandidateResults(election.ResultadosTotalesCandidatoGrafica);
  const participationByFaculty = normalizeParticipation(election.ParticipacionFacultades ?? []);
  const turnoutLatest = resolveLatestValue(
    election.ParticipacionTotal?.[0]?.ParticipaciongrupoTotal,
    election.ParticipacionTotal18?.[0]?.ParticipaciongrupoTotal,
    election.ParticipacionTotal14?.[0]?.ParticipaciongrupoTotal
  );
  const turnoutLatestByGroup = {
    Total: turnoutLatest,
    PDI: resolveLatestValue(
      election.ParticipacionPDI?.[0]?.ParticipaciongrupoPDI,
      election.ParticipacionPDI18?.[0]?.ParticipaciongrupoPDI,
      election.ParticipacionPDI14?.[0]?.ParticipaciongrupoPDI
    ),
    A: resolveLatestValue(
      election.ParticipacionA?.[0]?.ParticipaciongrupoA,
      election.ParticipacionA18?.[0]?.ParticipaciongrupoA,
      election.ParticipacionA14?.[0]?.ParticipaciongrupoA
    ),
    B: resolveLatestValue(
      election.ParticipacionB?.[0]?.ParticipaciongrupoB,
      election.ParticipacionB18?.[0]?.ParticipaciongrupoB,
      election.ParticipacionB14?.[0]?.ParticipaciongrupoB
    ),
    C: resolveLatestValue(
      election.ParticipacionC?.[0]?.ParticipaciongrupoC,
      election.ParticipacionC18?.[0]?.ParticipaciongrupoC,
      election.ParticipacionC14?.[0]?.ParticipaciongrupoC
    ),
    D: resolveLatestValue(
      election.ParticipacionD?.[0]?.ParticipaciongrupoD,
      election.ParticipacionD18?.[0]?.ParticipaciongrupoD,
      election.ParticipacionD14?.[0]?.ParticipaciongrupoD
    )
  };

  return {
    year: rootKey.replace("EleccionesRector", ""),
    updatedAt: election.Actualizacion?.[0]?.UltimaActualizacion ?? "Sin dato",
    countedPct: toNumber(election.VotoEscrutado?.[0]?.PorcentajeTotalEscrutado),
    totalCensus: toNumber(election.VotoEscrutado?.[0]?.TotalCensados),
    totalVotes: toNumber(election.VotoEscrutado?.[0]?.TotalCensadosQueHanVotado),
    turnoutPct: turnoutLatest,
    turnout14Pct: toNumber(election.ParticipacionTotal14?.[0]?.ParticipaciongrupoTotal),
    turnoutByGroup: [
      {
        group: "Total",
        current: turnoutLatestByGroup.Total,
        at14h: toNumber(election.ParticipacionTotal14?.[0]?.ParticipaciongrupoTotal)
      },
      {
        group: "PDI",
        current: turnoutLatestByGroup.PDI,
        at14h: toNumber(election.ParticipacionPDI14?.[0]?.ParticipaciongrupoPDI)
      },
      {
        group: "A",
        current: turnoutLatestByGroup.A,
        at14h: toNumber(election.ParticipacionA14?.[0]?.ParticipaciongrupoA)
      },
      {
        group: "B",
        current: turnoutLatestByGroup.B,
        at14h: toNumber(election.ParticipacionB14?.[0]?.ParticipaciongrupoB)
      },
      {
        group: "C",
        current: turnoutLatestByGroup.C,
        at14h: toNumber(election.ParticipacionC14?.[0]?.ParticipaciongrupoC)
      },
      {
        group: "D",
        current: turnoutLatestByGroup.D,
        at14h: toNumber(election.ParticipacionD14?.[0]?.ParticipaciongrupoD)
      }
    ],
    lastCounted: (election.UltimasEscrutadas ?? []).filter((item) => item.NombreMesaElectoral),
    candidateResults,
    resultsByGroup: normalizeResultsByGroup(election.ResultadosTotalesCandidatoGraficaPorGrupo),
    participationByFaculty,
    pollingTables: normalizePollingTables(election.ListadoMesaElectorales, participationByFaculty),
    detailedVotesTable: buildDetailedVotesTable(election.ListadoMesaElectorales, candidateResults)
  };
}

function buildDataset(currentPayload, historicalPayload) {
  const current = extractElection(currentPayload);
  const historical = extractElection(historicalPayload);

  if (!current) {
    return null;
  }

  return { current, historical };
}

function getDelta(current, previous) {
  if (previous == null) {
    return null;
  }

  const delta = toNumber(current) - toNumber(previous);
  return Math.abs(delta) < 0.005 ? null : delta;
}

function getLatestCandidateDelta(name, current, previousData) {
  const previous = previousData?.current?.candidateResults?.find((candidate) => candidate.name === name);
  return getDelta(current, previous?.value);
}

function formatCellValue(value) {
  if (value === "" || value == null) {
    return "";
  }

  return formatInteger(value);
}

function formatRecentCountTime(value) {
  if (!value) {
    return "—";
  }

  const match = String(value).match(/(\d{1,2}:\d{2})(?::\d{2})?$/);
  if (match) {
    return match[1];
  }

  return String(value);
}

function DeltaBadge({ value }) {
  if (value == null) {
    return null;
  }

  return (
    <span className={`delta-badge ${value > 0 ? "delta-up" : "delta-down"}`}>
      {formatSignedPercent(value)}
    </span>
  );
}

function SummaryCard({ label, value, hint, delta }) {
  return (
    <article className="summary-card flash-target">
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
      <div className="summary-meta">
        <span className="summary-hint">{hint}</span>
        <DeltaBadge value={delta} />
      </div>
    </article>
  );
}

function ComparisonRow({ label, current, previous, currentLabel, previousLabel }) {
  return (
    <div className="compare-row flash-target">
      <div className="compare-head">
        <strong>{label}</strong>
        <DeltaBadge value={getDelta(current, previous)} />
      </div>
      <div className="compare-bars">
        <div className="compare-bar-group">
          <span>{currentLabel}</span>
          <div className="compare-meter">
            <div className="compare-meter-current" style={{ width: `${Math.max(0, Math.min(current, 100))}%` }} />
          </div>
          <strong>{formatPercent(current)}</strong>
        </div>
        <div className="compare-bar-group">
          <span>{previousLabel}</span>
          <div className="compare-meter">
            <div
              className="compare-meter-previous"
              style={{ width: `${Math.max(0, Math.min(previous, 100))}%` }}
            />
          </div>
          <strong>{formatPercent(previous)}</strong>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [previousData, setPreviousData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showCountedOnly, setShowCountedOnly] = useState(false);
  const [showWithVotesOnly, setShowWithVotesOnly] = useState(false);
  const [tableSort, setTableSort] = useState("alphabetical");
  const [viewMode, setViewMode] = useState("full");
  const [mobileCandidateTab, setMobileCandidateTab] = useState("C1");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [flash, setFlash] = useState(false);
  const previousRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 960px)");
    const handleViewportChange = (event) => {
      if (!event.matches) {
        setMobileNavOpen(false);
      }
    };

    handleViewportChange(mediaQuery);
    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    let active = true;
    let flashTimer;

    async function loadData() {
      try {
        setStatus((currentStatus) => (currentStatus === "ready" ? "refreshing" : "loading"));

        const [currentResponse, historicalResponse] = await Promise.all([
          fetch(CURRENT_API_URL, { cache: "no-store" }),
          fetch(HISTORICAL_API_URL, { cache: "no-store" })
        ]);

        if (!currentResponse.ok || !historicalResponse.ok) {
          throw new Error(`HTTP ${currentResponse.status}/${historicalResponse.status}`);
        }

        const [currentPayload, historicalPayload] = await Promise.all([
          currentResponse.json(),
          historicalResponse.json()
        ]);

        if (!active) {
          return;
        }

        const dataset = buildDataset(currentPayload, historicalPayload);

        startTransition(() => {
          setPreviousData(previousRef.current);
          setData(dataset);
          previousRef.current = dataset;
          setError("");
          setStatus("ready");
          setFlash(true);
        });

        window.clearTimeout(flashTimer);
        flashTimer = window.setTimeout(() => setFlash(false), 1000);
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
      window.clearTimeout(flashTimer);
    };
  }, []);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const current = data?.current;
  const historical = data?.historical;
  const currentLeader = current?.candidateResults?.[0]?.name ?? "";
  const previousLeader = previousData?.current?.candidateResults?.[0]?.name ?? "";

  useEffect(() => {
    if (!currentLeader) {
      return;
    }

    if (!hasLoadedOnceRef.current) {
      hasLoadedOnceRef.current = true;
      return;
    }

    if (!previousLeader || previousLeader === currentLeader) {
      return;
    }

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([90, 50, 90]);
    }
  }, [currentLeader, previousLeader]);

  const filteredTables = useMemo(() => {
    const tables = [...(current?.pollingTables ?? [])];

    const filtered = tables.filter((table) => {
      if (showCountedOnly && !table.counted) {
        return false;
      }

      if (showWithVotesOnly && table.totalVotes <= 0) {
        return false;
      }

      if (!deferredQuery) {
        return true;
      }

      return table.name.toLowerCase().includes(deferredQuery);
    });

    filtered.sort((left, right) => {
      if (tableSort === "votes") {
        return right.totalVotes - left.totalVotes;
      }

      if (tableSort === "turnout") {
        return right.turnoutPct - left.turnoutPct;
      }

      if (tableSort === "counted") {
        return Number(right.counted) - Number(left.counted) || left.name.localeCompare(right.name, "es");
      }

      return left.name.localeCompare(right.name, "es");
    });

    return filtered;
  }, [current?.pollingTables, deferredQuery, showCountedOnly, showWithVotesOnly, tableSort]);

  const filteredDetailedRows = useMemo(() => {
    const rows = current?.detailedVotesTable?.rows ?? [];
    return rows.filter((row) => {
      if (showCountedOnly && !row.counted) {
        return false;
      }

      if (!deferredQuery) {
        return true;
      }

      return row.name.toLowerCase().includes(deferredQuery);
    });
  }, [current?.detailedVotesTable?.rows, deferredQuery, showCountedOnly]);

  const topFaculties = useMemo(
    () => (current?.participationByFaculty ?? []).slice(0, 10),
    [current?.participationByFaculty]
  );

  const appClassName = `app-shell ${flash ? "is-flashing" : ""}`;

  async function handleShare() {
    const shareUrl = typeof window !== "undefined" ? window.location.href : REPO_URL;
    const payload = {
      title: "Resultados generales 2ª vuelta · Universidad de Murcia",
      text: "Web no oficial para consultar el recuento de la segunda vuelta de las elecciones UMU 2026.",
      url: shareUrl
    };

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(payload);
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      // No-op: cancelar compartir no debe romper la interfaz.
    }
  }

  return (
    <main className={appClassName}>
      <section className="hero flash-target">
        <nav className="top-nav" aria-label="Controles de la aplicación">
          <div className="top-nav-header">
            <div className="hero-panel nav-status">
              <span className={`status-dot status-${status}`} />
              <span>
                {status === "loading" && "Cargando datos"}
                {status === "refreshing" && "Actualizando"}
                {status === "ready" && `Última actualización: ${current?.updatedAt ?? "sin dato"}`}
                {status === "error" && "Error de actualización"}
              </span>
            </div>

            <button
              className={`nav-menu-button ${mobileNavOpen ? "nav-menu-open" : ""}`}
              type="button"
              aria-label={mobileNavOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileNavOpen}
              aria-controls="hero-controls"
              onClick={() => setMobileNavOpen((currentOpen) => !currentOpen)}
            >
              <AppIcon>
                <MenuIcon />
              </AppIcon>
            </button>
          </div>

          <div className={`hero-controls ${mobileNavOpen ? "hero-controls-open" : ""}`} id="hero-controls">
            <div className="segmented-control segmented-text" aria-label="Modo de vista">
              <button
                className={viewMode === "full" ? "segmented-active" : ""}
                type="button"
                onClick={() => {
                  setViewMode("full");
                  setMobileNavOpen(false);
                }}
                aria-label="Vista completa"
                title="Vista completa"
              >
                Completa
              </button>
              <button
                className={viewMode === "live" ? "segmented-active" : ""}
                type="button"
                onClick={() => {
                  setViewMode("live");
                  setMobileNavOpen(false);
                }}
                aria-label="Vista en directo"
                title="Vista en directo"
              >
                Directo
              </button>
            </div>

            <div className="hero-icon-actions">
              <button
                className="share-button icon-button"
                type="button"
                onClick={async () => {
                  await handleShare();
                  setMobileNavOpen(false);
                }}
                aria-label="Compartir"
                title="Compartir"
              >
                <AppIcon>
                  <ShareIcon />
                </AppIcon>
              </button>

              <button
                className="theme-toggle icon-button"
                type="button"
                onClick={() => {
                  setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
                  setMobileNavOpen(false);
                }}
                aria-label={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}
                title={`Tema ${theme === "dark" ? "oscuro" : "claro"}`}
              >
                <AppIcon>
                  <ThemeIcon theme={theme} />
                </AppIcon>
              </button>
            </div>
          </div>
        </nav>

        <div className="hero-copy">
          <p className="eyebrow">Elecciones a Rector/a y Claustro Universitario 2026</p>
          <h1>Resultados generales 2ª vuelta</h1>
        </div>
      </section>

      {error && <p className="error-banner">No se pudo cargar el recuento: {error}</p>}

      <section className="summary-grid">
        <SummaryCard
          label="Voto escrutado"
          value={current ? formatPercent(current.countedPct) : "—"}
          hint="Porcentaje total de voto contado"
          delta={getDelta(current?.countedPct, previousData?.current?.countedPct)}
        />
        <SummaryCard
          label="Participación"
          value={current ? formatPercent(current.turnoutPct) : "—"}
          hint="Participación global acumulada"
          delta={getDelta(current?.turnoutPct, previousData?.current?.turnoutPct)}
        />
        <SummaryCard
          label="Censo"
          value={current ? formatInteger(current.totalCensus) : "—"}
          hint="Total de personas censadas"
        />
        <SummaryCard
          label="Votos contabilizados"
          value={current ? formatInteger(current.totalVotes) : "—"}
          hint="Total de votos ya publicados"
        />
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>Resultado global</h2>
            <span>Distribución porcentual por candidatura</span>
          </div>

          <div className="ranking-list">
            {(current?.candidateResults ?? []).map((candidate) => (
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
                    <div className="candidate-copy">
                      <strong>{candidate.name}</strong>
                      <DeltaBadge
                        value={getLatestCandidateDelta(candidate.name, candidate.value, previousData)}
                      />
                    </div>
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
            {(current?.lastCounted ?? []).map((entry) => (
              <div className="recent-item" key={`${entry.NombreMesaElectoral}-${entry.HoraEscrutada}`}>
                <div className="recent-main">
                  <strong>{entry.NombreMesaElectoral}</strong>
                </div>
                <span className="recent-time">{formatRecentCountTime(entry.HoraEscrutada)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Participación 2ª vuelta vs 1ª vuelta</h2>
          <span>Comparativa a las 14:00 y a las 18:30</span>
        </div>

        <div className="compare-grid">
          <ComparisonRow
            label="Total · 14:00"
            current={current?.turnout14Pct ?? 0}
            previous={historical?.turnout14Pct ?? 0}
            currentLabel="2ª vuelta"
            previousLabel="1ª vuelta"
          />
          <ComparisonRow
            label="Total · 18:30"
            current={current?.turnoutPct ?? 0}
            previous={historical?.turnoutPct ?? 0}
            currentLabel="2ª vuelta"
            previousLabel="1ª vuelta"
          />
        </div>

        <div className="turnout-grid">
          {(current?.turnoutByGroup ?? []).map((group) => {
            const historicalGroup = historical?.turnoutByGroup?.find((item) => item.group === group.group);
            return (
              <div className="turnout-card flash-target" key={group.group}>
                <div className="turnout-card-head">
                  <h3>{group.group === "Total" ? "Total" : `Grupo ${group.group}`}</h3>
                  <DeltaBadge value={getDelta(group.current, historicalGroup?.current)} />
                </div>
                <div className="turnout-metric turnover-muted">
                  <span>2ª vuelta · 14:00</span>
                  <strong>{formatPercent(group.at14h)}</strong>
                </div>
                <div className="turnout-metric turnover-muted">
                  <span>1ª vuelta · 14:00</span>
                  <strong>{formatPercent(historicalGroup?.at14h)}</strong>
                </div>
                <div className="turnout-metric">
                  <span>2ª vuelta · 18:30</span>
                  <strong>{formatPercent(group.current)}</strong>
                </div>
                <div className="turnout-metric">
                  <span>1ª vuelta · 18:30</span>
                  <strong>{formatPercent(historicalGroup?.current)}</strong>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {viewMode === "full" && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Resultado por colectivo</h2>
              <span>Comparativa A, B, C y D</span>
            </div>

            <div className="group-grid">
              {(current?.resultsByGroup ?? []).map((group) => (
                <div className="group-block flash-target" key={group.group}>
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

              <div className="toolbar toolbar-wrap">
                <input
                  className="search-input"
                  type="search"
                  placeholder="Buscar por facultad o mesa"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select
                  className="select-input"
                  value={tableSort}
                  onChange={(event) => setTableSort(event.target.value)}
                >
                  <option value="alphabetical">Orden alfabético</option>
                  <option value="votes">Más votos</option>
                  <option value="turnout">Más participación</option>
                  <option value="counted">Escrutadas primero</option>
                </select>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showCountedOnly}
                    onChange={(event) => setShowCountedOnly(event.target.checked)}
                  />
                  <span>Solo escrutadas</span>
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={showWithVotesOnly}
                    onChange={(event) => setShowWithVotesOnly(event.target.checked)}
                  />
                  <span>Solo con votos</span>
                </label>
              </div>

              <div className="table-list">
                {filteredTables.map((table) => (
                  <div className="table-item flash-target" key={table.name}>
                    <div className="table-item-head">
                      <div>
                        <strong>{table.name}</strong>
                        <span>{table.groups.join(" · ")}</span>
                      </div>
                      <div className={table.counted ? "badge-counted" : "badge-pending"}>
                        {table.counted ? "Escrutada" : "Pendiente"}
                      </div>
                    </div>

                    <div className="table-item-meta table-item-meta-grid">
                      <span>{formatInteger(table.totalVotes)} votos registrados</span>
                      <span>Participación disponible: {formatPercent(table.turnoutPct)}</span>
                    </div>

                    {table.results.length > 0 ? (
                      <div className="chips">
                        {table.results.slice(0, 8).map((result) => (
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
                  <div className="participation-item flash-target" key={faculty.name}>
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

          <section className="panel">
            <div className="panel-heading">
              <h2>Desglose completo por mesa y grupo</h2>
              <span>Tabla integral de candidaturas, blancos y nulos</span>
            </div>

            <div className="wide-table-shell desktop-only">
              <table className="votes-table">
                <thead>
                  <tr>
                    <th rowSpan="2" className="sticky-col sticky-head">
                      Mesa
                    </th>
                    {(current?.detailedVotesTable?.columns ?? []).map((column) => (
                      <th
                        key={column.code}
                        colSpan={4}
                        className="candidate-col-head"
                        title={column.name}
                      >
                        {column.photo ? <img src={column.photo} alt={column.name} className="table-photo" /> : null}
                        <span>{column.name}</span>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {(current?.detailedVotesTable?.columns ?? []).flatMap((column) =>
                      GROUP_ORDER.map((group) => (
                        <th key={`${column.code}-${group}`} className="group-col-head">
                          {group}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredDetailedRows.map((row) => (
                    <tr key={row.name}>
                      <th className="sticky-col">
                        <div className="table-row-head">
                          <span>{row.name}</span>
                          <small>{row.counted ? "Escrutada" : "Pendiente"}</small>
                        </div>
                      </th>
                      {(current?.detailedVotesTable?.columns ?? []).flatMap((column) =>
                        GROUP_ORDER.map((group) => (
                          <td key={`${row.name}-${column.code}-${group}`}>
                            {formatCellValue(row.cells[column.code][group])}
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                  {current?.detailedVotesTable ? (
                    <tr className="totals-row">
                      <th className="sticky-col">Totales</th>
                      {current.detailedVotesTable.columns.flatMap((column) =>
                        GROUP_ORDER.map((group) => (
                          <td key={`total-${column.code}-${group}`}>
                            {formatInteger(current.detailedVotesTable.totals[column.code][group])}
                          </td>
                        ))
                      )}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mobile-breakdown mobile-only">
              <div className="mobile-tabbar">
                {(current?.detailedVotesTable?.columns ?? []).map((column) => (
                  <button
                    key={column.code}
                    type="button"
                    className={mobileCandidateTab === column.code ? "mobile-tab mobile-tab-active" : "mobile-tab"}
                    onClick={() => setMobileCandidateTab(column.code)}
                  >
                    {column.name}
                  </button>
                ))}
              </div>

              {(current?.detailedVotesTable?.columns ?? [])
                .filter((column) => column.code === mobileCandidateTab)
                .map((column) => (
                  <article className="mobile-breakdown-card flash-target" key={`mobile-tab-${column.code}`}>
                    <div className="mobile-breakdown-head">
                      <div className="mobile-candidate-head">
                        {column.photo ? (
                          <img src={column.photo} alt={column.name} className="mobile-candidate-photo" />
                        ) : null}
                        <div>
                          <strong>{column.name}</strong>
                          <small>Votos por mesa y grupo</small>
                        </div>
                      </div>
                    </div>

                    <div className="mobile-mesa-list">
                      {filteredDetailedRows.map((row) => (
                        <section className="mobile-mesa-item" key={`${column.code}-${row.name}`}>
                          <div className="mobile-mesa-head">
                            <strong>{row.name}</strong>
                            <small>{row.counted ? "Escrutada" : "Pendiente"}</small>
                          </div>
                          <div className="mobile-group-values">
                            {GROUP_ORDER.map((group) => (
                              <div className="mobile-group-row" key={`${column.code}-${row.name}-${group}`}>
                                <span>{group}</span>
                                <strong>{formatCellValue(row.cells[column.code][group]) || "—"}</strong>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>

                    <section className="mobile-mesa-item totals-card">
                      <div className="mobile-mesa-head">
                        <strong>Totales</strong>
                        <small>Acumulado por grupo</small>
                      </div>
                      <div className="mobile-group-values">
                        {GROUP_ORDER.map((group) => (
                          <div className="mobile-group-row" key={`totals-${column.code}-${group}`}>
                            <span>{group}</span>
                            <strong>{formatInteger(current?.detailedVotesTable?.totals[column.code][group])}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  </article>
                ))}
            </div>
          </section>
        </>
      )}

      <footer className="site-footer flash-target">
        <div className="site-footer-copy">
          <strong>Consultavotos UMU</strong>
          <p>
            Web no oficial creada por Iván Moreno. Consulta los mismos datos públicos que la web
            oficial de resultados de la Universidad de Murcia.
          </p>
        </div>

        <div className="site-footer-links">
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Repositorio en GitHub
          </a>
          <a href={OFFICIAL_RESULTS_URL} target="_blank" rel="noreferrer">
            Web oficial de resultados
          </a>
          <span>© Iván Moreno</span>
        </div>
      </footer>
    </main>
  );
}

export default App;
