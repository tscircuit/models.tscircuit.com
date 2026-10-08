import { tSlotExtrusionModelPropsSchema } from "@tscircuit/modelprinter"
import { TSlotExtrusion } from "jscad-electronics"
import type { ModelAdapter } from "./types"

export const adapter = {
  name: "T-slot extrusion",
  category: "Framing",
  description:
    "Configure and preview a t-slot extrusion using the upstream model dimensions.",
  tags: ["tslotextrusion", "framing"],
  spec: "tslotextrusion_w20mm_h20mm_l40mm_slot6mm_pocket10mm_pocketd2mm_lip2mm_bore4mm_corner1mm_fourtsolid",
  componentName: "TSlotExtrusion",
  schema: tSlotExtrusionModelPropsSchema,
  component: TSlotExtrusion,
  lengths: {
    width: "w",
    height: "h",
    length: "l",
    slotWidth: "slot",
    pocketWidth: "pocket",
    pocketDepth: "pocketd",
    lipThickness: "lip",
    boreDiameter: "bore",
    cornerRadius: "corner",
  },
  selectors: { profile: "profile" },
  flags: { profile: { fourtsolid: "fourtsolid" } },
  aliases: {
    w: "width",
    width: "width",
    h: "height",
    height: "height",
    l: "length",
    length: "length",
    slot: "slotWidth",
    slotwidth: "slotWidth",
    pocket: "pocketWidth",
    pocketwidth: "pocketWidth",
    pocketd: "pocketDepth",
    pocketdepth: "pocketDepth",
    lip: "lipThickness",
    lipthickness: "lipThickness",
    bore: "boreDiameter",
    borediameter: "boreDiameter",
    corner: "cornerRadius",
    cornerradius: "cornerRadius",
  },
} satisfies ModelAdapter
