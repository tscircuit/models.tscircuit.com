import { compressionSpringModelPropsSchema } from "@tscircuit/modelprinter"
import { CompressionSpring } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Compression spring",
  category: "Springs",
  description:
    "Configure and preview a compression spring using the upstream model dimensions.",
  tags: ["compressionspring", "springs"],
  spec: "compressionspring_od8mm_wire1mm_l20mm_turns8_closedground",
  componentName: "CompressionSpring",
  schema: compressionSpringModelPropsSchema,
  component: CompressionSpring,
  lengths: { outerDiameter: "od", wireDiameter: "wire", freeLength: "l" },
  numbers: { totalTurns: "turns", activeTurns: "active" },
  selectors: { spec: "spec", ends: "ends", hand: "hand", state: "state" },
  flags: {
    ends: { closedground: "closedground" },
    hand: { left: "lefthanded", right: "" },
    spec: { custom: "" },
    state: { free: "" },
  },
  aliases: {
    od: "outerDiameter",
    wire: "wireDiameter",
    l: "freeLength",
    length: "freeLength",
    freelength: "freeLength",
    spec: "spec",
    ends: "ends",
    hand: "hand",
    state: "state",
    turns: "totalTurns",
    active: "activeTurns",
  },
} satisfies ModelAdapter
