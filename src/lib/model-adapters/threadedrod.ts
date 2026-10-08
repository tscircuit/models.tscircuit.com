import { threadedRodModelPropsSchema } from "@tscircuit/modelprinter"
import { ThreadedRod } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Threaded rod",
  category: "Fasteners",
  description:
    "Configure and preview a threaded rod using the upstream model dimensions.",
  tags: ["threadedrod", "fasteners"],
  spec: "threadedrod_m6_l10mm_fullthread",
  componentName: "ThreadedRod",
  schema: threadedRodModelPropsSchema,
  component: ThreadedRod,
  lengths: { length: "l", chamfer: "chamfer", threadPitch: "threadpitch" },
  selectors: {
    spec: "spec",
    thread: "thread",
    ends: "ends",
    threadHand: "threadhand",
  },
  flags: {
    threadHand: { left: "lefthanded", right: "" },
    thread: { full: "fullthread" },
    ends: { flat: "" },
    spec: { custom: "" },
  },
  aliases: {
    l: "length",
    length: "length",
    chamfer: "chamfer",
    threadpitch: "threadPitch",
    spec: "spec",
    thread: "thread",
    ends: "ends",
    threadhand: "threadHand",
  },
} satisfies ModelAdapter
