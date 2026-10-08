import { torsionSpringModelPropsSchema } from "@tscircuit/modelprinter"
import { TorsionSpring } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Torsion spring",
  category: "Springs",
  description:
    "Configure and preview a torsion spring using the upstream model dimensions.",
  tags: ["torsionspring", "springs"],
  spec: "torsionspring_od8mm_wire0.8mm_turns3.25_pitch1mm_start10mm_end14mm_right",
  componentName: "TorsionSpring",
  schema: torsionSpringModelPropsSchema,
  component: TorsionSpring,
  lengths: {
    outerDiameter: "od",
    wireDiameter: "wire",
    pitch: "pitch",
    startLegLength: "start",
    endLegLength: "end",
  },
  numbers: { turns: "turns" },
  booleans: { leftHand: ["left", "right"] },
  aliases: {
    od: "outerDiameter",
    wire: "wireDiameter",
    pitch: "pitch",
    start: "startLegLength",
    end: "endLegLength",
    turns: "turns",
  },
} satisfies ModelAdapter
