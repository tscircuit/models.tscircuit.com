import { useEffect, useRef, useState } from "react"
import "./ModelPreview.css"
import { Maximize2, RotateCcw } from "lucide-react"
import type { PreviewRequest, PreviewResult } from "../lib/catalog-types"
import { createThreePreview, type CameraView } from "../lib/three-preview"

export interface ModelPreviewProps {
  request: PreviewRequest | null
  view: "3d" | "2d"
  showGrid?: boolean
  onResult: (result: PreviewResult) => void
  onBusy?: (busy: boolean) => void
}

export function ModelPreview({
  request,
  view,
  showGrid = true,
  onResult,
  onBusy,
}: ModelPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgViewportRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)
  const sceneRef = useRef<ReturnType<typeof createThreePreview> | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const currentId = useRef<number | null>(null)
  const inFlight = useRef(false)
  const callbacks = useRef({ onResult, onBusy })
  callbacks.current = { onResult, onBusy }
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [graphicsError, setGraphicsError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cameraView, setCameraView] = useState<CameraView>("isometric")
  const [svgTransform, setSvgTransform] = useState({ zoom: 1, x: 0, y: 0 })

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  useEffect(() => {
    if (!request) return
    currentId.current = request.id
    // Stop obsolete CPU-intensive jobs so rapid edits cannot queue stale work.
    if (inFlight.current) {
      workerRef.current?.terminate()
      workerRef.current = null
    }
    let worker = workerRef.current
    if (!worker) {
      worker = new Worker(
        new URL("../workers/preview.worker.ts", import.meta.url),
        { type: "module" },
      )
      workerRef.current = worker
    }
    const finish = (next: PreviewResult) => {
      if (next.id !== currentId.current || worker !== workerRef.current) return
      inFlight.current = false
      setBusy(false)
      callbacks.current.onBusy?.(false)
      setError(next.error ?? null)
      if (!next.error) setResult(next)
      callbacks.current.onResult(next)
    }
    worker.onmessage = (event: MessageEvent<PreviewResult>) =>
      finish(event.data)
    worker.onerror = () => {
      finish({
        id: request.id,
        meshes: [],
        error: "The preview could not load. Please refresh and try again.",
      })
      worker?.terminate()
      if (worker === workerRef.current) workerRef.current = null
    }
    inFlight.current = true
    setBusy(true)
    callbacks.current.onBusy?.(true)
    worker.postMessage(request)
    const timeout = window.setTimeout(() => {
      if (inFlight.current && currentId.current === request.id) {
        finish({
          id: request.id,
          meshes: [],
          error:
            "This preview took too long. Reduce the resolution or pin count and try again.",
        })
        worker?.terminate()
        if (worker === workerRef.current) workerRef.current = null
      }
    }, 20_000)
    return () => window.clearTimeout(timeout)
  }, [request])

  useEffect(() => {
    if (view !== "3d" || !hostRef.current) return
    let scene: ReturnType<typeof createThreePreview>
    try {
      scene = createThreePreview(hostRef.current)
      sceneRef.current = scene
      setGraphicsError(null)
    } catch {
      setGraphicsError(
        "3D preview needs WebGL in your browser. Use the 2D footprint view when available.",
      )
      return
    }
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [view])

  useEffect(() => {
    if (view === "3d" && result && sceneRef.current) {
      sceneRef.current.setMeshes(result.meshes, result.bounds)
    }
  }, [result, view])

  useEffect(() => {
    sceneRef.current?.setGrid(showGrid)
  }, [showGrid, view])

  useEffect(() => {
    setSvgTransform({ zoom: 1, x: 0, y: 0 })
  }, [request?.fn, request?.library])

  useEffect(() => {
    if (view !== "2d" || !svgViewportRef.current) return
    const viewport = svgViewportRef.current
    const zoom = (event: WheelEvent) => {
      event.preventDefault()
      setSvgTransform((previous) => ({
        ...previous,
        zoom: Math.max(
          0.25,
          Math.min(12, previous.zoom * Math.exp(-event.deltaY * 0.0015)),
        ),
      }))
    }
    viewport.addEventListener("wheel", zoom, { passive: false })
    return () => viewport.removeEventListener("wheel", zoom)
  }, [view, Boolean(result?.svg)])

  const changeCamera = (next: CameraView) => {
    setCameraView(next)
    sceneRef.current?.fit(next)
  }
  const svgUrl = result?.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`
    : undefined

  return (
    <div className="model-preview" aria-busy={busy} data-testid="model-preview">
      {view === "3d" ? (
        <div
          className="three-preview-host"
          ref={hostRef}
          data-testid="three-preview"
        />
      ) : svgUrl ? (
        <div
          className={`footprint-svg-viewport ${showGrid ? "has-grid" : ""}`}
          ref={svgViewportRef}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            dragStart.current = {
              x: event.clientX,
              y: event.clientY,
              panX: svgTransform.x,
              panY: svgTransform.y,
            }
          }}
          onPointerMove={(event) => {
            const start = dragStart.current
            if (start)
              setSvgTransform((previous) => ({
                ...previous,
                x: start.panX + event.clientX - start.x,
                y: start.panY + event.clientY - start.y,
              }))
          }}
          onPointerUp={() => {
            dragStart.current = null
          }}
          onPointerCancel={() => {
            dragStart.current = null
          }}
        >
          <img
            className="footprint-preview"
            src={svgUrl}
            draggable={false}
            style={{
              transform: `translate(${svgTransform.x}px, ${svgTransform.y}px) scale(${svgTransform.zoom})`,
            }}
            alt={`Configured ${request?.fn ?? "PCB"} footprint with pads and silkscreen`}
            data-testid="footprint-svg"
          />
        </div>
      ) : (
        <div className="preview-placeholder">
          {busy
            ? "Generating footprint…"
            : "Select a footprint to see its 2D drawing."}
        </div>
      )}
      {!result && busy && view === "3d" && (
        <div className="preview-placeholder">Generating preview…</div>
      )}
      {view === "3d" && !graphicsError && result?.meshes.length === 0 && (
        <div className="preview-placeholder">
          Use the 2D view to see this footprint.
        </div>
      )}
      {graphicsError && view === "3d" && (
        <div className="preview-error" role="alert">
          {graphicsError}
        </div>
      )}
      {result?.message && !error && (
        <div className="preview-advisory" role="status">
          {result.message}
        </div>
      )}
      {view === "2d" && svgUrl && (
        <>
          <div
            className="preview-camera-controls"
            aria-label="Footprint view controls"
          >
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() =>
                setSvgTransform((previous) => ({
                  ...previous,
                  zoom: Math.max(0.25, previous.zoom / 1.25),
                }))
              }
            >
              −
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() =>
                setSvgTransform((previous) => ({
                  ...previous,
                  zoom: Math.min(12, previous.zoom * 1.25),
                }))
              }
            >
              +
            </button>
            <button
              type="button"
              aria-label="Fit footprint"
              title="Fit footprint"
              onClick={() => setSvgTransform({ zoom: 1, x: 0, y: 0 })}
            >
              <Maximize2 size={15} />
            </button>
          </div>
          <div className="preview-interaction-hint">
            Drag to pan · Scroll to zoom
          </div>
        </>
      )}
      {view === "3d" && !graphicsError && (
        <>
          <div className="preview-camera-controls" aria-label="Camera controls">
            {(["isometric", "top", "front"] as const).map((option) => (
              <button
                type="button"
                key={option}
                onClick={() => changeCamera(option)}
                aria-pressed={cameraView === option}
                title={`${option} view`}
              >
                {option === "isometric"
                  ? "Isometric"
                  : option === "top"
                    ? "Top"
                    : "Front"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => sceneRef.current?.fit()}
              title="Fit model"
              aria-label="Fit model"
            >
              <Maximize2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => changeCamera("isometric")}
              title="Reset camera"
              aria-label="Reset camera"
            >
              <RotateCcw size={15} />
            </button>
          </div>
          <div className="preview-interaction-hint">
            Drag to orbit · Right drag to pan · Scroll to zoom
          </div>
        </>
      )}
    </div>
  )
}
