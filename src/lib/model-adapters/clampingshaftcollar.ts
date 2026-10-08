import { clampingShaftCollarModelPropsSchema } from "@tscircuit/modelprinter"
import { ClampingShaftCollar } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Clamping shaft collar",
  category: "Shafts and bearings",
  description:
    "Configure and preview a clamping shaft collar using the upstream model dimensions.",
  tags: ["clampingshaftcollar", "shafts and bearings"],
  spec: "clampingshaftcollar_bore8mm_od18mm_w9mm_split1mm_m4_singleclamp",
  componentName: "ClampingShaftCollar",
  schema: clampingShaftCollarModelPropsSchema,
  component: ClampingShaftCollar,
  lengths: {
    boreDiameter: "bore",
    outerDiameter: "od",
    threadPitch: "threadpitch",
    chamfer: "chamfer",
    width: "w",
    screwZ: "screwz",
    splitWidth: "split",
    clampX: "clampx",
    clearanceHoleDiameter: "clearance",
  },
  selectors: {
    mount: "mount",
    threadHand: "threadhand",
    threadClass: "threadclass",
  },
  flags: {
    mount: { singleclamp: "singleclamp" },
    threadHand: { left: "lefthanded", right: "" },
  },
  aliases: {
    bore: "boreDiameter",
    od: "outerDiameter",
    mount: "mount",
    m: "metricSize",
    threadpitch: "threadPitch",
    threadhand: "threadHand",
    threadclass: "threadClass",
    chamfer: "chamfer",
    w: "width",
    width: "width",
    screwz: "screwZ",
    split: "splitWidth",
    clampx: "clampX",
    clearance: "clearanceHoleDiameter",
  },
} satisfies ModelAdapter
