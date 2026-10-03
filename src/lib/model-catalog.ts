import { modelprinter } from "@tscircuit/modelprinter"
import type { CatalogEntry, ParameterDefinition } from "./catalog-types"
import { modelSchemas, type ModelName } from "./model-configuration"

// Read the input side of Zod schemas so unit-bearing lengths stay editable.
interface RuntimeSchema {
  _def: {
    typeName: string
    schema?: RuntimeSchema
    innerType?: RuntimeSchema
    in?: RuntimeSchema
    values?: (string | number | boolean)[]
    value?: string | number | boolean
    options?: RuntimeSchema[]
    checks?: { kind: string; value?: number; inclusive?: boolean }[]
    defaultValue?: () => unknown
  }
  shape?: Record<string, RuntimeSchema>
  isOptional?: () => boolean
}

function unwrap(schema: RuntimeSchema): RuntimeSchema {
  let current = schema
  for (;;) {
    const next =
      current._def.schema ?? current._def.innerType ?? current._def.in
    if (!next) return current
    current = next
  }
}

const names: Record<string, string> = {
  nemaSize: "NEMA frame",
  metricSize: "Metric size",
  module: "Module",
  toothCount: "Teeth",
  pressureAngle: "Pressure angle",
  faceWidth: "Face width",
  boreDiameter: "Bore diameter",
  hubDiameter: "Hub diameter",
  hubLength: "Hub length",
  radialSegments: "Radial segments",
  segmentsPerTurn: "Segments per turn",
  segmentsPerTooth: "Segments per tooth",
  backFace: "Rear face",
  wireConnection: "Wire connection",
  showThreads: "Show threads",
  holes: "Holes and slots",
  boardTopZ: "Board top Z",
  cableStartX: "Cable start X",
  cableStartY: "Cable start Y",
  cableStartZ: "Cable start Z",
  ratio: "Aspect ratio alias",
}

const friendly = (key: string) =>
  names[key] ??
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase())

const metadata: Record<
  ModelName,
  {
    name: string
    description: string
    category: string
    tags: string[]
    initialSpec: string
    initialValues: Record<string, unknown>
  }
> = {
  spurgear: {
    name: "Spur gear",
    category: "Gears",
    tags: ["gear", "involute", "teeth", "mechanical"],
    description:
      "An involute spur gear with configurable teeth, bore, hub, and backlash.",
    initialSpec: "spurgear",
    initialValues: {},
  },
  wormgear: {
    name: "Worm gear",
    category: "Gears",
    tags: ["gear", "worm", "screw", "helical", "mechanical"],
    description:
      "A single or multi-start worm screw, with left or right handed threads.",
    initialSpec: "wormgear",
    initialValues: {},
  },
  nema: {
    name: "NEMA motor",
    category: "Motors",
    tags: ["stepper", "motor", "nema8", "nema17", "nema23"],
    description:
      "A NEMA 8, 17, or 23 stepper motor with configurable shaft, mounts, and wires.",
    initialSpec: "nema17",
    initialValues: { nemaSize: 17 },
  },
  sheetmetal: {
    name: "Sheet metal",
    category: "Mechanical",
    tags: ["plate", "angle", "channel", "bracket", "hole", "slot"],
    description: "A plate, angle, or channel with positioned holes and slots.",
    initialSpec: "sheetmetal_plate_w30mm_l40mm",
    initialValues: { profile: "plate", width: 30, baseLength: 40 },
  },
  hexsocketbolt: {
    name: "Hex socket bolt",
    category: "Fasteners",
    tags: ["screw", "bolt", "allen", "metric", "fastener"],
    description:
      "A metric socket head cap screw with adjustable length and thread visibility.",
    initialSpec: "hexsocketbolt_m3_l12mm",
    initialValues: { metricSize: "M3", length: 12 },
  },
  flexscreen: {
    name: "Flex screen",
    category: "Displays",
    tags: ["display", "screen", "flex", "cable", "fold", "lcd"],
    description:
      "A display with a flexible ribbon cable, folding presets, and board references.",
    initialSpec: "flexscreen_w40mm_h30mm",
    initialValues: { width: 40, height: 30 },
  },
}

const placementKeys = ["offset", "rotation", "screenOffset", "screenRotation"]
const orientationKeys = [
  "orientation",
  "sitsFlat",
  "sitsFlatBelowBoard",
  "foldedToFaceAboveBoard",
  "foldedToFaceBelowBoard",
  "foldsAboveBoard",
  "foldsBelowBoard",
  "foldedToRightAngleAboveBoard",
  "foldedToRightAngleBelowBoard",
]

