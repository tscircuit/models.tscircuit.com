import { flangedBushingModelPropsSchema } from "@tscircuit/modelprinter"
import { FlangedBushing } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Flanged bushing",
  category: "Bearings",
  description:
    "Configure and preview a flanged bushing using the upstream model dimensions.",
  tags: ["flangedbushing", "bearings"],
  spec: "flangedbushing_id8mm_od12mm_flangeod18mm_l15mm_flangethickness2mm",
  componentName: "FlangedBushing",
  schema: flangedBushingModelPropsSchema,
  component: FlangedBushing,
  lengths: {
    innerDiameter: "id",
    outerDiameter: "od",
    flangeDiameter: "flangeod",
    length: "l",
    flangeThickness: "flangethickness",
  },
  selectors: { style: "style" },
  flags: { style: { plainclosed: "" } },
  aliases: {
    id: "innerDiameter",
    innerdiameter: "innerDiameter",
    od: "outerDiameter",
    outerdiameter: "outerDiameter",
    flangeod: "flangeDiameter",
    flangediameter: "flangeDiameter",
    l: "length",
    length: "length",
    flangethickness: "flangeThickness",
  },
} satisfies ModelAdapter
