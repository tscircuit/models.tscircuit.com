import { hexNutModelPropsSchema } from "@tscircuit/modelprinter"
import { HexNut } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Hex nut",
  category: "Fasteners",
  description:
    "Configure and preview a hex nut using the upstream model dimensions.",
  tags: ["hexnut", "fasteners"],
  spec: "hexnut_m6_nothreads",
  componentName: "HexNut",
  schema: hexNutModelPropsSchema,
  component: HexNut,
  lengths: { threadPitch: "threadpitch" },
  selectors: {
    standard: "standard",
    threadHand: "threadhand",
    threadClass: "threadclass",
  },
  flags: { threadHand: { right: "" } },
  booleans: { showThreads: ["threads", "nothreads"] },
  aliases: {
    standard: "standard",
    threadhand: "threadHand",
    threadclass: "threadClass",
    threadpitch: "threadPitch",
  },
} satisfies ModelAdapter
