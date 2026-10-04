import { exportStep } from "../lib/export-step"
import type { PreviewMesh } from "../lib/catalog-types"

const worker = self as unknown as DedicatedWorkerGlobalScope
worker.onmessage = (event: MessageEvent<PreviewMesh[]>) => {
  try {
    worker.postMessage({ step: exportStep(event.data) })
  } catch (error) {
    worker.postMessage({
      error: error instanceof Error ? error.message : "Unable to export STEP.",
    })
  }
}
