import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Download, LoaderCircle } from "lucide-react"
import type { PreviewResult } from "../lib/catalog-types"
import { downloadModel, type DownloadFormat } from "../lib/model-download"

export function ModelDownload({
  preview,
  name,
}: {
  preview: PreviewResult | null
  name: string
}) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<DownloadFormat | null>(null)
  const [error, setError] = useState("")
  const host = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const job = useRef<AbortController | null>(null)
  const menuId = useId()
  const disabled = !preview || !!format

  useEffect(() => {
    setOpen(false)
    setFormat(null)
    setError("")
    job.current?.abort()
    return () => job.current?.abort()
  }, [preview])

  useEffect(() => {
    if (!open) return
    host.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])

  const download = async (nextFormat: DownloadFormat) => {
    if (!preview || disabled) return
    setOpen(false)
    trigger.current?.focus()
    setError("")
    setFormat(nextFormat)
    const controller = new AbortController()
    job.current = controller
    try {
      await downloadModel(preview.meshes, nextFormat, name, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Unable to download this model.",
        )
    } finally {
      if (!controller.signal.aborted) setFormat(null)
    }
  }

  return (
    <div
      className="model-download"
      ref={host}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false)
          trigger.current?.focus()
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault()
          if (!open) {
            if (!disabled) setOpen(true)
            return
          }
          const items = Array.from(
            host.current!.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]',
            ),
          )
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          )
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
                  items.length
          items[next]?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        className="secondary-button download-button"
        disabled={disabled}
        aria-label={
          format
            ? `Preparing ${format.toUpperCase()} download`
            : "Download model"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={preview ? "Download model" : "Waiting for a valid model preview"}
        onClick={() => setOpen(!open)}
      >
        {format ? (
          <LoaderCircle size={14} className="download-spinner" />
        ) : (
          <Download size={14} />
        )}
        <span>{format ? "Preparing…" : "Download"}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="download-menu"
          id={menuId}
          role="menu"
          aria-label="Download format"
        >
          <button role="menuitem" onClick={() => download("glb")}>
            GLB (.glb)
          </button>
          <button role="menuitem" onClick={() => download("step")}>
            STEP (.step)
          </button>
        </div>
      )}
      {error && (
        <div className="download-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
