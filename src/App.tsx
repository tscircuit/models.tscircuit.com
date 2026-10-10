import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Box,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Github,
  Grid2X2,
  Layers3,
  Menu,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { ExamplePreview } from "./components/ExamplePreview"
import { ModelPreview } from "./components/ModelPreview"
import { ModelDownload } from "./components/ModelDownload"
import { ParameterField } from "./components/ParameterField"
import {
  catalog,
  configure,
  initialState,
  prepareValues,
  searchCatalog,
  shareUrl,
  updateValues,
} from "./lib/catalog"
import { modelExamples, searchExamples } from "./lib/examples"
import { modelInputFromSpec } from "./lib/model-configuration"
import { footprintInputFromSpec } from "./lib/footprint-configuration"
import type {
  CatalogEntry,
  Library,
  ParameterDefinition,
  PreviewRequest,
  PreviewResult,
} from "./lib/catalog-types"

function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return error.issues
      .slice(0, 3)
      .map(
        (issue: { path?: string[]; message?: string }) =>
          `${issue.path?.join(".") || "Parameters"}: ${issue.message}`,
      )
      .join(" · ")
  }
  return error instanceof Error
    ? error.message
    : "Unable to configure this model"
}

function groupParameters(parameters: ParameterDefinition[]) {
  const groups = new Map<string, ParameterDefinition[]>()
  for (const parameter of parameters) {
    const group = parameter.group ?? "Parameters"
    groups.set(group, [...(groups.get(group) ?? []), parameter])
  }
  return Array.from(groups)
}

function inputFromSpec(spec: string, preferred: Library = "modelprinter") {
  const libraries: Library[] = [
    preferred,
    preferred === "modelprinter" ? "footprinter" : "modelprinter",
  ]
  let problem: unknown
  for (const library of libraries) {
    try {
      const definition =
        library === "modelprinter"
          ? modelInputFromSpec(spec)
          : footprintInputFromSpec(spec)
      const entry = catalog.find(
        (item) => item.library === library && item.fn === definition.fn,
      )
      if (!entry) throw new Error("Choose a supported function")
      return { entry, values: definition.values, spec }
    } catch (error) {
      problem ??= error
    }
  }
  throw problem
}

function seedState() {
  const query = new URLSearchParams(window.location.search)
  if (window.location.pathname !== "/" && !query.has("model")) {
    try {
      return inputFromSpec(decodeURIComponent(window.location.pathname.slice(1)))
    } catch {
      /* An invalid path falls back to the default configuration. */
    }
  }
  if (query.has("spec") && !query.has("model")) {
    try {
      return inputFromSpec(query.get("spec")!)
    } catch {
      /* An invalid link falls back to the default configuration. */
    }
  }
  return initialState()
}

const libraryOptions = [
  ["all", "All"],
  ["modelprinter", "Models"],
  ["footprinter", "Footprints"],
] as const

