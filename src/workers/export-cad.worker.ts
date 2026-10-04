import type { PreviewMesh, PreviewRequest } from "../lib/catalog-types"

export type CadExportRequest =
  | { format: "step"; meshes: PreviewMesh[] }
  | { format: "x_t"; request: PreviewRequest }

const worker = self as unknown as DedicatedWorkerGlobalScope
worker.onmessage = async (event: MessageEvent<CadExportRequest>) => {
  try {
    const job = event.data
    const text =
      job.format === "step"
        ? (await import("../lib/export-step")).exportStep(job.meshes)
        : (await import("../lib/export-parasolid")).exportParasolid(job.request)
    worker.postMessage({ text })
  } catch (error) {
    worker.postMessage({
      error:
        error instanceof Error ? error.message : "Unable to export this model.",
    })
  }
}
