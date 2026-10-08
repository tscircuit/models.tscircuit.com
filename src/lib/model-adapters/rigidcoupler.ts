import { rigidCouplerModelPropsSchema } from "@tscircuit/modelprinter"
import { RigidCoupler } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Rigid shaft coupler",
  category: "Shafts and bearings",
  description:
    "Configure and preview a rigid shaft coupler using the upstream model dimensions.",
  tags: ["rigidcoupler", "shafts and bearings"],
  spec: "rigidcoupler_bore8mm_od20mm_l25mm_screwcount4_m4_setscrew",
  componentName: "RigidCoupler",
  schema: rigidCouplerModelPropsSchema,
  component: RigidCoupler,
  lengths: {
    boreDiameter: "bore",
    outerDiameter: "od",
    threadPitch: "threadpitch",
    chamfer: "chamfer",
    boreBDiameter: "boreb",
    length: "l",
    screwEndOffset: "screwendoffset",
  },
  numbers: { screwCount: "screwcount", screwAngle: "screwangle" },
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
    boreb: "boreBDiameter",
    l: "length",
    length: "length",
    screwcount: "screwCount",
    screwendoffset: "screwEndOffset",
    screwangle: "screwAngle",
  },
} satisfies ModelAdapter
