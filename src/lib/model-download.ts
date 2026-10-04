import type { PreviewMesh, PreviewRequest } from "./catalog-types"
import type { CadExportRequest } from "../workers/export-cad.worker"
import { Group } from "three"
import { createPreviewMesh } from "./three-preview"

export type DownloadFormat = "glb" | "step" | "x_t"

async function createGlb(meshes: PreviewMesh[]) {
  const { GLTFExporter } =
    await import("three/addons/exporters/GLTFExporter.js")
  const group = new Group()
  // The model uses Z-up millimeters; glTF uses Y-up meters.
  group.rotation.x = -Math.PI / 2
  group.scale.setScalar(0.001)
  for (const mesh of meshes) group.add(createPreviewMesh(mesh))
  try {
    const data = await new GLTFExporter().parseAsync(group, { binary: true })
    if (!(data instanceof ArrayBuffer)) throw new Error("Unable to export GLB.")
    return new Blob([data], { type: "model/gltf-binary" })
  } finally {
    for (const object of group.children) {
      const mesh = object as ReturnType<typeof createPreviewMesh>
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }
}

function createCad(job: CadExportRequest, signal: AbortSignal): Promise<Blob> {
  const label = job.format === "step" ? "STEP" : "Parasolid"
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/export-cad.worker.ts", import.meta.url),
      {
        type: "module",
      },
    )
    const cleanup = () => {
      worker.terminate()
      window.clearTimeout(timeout)
      signal.removeEventListener("abort", abort)
    }
    const fail = (message: string) => {
      cleanup()
      reject(new Error(message))
    }
    const abort = () => fail("Download cancelled.")
    const timeout = window.setTimeout(
      () =>
        fail(
          `${label} export took too long. Try reducing the model resolution.`,
        ),
      60_000,
    )
    signal.addEventListener("abort", abort, { once: true })
    worker.onmessage = (
      event: MessageEvent<{ text?: string; error?: string }>,
    ) => {
      cleanup()
      if (event.data.text)
        resolve(
          new Blob([event.data.text], {
            type: job.format === "step" ? "application/step" : "text/plain",
          }),
        )
      else reject(new Error(event.data.error ?? `Unable to export ${label}.`))
    }
    worker.onerror = () => fail(`Unable to export ${label}. Please try again.`)
    // Clone the buffers: transferring them would detach the live preview geometry.
    worker.postMessage(job)
  })
}

export async function downloadModel(
  meshes: PreviewMesh[],
  format: DownloadFormat,
  name: string,
  signal: AbortSignal,
  request: PreviewRequest | null,
) {
  signal.throwIfAborted()
  if (format === "x_t" && !request)
    throw new Error("Wait for a valid model preview.")
  const blob =
    format === "glb"
      ? await createGlb(meshes)
      : await createCad(
          format === "step"
            ? { format, meshes }
            : { format, request: request! },
          signal,
        )
  signal.throwIfAborted()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "model"}.${format}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
