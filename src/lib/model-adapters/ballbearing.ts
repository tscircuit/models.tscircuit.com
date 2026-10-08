import { ballBearingModelPropsSchema } from "@tscircuit/modelprinter"
import { BallBearing } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "Ball bearing",
  category: "Bearings",
  description:
    "Configure and preview a ball bearing using the upstream model dimensions.",
  tags: ["ballbearing", "bearings"],
  spec: "ballbearing625zz",
  componentName: "BallBearing",
  schema: ballBearingModelPropsSchema,
  component: BallBearing,
  lengths: { innerDiameter: "id", outerDiameter: "od", width: "w" },
  booleans: {
    topSideOpen: ["topsideopen", ""],
    topSideShielded: ["topsideshielded", ""],
    topSideSealed: ["topsidesealed", ""],
    bottomSideOpen: ["bottomsideopen", ""],
    bottomSideShielded: ["bottomsideshielded", ""],
    bottomSideSealed: ["bottomsidesealed", ""],
    bothSidesOpen: ["bothsidesopen", ""],
    bothSidesShielded: ["bothsidesshielded", ""],
    bothSidesSealed: ["bothsidessealed", ""],
  },
  aliases: {
    id: "innerDiameter",
    innerdiameter: "innerDiameter",
    od: "outerDiameter",
    outerdiameter: "outerDiameter",
    w: "width",
    width: "width",
  },
} satisfies ModelAdapter
