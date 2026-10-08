import { hollowPositioningArmTubeModelPropsSchema } from "@tscircuit/modelprinter"
import { HollowPositioningArmTube } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Hollow positioning arm tube",
  category: "Mechanical",
  description:
    "Configure and preview a hollow positioning arm tube using the upstream model dimensions.",
  tags: ["hollowpositioningarmtube", "mechanical"],
  spec: "hollowpositioningarmtube_od6mm_id4mm_start10mm_end20mm_radius12mm_pitch2.25mm_depth0.25mm_angle90",
  componentName: "HollowPositioningArmTube",
  schema: hollowPositioningArmTubeModelPropsSchema,
  component: HollowPositioningArmTube,
  lengths: {
    outerDiameter: "od",
    innerDiameter: "id",
    startLength: "start",
    endLength: "end",
    bendRadius: "radius",
    ribPitch: "pitch",
    ribDepth: "depth",
  },
  numbers: { bendAngle: "angle" },
  aliases: {
    od: "outerDiameter",
    id: "innerDiameter",
    start: "startLength",
    end: "endLength",
    radius: "bendRadius",
    pitch: "ribPitch",
    depth: "ribDepth",
    angle: "bendAngle",
  },
} satisfies ModelAdapter
