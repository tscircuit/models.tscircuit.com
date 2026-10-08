import { shaftCollarModelPropsSchema } from "@tscircuit/modelprinter"
import { ShaftCollar } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Shaft collar",
  category: "Shafts and bearings",
  description:
    "Configure and preview a shaft collar using the upstream model dimensions.",
  tags: ["shaftcollar", "shafts and bearings"],
  spec: "shaftcollar_bore8mm_od16mm_w8mm_m4_setscrew",
  componentName: "ShaftCollar",
  schema: shaftCollarModelPropsSchema,
  component: ShaftCollar,
  lengths: {
    boreDiameter: "bore",
    outerDiameter: "od",
    threadPitch: "threadpitch",
    chamfer: "chamfer",
    width: "w",
    screwZ: "screwz",
  },
  numbers: { screwAngle: "screwangle" },
  selectors: {
    mount: "mount",
    threadHand: "threadhand",
    threadClass: "threadclass",
  },
  flags: {
    mount: { setscrew: "setscrew" },
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
    screwangle: "screwAngle",
  },
} satisfies ModelAdapter