function group(fn: ModelName, key: string): string {
  if (placementKeys.includes(key) || key === "phase") return "Placement"
  if (/segments/i.test(key)) return "Resolution"
  if (fn === "spurgear" || fn === "wormgear") {
    if (/bore|hub/i.test(key)) return "Bore and hub"
    if (["pressureAngle", "backlash", "clearance"].includes(key))
      return "Tooth profile"
    return "Dimensions"
  }
  if (fn === "nema") {
    if (/^backFace/.test(key)) return "Rear face"
    if (/^wire/.test(key)) return "Wires"
    if (/^shaft/.test(key)) return "Shaft"
    if (/^mounting|^pilot/.test(key)) return "Mounting"
    return "Body"
  }
  if (fn === "flexscreen") {
    if (orientationKeys.includes(key)) return "Orientation"
    if (/color|^show/i.test(key)) return "Appearance"
    if (/^conductor|^exposed|^cableEdge/.test(key)) return "Conductors"
    if (/^board/.test(key)) return "Board reference"
    if (/^fold|^bend|^distance|^rightAngle/.test(key)) return "Fold geometry"
    if (/^flex|^cable|^stiffener/.test(key)) return "Flex cable"
    return "Screen"
  }
  return key === "holes" ? "Features" : "Dimensions"
}

function inferKind(schema: RuntimeSchema): ParameterDefinition["kind"] {
  switch (schema._def.typeName) {
    case "ZodNumber":
      return "number"
    case "ZodBoolean":
      return "boolean"
    case "ZodEnum":
      return "enum"
    case "ZodString":
      return "text"
    case "ZodUnion": {
      const options = schema._def.options!.map(unwrap)
      if (options.every((option) => option._def.typeName === "ZodLiteral"))
        return "enum"
      if (
        options.length === 2 &&
        options.some((option) => option._def.typeName === "ZodNumber") &&
        options.some((option) => option._def.typeName === "ZodString")
      )
        return "length"
      // The aspect-ratio union accepts 16:9, a number, or a JSON pair.
      return "text"
    }
    default:
      return "json"
  }
}

function describeParameter(
  fn: ModelName,
  key: string,
  wrapped: RuntimeSchema,
  resolvedDefaults: Record<string, unknown>,
): ParameterDefinition {
  const schema = unwrap(wrapped)
  const kind = inferKind(schema)
  const parameter: ParameterDefinition = {
    key,
    label: friendly(key),
    kind,
    optional: wrapped.isOptional?.() ?? false,
    group: group(fn, key),
    stringSupported: !(fn === "flexscreen" && placementKeys.includes(key)),
  }
  if (key in resolvedDefaults) parameter.default = resolvedDefaults[key]
  if (kind === "enum") {
    const values =
      schema._def.values ??
      schema._def.options!.map((option) => unwrap(option)._def.value!)
    parameter.options = values.map((value) => ({
      value,
      label: typeof value === "string" ? friendly(value) : String(value),
    }))
  }
  if (kind === "number") {
    for (const check of schema._def.checks ?? []) {
      if (check.kind === "min") parameter.min = check.value
      if (check.kind === "max") parameter.max = check.value
      if (check.kind === "int") parameter.step = 1
    }
    if (/angle|phase/i.test(key)) parameter.description = "Degrees"
  }
  if (kind === "length")
    parameter.description = "Millimeters, or a value with units such as 0.5in"
  if (["aspectRatio", "ratio"].includes(key))
    parameter.description = "16:9, 1.778, or [16, 9]"
  if (key === "radialSegments") {
    parameter.step = 4
    parameter.description = "Divisible by four"
  }
  if (key === "holes")
    parameter.description =
      'JSON array: [{"panel":"base","shape":"round","u":0,"v":0,"diameter":3}]'
  if (["offset", "screenOffset"].includes(key))
    parameter.description =
      'JSON coordinates in millimeters: {"x":0,"y":0,"z":0}'
  if (["rotation", "screenRotation"].includes(key))
    parameter.description = "JSON rotation: [0, 0, 0]"
  return parameter
}

export const modelCatalog: CatalogEntry[] = modelprinter
  .getModelNames()
  .map((name) => {
    const fn = name as ModelName
    const data = metadata[fn]
    const schema = modelSchemas[fn]
    if (!data || !schema) throw new Error(`Missing catalog adapter for ${name}`)
    const shape = unwrap(schema as unknown as RuntimeSchema).shape!
    const defaults = schema.parse(data.initialValues) as Record<string, unknown>
    // Seed inputs are examples, not upstream defaults. Optional fields remain absent,
    // which lets a NEMA frame change resolve its own dimensions again.
    const resolvedDefaults = Object.fromEntries(
      Object.entries(defaults).filter(([key]) => !(key in data.initialValues)),
    )
    return {
      id: `modelprinter:${fn}`,
      library: "modelprinter",
      fn,
      ...data,
      parameters: Object.entries(shape).map(([key, field]) =>
        describeParameter(fn, key, field, resolvedDefaults),
      ),
    }
  })
