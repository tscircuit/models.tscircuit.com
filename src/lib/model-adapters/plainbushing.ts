import { plainBushingModelPropsSchema } from "@tscircuit/modelprinter"
import { PlainBushing } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Plain bushing",
  category: "Bearings",
  description:
    "Configure and preview a plain bushing using the upstream model dimensions.",
  tags: ["plainbushing", "bearings"],
  spec: "plainbushing_id8mm_od12mm_l20mm",
  componentName: "PlainBushing",
  schema: plainBushingModelPropsSchema,
  component: PlainBushing,
  lengths: {
    innerDiameter: "id",
    outerDiameter: "od",
    length: "l",
    edgeChamfer: "edgechamfer",
  },
  selectors: { style: "style" },
  flags: { style: { plainclosed: "" } },
  aliases: {
    id: "innerDiameter",
    innerdiameter: "innerDiameter",
    od: "outerDiameter",
    outerdiameter: "outerDiameter",
    l: "length",
    length: "length",
    edgechamfer: "edgeChamfer",
  },
} satisfies ModelAdapter
