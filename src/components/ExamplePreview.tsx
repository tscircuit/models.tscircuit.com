import { useEffect, useRef, useState } from "react"
import { mp } from "@tscircuit/modelprinter"
import { Box, CircuitBoard } from "lucide-react"
import type {
  Library,
  PreviewRequest,
  PreviewResult,
} from "../lib/catalog-types"
import { createThumbnailRenderer } from "../lib/three-preview"
import "./ExamplePreview.css"

interface PreviewExample {
  id: string
  library: Library
  fn: string
  spec: string
}

interface ThumbnailJob {
  key: string
  example: PreviewExample
  callbacks: Set<(url: string | null) => void>
}

// Example cards share one CPU worker and one offscreen WebGL context. Only the
// finished images are cached; generated geometry is released after each snapshot.
const thumbnails = new Map<string, string>()
const jobs = new Map<string, ThumbnailJob>()
const queue: ThumbnailJob[] = []
let worker: Worker | null = null
let renderer: ReturnType<typeof createThumbnailRenderer> | null = null
let active: ThumbnailJob | null = null
let activeId = 0
let timer: number | undefined

function finish(url: string | null) {
  const job = active
  if (!job) return
  window.clearTimeout(timer)
  if (url) {
    thumbnails.set(job.key, url)
    if (thumbnails.size > 64) thumbnails.delete(thumbnails.keys().next().value!)
  }
  jobs.delete(job.key)
  active = null
  for (const callback of job.callbacks) callback(url)
  startNext()
}

function startNext() {
  if (active) return
  let next: ThumbnailJob | undefined
  while ((next = queue.shift())) {
    if (next.callbacks.size > 0) break
    jobs.delete(next.key)
  }
  if (!next) return
  active = next
  const job = next
  const id = ++activeId
  try {
    let values: Record<string, unknown> = {}
    if (job.example.library === "modelprinter") {
      const { fn, ...parsed } = mp.string(job.example.spec).json()
      if (fn !== job.example.fn)
        throw new Error("The example selects a different model function.")
      values = parsed
    }
    if (!worker)
      worker = new Worker(
        new URL("../workers/preview.worker.ts", import.meta.url),
        { type: "module" },
      )
    worker.onmessage = (event: MessageEvent<PreviewResult>) => {
      if (event.data.id !== activeId || active !== job) return
      const result = event.data
      if (result.error) {
        finish(null)
        return
      }
      try {
        if (result.svg)
          finish(
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`,
          )
        else {
          renderer ??= createThumbnailRenderer()
          finish(renderer.render(result))
        }
      } catch {
        finish(null)
      }
    }
    worker.onerror = () => {
      if (active !== job || activeId !== id) return
      worker?.terminate()
      worker = null
      finish(null)
    }
    const request: PreviewRequest = {
      id,
      library: job.example.library,
      fn: job.example.fn,
      spec: job.example.spec,
      values,
    }
    worker.postMessage(request)
    timer = window.setTimeout(() => {
      if (active === job) {
        worker?.terminate()
        worker = null
        finish(null)
      }
    }, 20_000)
  } catch {
    finish(null)
  }
}

function subscribe(
  example: PreviewExample,
  callback: (url: string | null) => void,
) {
  const key = `${example.library}:${example.fn}:${example.spec}`
  const cached = thumbnails.get(key)
  if (cached) {
    callback(cached)
    return () => {}
  }
  let job = jobs.get(key)
  if (!job) {
    job = { key, example, callbacks: new Set() }
    jobs.set(key, job)
    queue.push(job)
  }
  job.callbacks.add(callback)
  queueMicrotask(startNext)
  return () => {
    job.callbacks.delete(callback)
    if (
      Array.from(jobs.values()).every((pending) => pending.callbacks.size === 0)
    ) {
      worker?.terminate()
      worker = null
      window.clearTimeout(timer)
      active = null
      queue.length = 0
      jobs.clear()
      renderer?.dispose()
      renderer = null
    }
  }
}

export function ExamplePreview({
  example,
  className = "",
}: {
  example: PreviewExample
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (!host.current) return
    if (!("IntersectionObserver" in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "120px" },
    )
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    setUrl(null)
    setFinished(false)
    return subscribe(example, (next) => {
      setUrl(next)
      setFinished(true)
    })
  }, [visible, example.library, example.fn, example.spec])

  return (
    <div
      className={`example-thumbnail ${className}`}
      ref={host}
      aria-busy={visible && !finished}
      data-testid={`example-preview-${example.id}`}
    >
      {url ? (
        <img
          src={url}
          alt={`${example.fn} preview`}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="example-thumbnail-placeholder" aria-hidden="true">
          {example.library === "modelprinter" ? (
            <Box size={28} strokeWidth={1.2} />
          ) : (
            <CircuitBoard size={28} strokeWidth={1.2} />
          )}
          {finished && <span>Open to configure</span>}
        </div>
      )}
    </div>
  )
}
