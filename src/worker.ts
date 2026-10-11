import { catalog, configure, prepareValues } from "./lib/catalog"
import { modelInputFromSpec } from "./lib/model-configuration"
import { footprintInputFromSpec } from "./lib/footprint-configuration"
import { generatePreview } from "./lib/preview-engine"
import { exportStep } from "./lib/export-step"
import { exportParasolid } from "./lib/export-parasolid"
import { exportGlb } from "./lib/export-glb"

const CACHE_TTL = 7 * 24 * 60 * 60
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  MODEL_CACHE: {
    get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>
    put(
      key: string,
      value: ArrayBuffer,
      options: { expirationTtl: number },
    ): Promise<void>
  }
}
interface Context {
  waitUntil(promise: Promise<unknown>): void
}
const types = {
  glb: "model/gltf-binary",
  step: "application/step",
  x_t: "text/plain; charset=utf-8",
}

export default {
  async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/([^/]+)\.(glb|step|x_t)$/i)
    if (!match) return env.ASSETS.fetch(request)
    const cors = { "Access-Control-Allow-Origin": "*" }
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        },
      })
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...cors, Allow: "GET, HEAD, OPTIONS" },
      })
    const format = match[2].toLowerCase() as keyof typeof types
    let spec: string, entry, config
    try {
      spec = decodeURIComponent(match[1])
      if (spec.length > 4096 || url.search.length > 16384)
        throw new Error("Model URL is too long.")
      const preferred = url.searchParams
        .get("model")
        ?.startsWith("footprinter:")
        ? "footprinter"
        : "modelprinter"
      let input
      try {
        input = {
          library: preferred,
          ...(preferred === "modelprinter"
            ? modelInputFromSpec(spec)
            : footprintInputFromSpec(spec)),
        }
      } catch {
        const library =
          preferred === "modelprinter" ? "footprinter" : "modelprinter"
        input = {
          library,
          ...(library === "modelprinter"
            ? modelInputFromSpec(spec)
            : footprintInputFromSpec(spec)),
        }
      }
      entry = catalog.find(
        (item) => item.library === input.library && item.fn === input.fn,
      )
      if (!entry) throw new Error("Unsupported model function.")
      const values = url.searchParams.has("params")
        ? JSON.parse(url.searchParams.get("params")!)
        : input.values
      if (!values || typeof values !== "object" || Array.isArray(values))
        throw new Error("Invalid parameters.")
      config = configure(
        { ...entry, initialSpec: spec },
        prepareValues(entry, values),
      )
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : "Invalid model",
        { status: 400, headers: { ...cors, "Cache-Control": "no-store" } },
      )
    }
    // Library versions are bundled into the Worker, so upgrades cannot reuse old exports.
    const identity = JSON.stringify([
      CACHE_VERSION,
      entry.library,
      entry.fn,
      config.values,
      format,
    ])
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(identity),
    )
    const key = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
    const headers = {
      ...cors,
      "Content-Type": types[format],
      "Content-Disposition": `attachment; filename="${spec.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120)}.${format}"`,
      "Cache-Control": `public, max-age=${CACHE_TTL}`,
      "X-Content-Type-Options": "nosniff",
    }
    let cached: ArrayBuffer | null = null
    try {
      cached = await env.MODEL_CACHE.get(key, "arrayBuffer")
    } catch (error) {
      console.error("KV read failed", error)
    }
    if (cached)
      return new Response(request.method === "HEAD" ? null : cached, {
        headers: { ...headers, "X-Model-Cache": "HIT" },
      })
    try {
      const job = {
        id: 1,
        library: entry.library,
        fn: entry.fn,
        spec: config.spec,
        values: config.values,
      }
      let data: ArrayBuffer
      if (format === "x_t")
        data = new TextEncoder().encode(exportParasolid(job)).buffer
      else {
        const preview = generatePreview(job)
        if (preview.error) throw new Error(preview.error)
        data =
          format === "glb"
            ? exportGlb(preview.meshes)
            : new TextEncoder().encode(exportStep(preview.meshes)).buffer
      }
      // KV values have a 25 MiB limit; larger successful exports are still downloadable.
      if (data.byteLength <= 25 * 1024 * 1024)
        ctx.waitUntil(
          env.MODEL_CACHE.put(key, data, { expirationTtl: CACHE_TTL }).catch(
            (error) => console.error("KV write failed", error),
          ),
        )
      return new Response(request.method === "HEAD" ? null : data, {
        headers: {
          ...headers,
          "X-Model-Cache":
            data.byteLength <= 25 * 1024 * 1024 ? "MISS" : "BYPASS",
        },
      })
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : "Unable to generate model",
        { status: 422, headers: { ...cors, "Cache-Control": "no-store" } },
      )
    }
  },
}
import pkg from "../package.json"
const CACHE_VERSION = JSON.stringify(["exports-v1", pkg.dependencies])
