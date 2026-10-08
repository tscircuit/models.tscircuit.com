import { buttonScrewModelPropsSchema } from "@tscircuit/modelprinter"
import { ButtonScrew } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Button head screw",
  category: "Fasteners",
  description:
    "Configure and preview a button head screw using the upstream model dimensions.",
  tags: ["buttonscrew", "fasteners"],
  spec: "buttonscrew_m4_l10mm_nothreads",
  componentName: "ButtonScrew",
  schema: buttonScrewModelPropsSchema,
  component: ButtonScrew,
  lengths: { length: "l", threadPitch: "threadpitch" },
  selectors: {
    standard: "standard",
    drive: "drive",
    thread: "thread",
    threadHand: "threadhand",
    threadClass: "threadclass",
  },
  flags: {
    drive: { hexsocket: "hexsocket" },
    thread: { full: "fullthread" },
    threadHand: { right: "" },
  },
  booleans: { showThreads: ["threads", "nothreads"] },
  aliases: {
    l: "length",
    length: "length",
    threadpitch: "threadPitch",
    standard: "standard",
    drive: "drive",
    thread: "thread",
    threadhand: "threadHand",
    threadclass: "threadClass",
  },
} satisfies ModelAdapter
