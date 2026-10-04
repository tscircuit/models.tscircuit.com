import type { PreviewMesh } from "./catalog-types"
import { Group } from "three"
import { createPreviewMesh } from "./three-preview"

export type DownloadFormat = "glb" | "step"

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

function createStep(meshes: PreviewMesh[], signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/export-step.worker.ts", import.meta.url),
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
        fail("STEP export took too long. Try reducing the model resolution."),
      60_000,
    )
    signal.addEventListener("abort", abort, { once: true })
    worker.onmessage = (
      event: MessageEvent<{ step?: string; error?: string }>,
    ) => {
      cleanup()
      if (event.data.step)
        resolve(new Blob([event.data.step], { type: "application/step" }))
      else reject(new Error(event.data.error ?? "Unable to export STEP."))
    }
    worker.onerror = () => fail("Unable to export STEP. Please try again.")
    // Clone the buffers: transferring them would detach the live preview geometry.
    worker.postMessage(meshes)
  })
}

export async function downloadModel(
  meshes: PreviewMesh[],
  format: DownloadFormat,
  name: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const blob =
    format === "glb"
      ? await createGlb(meshes)
      : await createStep(meshes, signal)
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
