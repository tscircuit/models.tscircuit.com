import { generatePreview } from "../lib/preview-engine"
import type { PreviewRequest } from "../lib/catalog-types"

const worker = self as unknown as DedicatedWorkerGlobalScope
worker.onmessage = (event: MessageEvent<PreviewRequest>) => {
  const result = generatePreview(event.data)
  worker.postMessage(
    result,
    result.meshes.map((mesh) => mesh.positions.buffer as ArrayBuffer),
  )
}