export function App() {
  const seed = useMemo(seedState, [])
  const [entry, setEntry] = useState(seed.entry)
  const [values, setValues] = useState<Record<string, unknown>>(seed.values)
  const [baseSpec, setBaseSpec] = useState(seed.spec ?? seed.entry.initialSpec)
  const [workspaceOpen, setWorkspaceOpen] = useState(() => {
    const query = new URLSearchParams(window.location.search)
    return window.location.pathname !== "/" || query.has("model") || query.has("spec")
  })
  const [search, setSearch] = useState("")
  const [library, setLibrary] = useState<"all" | Library>("all")
  const [visibleExamples, setVisibleExamples] = useState(24)
  const [view, setView] = useState<"3d" | "2d">(
    seed.entry.library === "modelprinter" ? "3d" : "2d",
  )
  const [showGrid, setShowGrid] = useState(true)
  const [request, setRequest] = useState<PreviewRequest | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [codeTab, setCodeTab] = useState<"code" | "json" | null>(null)
  const [editedSpec, setEditedSpec] = useState<string | null>(null)
  const [editError, setEditError] = useState("")
  const [copied, setCopied] = useState("")
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [parametersOpen, setParametersOpen] = useState(false)
  const id = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  const homeSearch = useRef<{ search: string; library: "all" | Library }>({
    search: "",
    library: "all",
  })

  const configured = useMemo(() => {
    try {
      return {
        result: configure(
          { ...entry, initialSpec: baseSpec },
          prepareValues(entry, values),
        ),
        error: "",
      }
    } catch (error) {
      return { result: null, error: errorMessage(error) }
    }
  }, [entry, values, baseSpec])

  useEffect(() => {
    if (!workspaceOpen) return
    // Save explicit inputs, including JSON-only settings, without freezing defaults.
    const url = shareUrl(entry, values, baseSpec)
    if (url !== window.location.href)
      window.history.replaceState(window.history.state, "", url)
  }, [entry, values, baseSpec, workspaceOpen])

  useEffect(() => {
    if (!workspaceOpen || !configured.result) return
    const timer = window.setTimeout(() => {
      setRequest({
        id: ++id.current,
        library: entry.library,
        fn: entry.fn,
        spec: configured.result!.spec,
        values: configured.result!.values,
      })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [configured, entry, workspaceOpen])

  useEffect(() => {
    setVisibleExamples(24)
  }, [search, library])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        if (workspaceOpen) setCatalogOpen(true)
        window.requestAnimationFrame(() => searchRef.current?.focus())
      }
      if (event.key === "Escape") {
        setCatalogOpen(false)
        setParametersOpen(false)
      }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [workspaceOpen])

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const receivePreview = useCallback(
    (result: PreviewResult) => setPreview(result),
    [],
  )
  const filtered = useMemo(
    () => searchCatalog(search, library),
    [search, library],
  )
  const examples = useMemo(() => {
    const matching = searchExamples(search, library)
    if (search.trim()) return matching
    const functions = new Set<string>()
    const representatives: typeof modelExamples = []
    const remaining: typeof modelExamples = []
    for (const example of matching) {
      const key = `${example.library}:${example.fn}`
      if (functions.has(key)) remaining.push(example)
      else {
        functions.add(key)
        representatives.push(example)
      }
    }
    return [...representatives, ...remaining]
  }, [search, library])
  const grouped = groupParameters(entry.parameters)
  const resolved =
    configured.result?.resolvedValues ?? configured.result?.values ?? {}
  const modelSpec = configured.result?.spec ?? baseSpec
  const displayCode =
    codeTab === "json"
      ? JSON.stringify(
          {
            fn: entry.fn,
            ...(configured.result?.resolvedValues ??
              configured.result?.values ??
              values),
          },
          null,
          2,
        )
      : (configured.result?.code ?? "")
  const dimensions = preview?.bounds
    ? preview.bounds.max.map((value, axis) =>
        Math.abs(value - preview.bounds!.min[axis]),
      )
    : null
  const error =
    configured.error ||
    editError ||
    (preview?.id === request?.id ? preview?.error : "")

  const selectConfiguration = (next: {
    entry: CatalogEntry
    values: Record<string, unknown>
    spec: string
  }) => {
    if (!workspaceOpen) {
      homeSearch.current = { search, library }
      setSearch("")
      setLibrary("all")
    }
    setEntry(next.entry)
    setValues(next.values)
    setBaseSpec(next.spec)
    setEditedSpec(null)
    setEditError("")
    setPreview(null)
    setRequest(null)
    setBusy(false)
    setView(next.entry.library === "modelprinter" ? "3d" : "2d")
    setCodeTab(null)
    setCatalogOpen(false)
    setParametersOpen(false)
    setWorkspaceOpen(true)
  }
  const choose = (next: CatalogEntry) =>
    selectConfiguration({
      entry: next,
      values: { ...next.initialValues },
      spec: next.initialSpec,
    })
  const chooseExample = (example: (typeof modelExamples)[number]) => {
    try {
      selectConfiguration(inputFromSpec(example.spec, example.library))
    } catch (problem) {
      setEditError(errorMessage(problem))
    }
  }
  const backToSearch = () => {
    setWorkspaceOpen(false)
    setCatalogOpen(false)
    setParametersOpen(false)
    setSearch(homeSearch.current.search)
    setLibrary(homeSearch.current.library)
    setEditError("")
    const url = new URL(window.location.href)
    url.search = ""
    url.pathname = "/"
    window.history.replaceState(null, "", url)
    window.requestAnimationFrame(() => searchRef.current?.focus())
  }
  const change = (key: string, value: unknown) => {
    setValues((previous) => updateValues(entry, previous, key, value))
    setEditError("")
  }
  const copy = async (value: string, kind: string) => {
    try {
      await navigator.clipboard.writeText(value)
      window.clearTimeout(copyTimer.current)
      setCopied(kind)
      copyTimer.current = window.setTimeout(() => setCopied(""), 1800)
    } catch {
      setEditError(
        "Clipboard is unavailable. Select the model string to copy it.",
      )
    }
  }
  const applySpec = () => {
    const spec = editedSpec?.trim()
    if (!spec) return
    try {
      const next = inputFromSpec(spec, entry.library)
      setEntry(next.entry)
      setValues(next.values)
      setBaseSpec(next.spec)
      setView(next.entry.library === "modelprinter" ? "3d" : "2d")
      setEditedSpec(null)
      setEditError("")
    } catch (problem) {
      setEditError(errorMessage(problem))
    }
  }
  const resetDefaults = () => {
    setValues({ ...entry.initialValues })
    setBaseSpec(entry.initialSpec)
    setEditedSpec(null)
    setEditError("")
  }

  const filters = (
    <div className="library-filters" aria-label="Filter library">
      {libraryOptions.map(([value, label]) => (
        <button
          key={value}
          className={library === value ? "is-active" : ""}
          onClick={() => setLibrary(value)}
          aria-pressed={library === value}
        >
          {label}
        </button>
      ))}
    </div>
  )
  const searchInput = (
    <label className="search-box">
      <Search size={18} />
      <input
        ref={searchRef}
        aria-label="Search functions"
        placeholder={
          workspaceOpen ? "Search functions…" : "Search models and footprints…"
        }
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoComplete="off"
      />
      <kbd>⌘ K</kbd>
      {search && (
        <button
          className="search-clear"
          aria-label="Clear search"
          onClick={() => setSearch("")}
        >
          <X size={15} />
        </button>
      )}
    </label>
  )

  return (
    <div
      className={`app-shell ${workspaceOpen ? "workspace-open" : ""} ${catalogOpen ? "catalog-open" : ""} ${parametersOpen ? "parameters-open" : ""}`}
    >
      <header className="app-header">
        <a
          className="brand"
          href="https://tscircuit.com"
          target="_blank"
          rel="noreferrer"
        >
          <img className="brand-mark" src="/logo.svg" alt="tscircuit" />
          <span className="brand-title">tscircuit</span>
        </a>
        <span className="brand-divider">/</span>
        <span className="header-title">Models</span>
        <a
          className="icon-button header-source"
          href="https://github.com/tscircuit/models.tscircuit.com"
          target="_blank"
          rel="noreferrer"
          title="View source"
          aria-label="View source"
        >
          <Github size={18} />
        </a>
      </header>

      {!workspaceOpen ? (
        <main className="examples-page">
          <h1>Models</h1>
          <div className="examples-search">
            {searchInput}
            {filters}
          </div>
          {editError && (
            <div className="search-error" role="alert">
              {editError}
            </div>
          )}
          <div className="example-grid">
            {examples.slice(0, visibleExamples).map((example) => (
              <button
                className="example-card"
                key={example.id}
                data-testid={`example-${example.id}`}
                aria-label={`Configure ${example.spec}`}
                onClick={() => chooseExample(example)}
              >
                <div className="example-preview">
                  <ExamplePreview example={example} />
                </div>
                <div className="example-caption">
                  <code>{example.spec}</code>
                  <span className="example-library">{example.library}</span>
                </div>
              </button>
            ))}
          </div>
          {examples.length === 0 && (
            <div className="catalog-empty">
              <Search size={22} />
              <strong>No functions found</strong>
              <button
                className="secondary-button"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            </div>
          )}
          {examples.length > visibleExamples && (
            <div className="load-more">
              <button
                className="secondary-button"
                onClick={() => setVisibleExamples((count) => count + 24)}
              >
                Load more
              </button>
            </div>
          )}
        </main>
      ) : (
        <>
          <h1 className="sr-only">{entry.name}</h1>
          <div className="workspace-topbar">
            <button
              className="back-button"
              onClick={backToSearch}
              aria-label="Back to search"
              title="Back to search"
            >
              <ArrowLeft size={17} />
              <span>Search</span>
            </button>
            <form
              className="spec-editor"
              onSubmit={(event) => {
                event.preventDefault()
                applySpec()
              }}
            >
              <input
                aria-label="Model string"
                value={editedSpec ?? modelSpec}
                onChange={(event) => setEditedSpec(event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="apply-button"
                disabled={!editedSpec?.trim()}
                type="submit"
              >
                Apply
              </button>
            </form>
            <button
              className="icon-button"
              aria-label="Copy model string"
              title="Copy model string"
              onClick={() => copy(modelSpec, "spec")}
            >
              {copied === "spec" ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button
              className="secondary-button share-button"
              onClick={() => copy(shareUrl(entry, values, baseSpec), "share")}
            >
              <Share2 size={14} />
              <span>{copied === "share" ? "Copied" : "Share"}</span>
            </button>
            <ModelDownload
              name={modelSpec}
              request={request}
              preview={
                !error && !busy && editedSpec === null &&
                configured.result && request?.values === configured.result.values &&
                preview?.id === request?.id && preview?.meshes.length
                  ? preview
                  : null
              }
            />
          </div>
          {(catalogOpen || parametersOpen) && (
            <button
              className="drawer-backdrop"
              aria-label="Close panel"
              onClick={() => {
                setCatalogOpen(false)
                setParametersOpen(false)
              }}
            />
          )}
          <main className="workspace">
            <aside className="catalog-panel" aria-label="Model catalog">
              <div className="panel-heading">
                <span>Functions</span>
                <button
                  className="icon-button mobile-close"
                  aria-label="Close catalog"
                  onClick={() => setCatalogOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              {searchInput}
              {filters}
              <div className="catalog-list">
                {filtered.map((item) => (
                  <button
                    className={`catalog-item ${entry.id === item.id ? "is-selected" : ""}`}
                    key={item.id}
                    onClick={() => choose(item)}
                    aria-pressed={entry.id === item.id}
                    data-testid={`catalog-${item.fn}`}
                    title={item.description}
                  >
                    <span className="catalog-item-icon">
                      {item.library === "modelprinter" ? (
                        <Box size={15} />
                      ) : (
                        <Cpu size={15} />
                      )}
                    </span>
                    <span className="catalog-item-name">{item.fn}</span>
                    <ChevronRight className="catalog-item-arrow" size={13} />
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="catalog-empty">
                    <strong>No functions found</strong>
                    <button
                      className="secondary-button"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </div>
            </aside>

            <section className="model-panel" aria-label="Model workspace">
              <div className="preview-toolbar">
                <button
                  className="icon-button mobile-catalog-toggle"
                  aria-label="Open catalog"
                  onClick={() => setCatalogOpen(true)}
                >
                  <Menu size={17} />
                </button>
                <div className="view-tabs" aria-label="Preview view">
                  <button
                    className={view === "3d" ? "is-active" : ""}
                    onClick={() => setView("3d")}
                    aria-pressed={view === "3d"}
                  >
                    <Box size={14} />
                    3D model
                  </button>
                  {entry.library === "footprinter" && (
                    <button
                      className={view === "2d" ? "is-active" : ""}
                      onClick={() => setView("2d")}
                      aria-pressed={view === "2d"}
                    >
                      <Layers3 size={14} />
                      Footprint
                    </button>
                  )}
                </div>
                <div className="preview-toolbar-right">
                  <button
                    className={`icon-button ${showGrid ? "is-active" : ""}`}
                    aria-label="Toggle grid"
                    aria-pressed={showGrid}
                    title="Toggle grid"
                    onClick={() => setShowGrid((previous) => !previous)}
                  >
                    <Grid2X2 size={16} />
                  </button>
                  <button
                    className="icon-button mobile-parameters-toggle"
                    aria-label="Open parameters"
                    onClick={() => setParametersOpen(true)}
                  >
                    <SlidersHorizontal size={18} />
                  </button>
                </div>
              </div>
              <div className="preview-stage">
                <ModelPreview
                  key={entry.id}
                  request={request}
                  view={view}
                  showGrid={showGrid}
                  onResult={receivePreview}
                  onBusy={setBusy}
                />
                {busy && <span className="preview-loading">Updating…</span>}
                {error && (
                  <div className="preview-error" role="alert">
                    <strong>Check your parameters</strong>
                    <span>{error}</span>
                  </div>
                )}
              </div>
              <div className="model-stats">
                <span className="stat-item">
                  {error
                    ? "Last valid preview"
                    : busy
                      ? "Updating"
                      : "Live preview"}
                </span>
                {dimensions && (
                  <span className="stat-item">
                    {dimensions
                      .map((number) =>
                        number.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        }),
                      )
                      .join(" × ")}{" "}
                    mm
                  </span>
                )}
                <a
                  className="stat-library"
                  href={`https://github.com/tscircuit/${entry.library}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {entry.library}
                  <ExternalLink size={10} />
                </a>
              </div>
              <section
                className={`code-panel ${codeTab ? "is-expanded" : ""}`}
                aria-label="Generated code"
              >
                <div className="code-heading">
                  <div className="code-tabs">
                    {(
                      [
                        ["code", "TypeScript"],
                        ["json", "Parameters"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        className={codeTab === key ? "is-active" : ""}
                        onClick={() => setCodeTab(codeTab === key ? null : key)}
                        aria-expanded={codeTab === key}
                      >
                        <Code2 size={13} />
                        {label}
                      </button>
                    ))}
                  </div>
                  {codeTab && (
                    <button
                      className="icon-button"
                      aria-label="Copy generated code"
                      title="Copy generated code"
                      onClick={() => copy(displayCode, "code")}
                    >
                      {copied === "code" ? (
                        <Check size={15} />
                      ) : (
                        <Copy size={15} />
                      )}
                    </button>
                  )}
                </div>
                {codeTab && (
                  <div className="code-content">
                    <pre tabIndex={0}>
                      <code>{displayCode}</code>
                    </pre>
                  </div>
                )}
                {configured.result?.warnings?.[0] && (
                  <p className="code-warning">
                    {configured.result.warnings[0]}
                  </p>
                )}
              </section>
            </section>

            <aside className="parameters-panel" aria-label="Model parameters">
              <div className="parameter-heading">
                <span>Parameters</span>
                <button
                  className="icon-button mobile-close"
                  aria-label="Close parameters"
                  onClick={() => setParametersOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="parameter-scroll">
                {grouped.map(([name, parameters], index) => (
                  <details
                    className="parameter-group"
                    key={`${entry.id}-${name}`}
                    open={
                      index === 0 ||
                      name === "Geometry" ||
                      name === "Dimensions"
                    }
                  >
                    <summary>{name}</summary>
                    {parameters.map((parameter) => (
                      <ParameterField
                        key={parameter.key}
                        parameter={parameter}
                        value={values[parameter.key]}
                        resolved={resolved[parameter.key]}
                        resolvedAvailable={Boolean(configured.result)}
                        onChange={(value) => change(parameter.key, value)}
                        onReset={() =>
                          change(
                            parameter.key,
                            parameter.optional
                              ? undefined
                              : entry.initialValues[parameter.key],
                          )
                        }
                      />
                    ))}
                  </details>
                ))}
              </div>
              <div className="parameter-footer">
                <button className="secondary-button" onClick={resetDefaults}>
                  <RotateCcw size={13} />
                  Reset defaults
                </button>
              </div>
            </aside>
          </main>
        </>
      )}
      {copied && (
        <div className="toast" role="status">
          <Check size={14} />
          {copied === "share"
            ? "Configuration link copied"
            : "Copied to clipboard"}
        </div>
      )}
    </div>
  )
}
