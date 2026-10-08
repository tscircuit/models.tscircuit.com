import { tSlotGussetModelPropsSchema } from "@tscircuit/modelprinter"
import { TSlotGusset } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "T-slot gusset",
  category: "Framing",
  description:
    "Configure and preview a t-slot gusset using the upstream model dimensions.",
  tags: ["tslotgusset", "framing"],
  spec: "tslotgusset_w40mm_h40mm_t4mm_slots2_slot(5mm,12mm)_centers(12mm,28mm)_righttriangle",
  componentName: "TSlotGusset",
  schema: tSlotGussetModelPropsSchema,
  component: TSlotGusset,
  lengths: {
    width: "w",
    height: "h",
    thickness: "t",
    edgeMargin: "edgemargin",
  },
  numbers: { slotCount: "slots" },
  selectors: { shape: "shape" },
  flags: { shape: { righttriangle: "righttriangle" } },
  tuples: { slot: "slot", centers: "centers" },
  aliases: {
    w: "width",
    width: "width",
    h: "height",
    height: "height",
    t: "thickness",
    thickness: "thickness",
    edgemargin: "edgeMargin",
    slots: "slotCount",
  },
} satisfies ModelAdapter
