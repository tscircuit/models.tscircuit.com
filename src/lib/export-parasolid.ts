import { jscadToParasolid } from "jscad-to-parasolid"
import type { Geom3 } from "@jscad/modeling/src/geometries/types"
import type { PreviewRequest } from "./catalog-types"
import { generatePreview } from "./preview-engine"

export function exportParasolid(request: PreviewRequest): string {
  let solids: Geom3[] = []
  const preview = generatePreview(request, (geometries) => {
    solids = geometries
  })
  if (preview.error) throw new Error(preview.error)
  // Keep JSCAD polygon precision and topology; the Float32 display triangles can
  // collapse tiny faces. Use resolved props, including settings absent from the DSL.
  return jscadToParasolid(solids, { units: "mm" })
}
