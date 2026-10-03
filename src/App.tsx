import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Box,
  ChevronRight,
  Check,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Grid2X2,
  Layers3,
  Menu,
  Search,
  Settings2,
  Share2,
  SlidersHorizontal,
  X,
  RotateCcw,
} from "lucide-react"
import { ModelPreview } from "./components/ModelPreview"
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
import { modelInputFromSpec } from "./lib/model-configuration"
import { footprintInputFromSpec } from "./lib/footprint-configuration"
import type {
  CatalogEntry,
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

export function App() {
  const seed = useMemo(initialState, [])
  const [entry, setEntry] = useState(seed.entry)
  const [values, setValues] = useState<Record<string, unknown>>(seed.values)
  const [baseSpec, setBaseSpec] = useState(seed.spec ?? seed.entry.initialSpec)
  const [search, setSearch] = useState("")
  const [library, setLibrary] = useState("all")
  const [view, setView] = useState<"3d" | "2d">(
    seed.entry.library === "modelprinter" ? "3d" : "2d",
  )
  const [showGrid, setShowGrid] = useState(true)
  const [request, setRequest] = useState<PreviewRequest | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [codeTab, setCodeTab] = useState<"string" | "code" | "json">("string")
  const [editedSpec, setEditedSpec] = useState<string | null>(null)
  const [editError, setEditError] = useState("")
  const [copied, setCopied] = useState("")
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [parametersOpen, setParametersOpen] = useState(false)
  const id = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)

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
    if (!configured.result) return
    const timer = window.setTimeout(() => {
      setRequest({
        id: ++id.current,
        library: entry.library,
        fn: entry.fn,
        spec: configured.result!.spec,
        values: configured.result!.values,
      })
      setEditError("")
    }, 150)
    return () => window.clearTimeout(timer)
  }, [configured, entry])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault()
        setCatalogOpen(true)
        searchRef.current?.focus()
      }
      if (event.key === "Escape") {
        setCatalogOpen(false)
        setParametersOpen(false)
      }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])

  const receivePreview = useCallback(
    (result: PreviewResult) => setPreview(result),
    [],
  )
  const filtered = useMemo(
    () => searchCatalog(search, library),
    [search, library],
  )
  const grouped = groupParameters(entry.parameters)
  const resolved =
    configured.result?.resolvedValues ?? configured.result?.values ?? {}
  const displayCode =
    codeTab === "code"
      ? (configured.result?.code ?? "")
      : codeTab === "json"
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
        : (configured.result?.spec ?? baseSpec)
  const dimensions = preview?.bounds
    ? preview.bounds.max.map((value, axis) =>
        Math.abs(value - preview.bounds!.min[axis]),
      )
    : null
  const error =
    configured.error ||
    editError ||
    (preview?.id === request?.id ? preview?.error : "")

  const choose = (next: CatalogEntry) => {
    setEntry(next)
    setValues({ ...next.initialValues })
    setBaseSpec(next.initialSpec)
    setEditedSpec(null)
    setEditError("")
    setPreview(null)
    setView(next.library === "modelprinter" ? "3d" : "2d")
    setCodeTab("string")
    setCatalogOpen(false)
  }
  const change = (key: string, value: unknown) =>
    setValues((previous) => updateValues(entry, previous, key, value))
  const copy = async (value: string, kind: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(""), 1800)
    } catch {
      setEditError(
        "Clipboard is unavailable. Select the model string below to copy it.",
      )
    }
  }
  const applySpec = () => {
    const spec = editedSpec?.trim()
    if (!spec) return
    try {
      if (entry.library === "modelprinter") {
        const definition = modelInputFromSpec(spec)
        const next = catalog.find(
          (item) =>
            item.library === "modelprinter" && item.fn === definition.fn,
        )
        if (!next) throw new Error("Choose a supported model function")
        setEntry(next)
        setValues(definition.values)
        setBaseSpec(spec)
      } else {
        const definition = footprintInputFromSpec(spec)
        const next = catalog.find(
          (item) => item.library === "footprinter" && item.fn === definition.fn,
        )
        if (!next) throw new Error("Choose a supported footprint function")
        setEntry(next)
        setValues(definition.values)
        setBaseSpec(spec)
      }
      setEditedSpec(null)
      setEditError("")
    } catch (problem) {
      setEditError(errorMessage(problem))
    }
  }

  return (
    <div
      className={`app-shell ${catalogOpen ? "catalog-open" : ""} ${parametersOpen ? "parameters-open" : ""}`}
    >
      <header className="app-header">
        <a
          className="brand"
          href="https://tscircuit.com"
          target="_blank"
          rel="noreferrer"
        >
          <span className="brand-mark">
            <Box size={23} strokeWidth={1.7} />
          </span>
          <span className="brand-title">tscircuit</span>
        </a>
        <span className="brand-divider" />
        <span className="header-title">Models</span>
        <div className="header-actions">
          <span className="header-subtitle">
            A playground for parametric models
          </span>
          <a
            className="icon-button"
            href="https://github.com/tscircuit/models.tscircuit.com"
            target="_blank"
            rel="noreferrer"
            title="View source"
            aria-label="View source"
          >
            <Code2 size={19} />
          </a>
        </div>
      </header>
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
            <span>Explore models</span>
            <button
              className="icon-button mobile-close"
              aria-label="Close catalog"
              onClick={() => setCatalogOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              ref={searchRef}
              aria-label="Search functions"
              placeholder="Search functions…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="library-filters" aria-label="Filter library">
            {[
              ["all", "All"],
              ["modelprinter", "Models"],
              ["footprinter", "Footprints"],
            ].map(([value, label]) => (
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
          <div className="catalog-count">
            {filtered.length} functions <span>in two libraries</span>
          </div>
          <div className="catalog-list">
            {(["modelprinter", "footprinter"] as const).map((family) => {
              const items = filtered.filter((item) => item.library === family)
              return (
                items.length > 0 && (
                  <section key={family}>
                    <div className="catalog-group-label">
                      {family === "modelprinter" ? (
                        <Box size={12} />
                      ) : (
                        <Cpu size={12} />
                      )}
                      {family}
                      <span>{items.length}</span>
                    </div>
                    {items.map((item) => (
                      <button
                        className={`catalog-item ${entry.id === item.id ? "is-selected" : ""}`}
                        key={item.id}
                        onClick={() => choose(item)}
                        aria-pressed={entry.id === item.id}
                        data-testid={`catalog-${item.fn}`}
                      >
                        <span className="catalog-item-icon">
                          {item.library === "modelprinter" ? (
                            <Box size={17} />
                          ) : (
                            <Cpu size={17} />
                          )}
                        </span>
                        <span>
                          <span className="catalog-item-name">{item.fn}</span>
                          <span className="catalog-item-description">
                            {item.name}
                          </span>
                        </span>
                        <ChevronRight
                          className="catalog-item-arrow"
                          size={14}
                        />
                      </button>
                    ))}
                  </section>
                )
              )
            })}
            {filtered.length === 0 && (
              <div className="catalog-empty">
                <Search size={24} />
                <strong>No functions found</strong>
                <span>Try “gear”, “connector”, or “qfn”.</span>
                <button onClick={() => setSearch("")}>Clear search</button>
              </div>
            )}
          </div>
          <div className="catalog-footer">
            <span className="status-dot" />
            {catalog.length} functions. Infinite possibilities.
          </div>
        </aside>

        <section className="model-panel" aria-label="Model workspace">
          <div className="model-heading">
            <div className="model-heading-copy">
              <div className="model-eyebrow">
                <button
                  className="icon-button mobile-catalog-toggle"
                  aria-label="Open catalog"
                  onClick={() => setCatalogOpen(true)}
                >
                  <Menu size={17} />
                </button>
                <span className="library-badge">{entry.library}</span>
                <span>{entry.category}</span>
              </div>
              <h1 className="model-name">{entry.name}</h1>
              <p className="model-description">{entry.description}</p>
            </div>
            <div className="model-heading-actions">
              <button
                className="secondary-button"
                onClick={() => copy(shareUrl(entry, values, baseSpec), "share")}
              >
                <Share2 size={14} />
                {copied === "share" ? "Copied link" : "Share"}
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
          <div className="preview-toolbar">
            <div className="view-tabs" aria-label="Preview view">
              <button
                className={view === "3d" ? "is-active" : ""}
                onClick={() => setView("3d")}
                aria-pressed={view === "3d"}
              >
                <Box size={14} />
                3D model
              </button>
              <button
                className={view === "2d" ? "is-active" : ""}
                onClick={() => setView("2d")}
                aria-pressed={view === "2d"}
                disabled={entry.library !== "footprinter"}
              >
                <Layers3 size={14} />
                Footprint
              </button>
            </div>
            <div className="preview-toolbar-right">
              <span className="preview-hint">
                {view === "3d"
                  ? "Drag to orbit · scroll to zoom"
                  : "A precise, top-down view"}
              </span>
              <button
                className={`icon-button ${showGrid ? "is-active" : ""}`}
                aria-label="Toggle grid"
                aria-pressed={showGrid}
                title="Toggle grid"
                onClick={() => setShowGrid((previous) => !previous)}
              >
                <Grid2X2 size={16} />
              </button>
            </div>
          </div>
          <div className="preview-stage">
            <ModelPreview
              request={request}
              view={view}
              showGrid={showGrid}
              onResult={receivePreview}
              onBusy={setBusy}
            />
            {busy && (
              <span className="preview-loading">
                <span className="loading-dot" />
                Updating preview
              </span>
            )}
            {error && (
              <div className="preview-error" role="alert">
                <strong>Check your parameters</strong>
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="model-stats">
            <span className="stat-item">
              <span className={`status-dot ${error ? "status-error" : ""}`} />
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
                  .join(" × ")}
                <span> mm</span>
              </span>
            )}
            <span className="stat-item stat-function">
              <Code2 size={12} />
              {entry.fn}()
            </span>
          </div>
          <section className="code-panel" aria-label="Generated code">
            <div className="code-heading">
              <div className="code-tabs">
                {[
                  ["string", "Model string"],
                  ["code", "TypeScript"],
                  ["json", "Parameters"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={codeTab === key ? "is-active" : ""}
                    onClick={() => setCodeTab(key as typeof codeTab)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="icon-button"
                aria-label="Copy generated code"
                title="Copy generated code"
                onClick={() => copy(displayCode, "code")}
              >
                {copied === "code" ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            <div className="code-content">
              {codeTab === "string" ? (
                <div className="spec-editor">
                  <input
                    aria-label="Model string"
                    value={editedSpec ?? displayCode}
                    onChange={(event) => setEditedSpec(event.target.value)}
                    spellCheck={false}
                  />
                  <button
                    className="secondary-button"
                    disabled={!editedSpec?.trim()}
                    onClick={applySpec}
                  >
                    Apply
                  </button>
                </div>
              ) : (
                <pre tabIndex={0}>
                  <code>{displayCode}</code>
                </pre>
              )}
            </div>
            <div className="code-note">
              {configured.result?.warnings?.[0] ??
                (entry.library === "modelprinter"
                  ? "Use this string with cadModel or the ModelPrinter API."
                  : "Use this string with footprint or the Footprinter API.")}
              <a
                href={
                  entry.library === "modelprinter"
                    ? "https://github.com/tscircuit/modelprinter"
                    : "https://github.com/tscircuit/footprinter"
                }
                target="_blank"
                rel="noreferrer"
              >
                Docs
                <ExternalLink size={11} />
              </a>
            </div>
          </section>
        </section>

        <aside className="parameters-panel" aria-label="Model parameters">
          <div className="parameter-heading">
            <span>
              <Settings2 size={16} />
              Parameters
            </span>
            <span className="parameter-count">{entry.parameters.length}</span>
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
                  index === 0 || name === "Geometry" || name === "Dimensions"
                }
              >
                <summary>
                  {name}
                  <span>{parameters.length}</span>
                </summary>
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
            <button
              className="secondary-button"
              onClick={() => {
                setValues({ ...entry.initialValues })
                setBaseSpec(entry.initialSpec)
                setEditedSpec(null)
                setEditError("")
              }}
            >
              <RotateCcw size={14} />
              Reset defaults
            </button>
            <span>Changes preview automatically</span>
          </div>
        </aside>
      </main>
      {copied === "share" && (
        <div className="toast" role="status">
          <Check size={14} />
          Configuration link copied
        </div>
      )}
    </div>
  )
}
