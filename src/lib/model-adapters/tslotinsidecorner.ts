import { tSlotInsideCornerModelPropsSchema } from "@tscircuit/modelprinter"
import { TSlotInsideCorner } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "T-slot inside corner",
  category: "Framing",
  description:
    "Configure and preview a t-slot inside corner using the upstream model dimensions.",
  tags: ["tslotinsidecorner", "framing"],
  spec: "tslotinsidecorner_w20mm_leg40mm_t4mm_angle90_holes2_hole5mm_offset20mm_bendr0mm",
  componentName: "TSlotInsideCorner",
  schema: tSlotInsideCornerModelPropsSchema,
  component: TSlotInsideCorner,
  lengths: {
    width: "w",
    legLength: "leg",
    thickness: "t",
    holeDiameter: "hole",
    holeOffset: "offset",
    bendRadius: "bendr",
  },
  numbers: { holeCount: "holes", angle: "angle" },
  aliases: {
    w: "width",
    width: "width",
    leg: "legLength",
    leglength: "legLength",
    t: "thickness",
    thickness: "thickness",
    hole: "holeDiameter",
    holediameter: "holeDiameter",
    offset: "holeOffset",
    holeoffset: "holeOffset",
    bendr: "bendRadius",
    bendradius: "bendRadius",
    holes: "holeCount",
    angle: "angle",
  },
} satisfies ModelAdapter
