import { cableGrommetModelPropsSchema } from "@tscircuit/modelprinter"
import { CableGrommet } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Cable grommet",
  category: "Cable management",
  description:
    "Configure and preview a cable grommet using the upstream model dimensions.",
  tags: ["cablegrommet", "cable management"],
  spec: "cablegrommet_panelhole20mm_id10mm_od24mm_h8mm_groovew3mm_grooved2mm_symmetricring",
  componentName: "CableGrommet",
  schema: cableGrommetModelPropsSchema,
  component: CableGrommet,
  lengths: {
    panelHoleDiameter: "panelhole",
    innerDiameter: "id",
    outerDiameter: "od",
    height: "h",
    grooveWidth: "groovew",
    grooveDepth: "grooved",
  },
  selectors: { shape: "shape" },
  flags: { shape: { symmetricring: "symmetricring" } },
  aliases: {
    panelhole: "panelHoleDiameter",
    panelholediameter: "panelHoleDiameter",
    id: "innerDiameter",
    innerdiameter: "innerDiameter",
    od: "outerDiameter",
    outerdiameter: "outerDiameter",
    h: "height",
    height: "height",
    groovew: "grooveWidth",
    groovewidth: "grooveWidth",
    grooved: "grooveDepth",
    groovedepth: "grooveDepth",
  },
} satisfies ModelAdapter
