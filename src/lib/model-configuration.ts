import { modelAdapters } from "./model-adapters"
import {
  adapterFor,
  adapterInput,
  serializeAdapter,
} from "./model-adapters/configuration"
import {
  flexScreenModelPropsSchema,
  nemaMotorModelPropsSchema,
  hexSocketBoltModelPropsSchema,
  hexBoltModelPropsSchema,
  sheetMetalModelPropsSchema,
  spurGearModelPropsSchema,
  helicalGearModelPropsSchema,
  wormGearModelPropsSchema,
  modelprinter,
} from "@tscircuit/modelprinter"
import type { CatalogEntry, Configuration } from "./catalog-types"

export const modelSchemas = {
  ...(Object.fromEntries(
    Object.entries(modelAdapters).map(([name, adapter]) => [
      name,
      adapter.schema,
    ]),
  ) as {
    [Name in keyof typeof modelAdapters]: (typeof modelAdapters)[Name]["schema"]
  }),
  flexscreen: flexScreenModelPropsSchema,
  nema: nemaMotorModelPropsSchema,
  hexsocketbolt: hexSocketBoltModelPropsSchema,
  hexbolt: hexBoltModelPropsSchema,
  sheetmetal: sheetMetalModelPropsSchema,
  spurgear: spurGearModelPropsSchema,
  helicalgear: helicalGearModelPropsSchema,
  wormgear: wormGearModelPropsSchema,
}
export type ModelName = keyof typeof modelSchemas

export const lengthTokens: Record<ModelName, Record<string, string>> = {
  ...(Object.fromEntries(
    Object.entries(modelAdapters).map(([name, adapter]) => [
      name,
      adapterFor(name)!.lengths ?? {},
    ]),
  ) as Record<keyof typeof modelAdapters, Record<string, string>>),
  helicalgear: {
    module: "m",
    faceWidth: "w",
    backlash: "backlash",
    clearance: "clearance",
    boreDiameter: "bore",
    hubDiameter: "hubdiameter",
    hubLength: "hublength",
  },
  spurgear: {
    module: "m",
    faceWidth: "w",
    backlash: "backlash",
    clearance: "clearance",
    boreDiameter: "bore",
    hubDiameter: "hubdiameter",
    hubLength: "hublength",
  },
  wormgear: {
    module: "m",
    pitchDiameter: "d",
    length: "l",
    boreDiameter: "bore",
    backlash: "backlash",
    clearance: "clearance",
  },
  hexsocketbolt: { length: "l" },
  hexbolt: {
    length: "l",
    diameter: "diameter",
    threadPitch: "threadpitch",
    headAcrossFlats: "headacrossflats",
    headHeight: "headheight",
    underHeadRadius: "underheadradius",
    tipChamfer: "tipchamfer",
    threadRootDiameter: "threadrootdiameter",
    threadPitchDiameter: "threadpitchdiameter",
    headCornerDiameter: "headcornerdiameter",
    headChamferDiameter: "headchamferdiameter",
  },
  sheetmetal: {
    width: "w",
    baseLength: "l",
    flangeHeight: "h",
    thickness: "t",
    insideBendRadius: "r",
  },
  nema: {
    wireLength: "wirelength",
    wireDiameter: "wirediameter",
    bodyLength: "bodylength",
    bodyWidth: "bodywidth",
    backFaceHoleSpacing: "backholespacing",
    backFaceHoleDiameter: "backholediameter",
    backFaceHoleDepth: "backholedepth",
    shaftLength: "shaftlength",
    shaftDiameter: "shaftdiameter",
    shaftFlatDepth: "flatdepth",
    shaftFlatLength: "flatlength",
    mountingHoleSpacing: "holespacing",
    mountingHoleDiameter: "holediameter",
    mountingHoleDepth: "holedepth",
    pilotDiameter: "pilotdiameter",
    pilotLength: "pilotlength",
    frontCapLength: "frontcap",
    rearCapLength: "rearcap",
    faceCornerChamfer: "facechamfer",
    bodyCornerChamfer: "bodychamfer",
  },
  flexscreen: {
    width: "w",
    height: "h",
    diagonal: "diag",
    defaultDiagonal: "defaultdiagonal",
    screenThickness: "screenthickness",
    bezelInset: "bezelinset",
    bezelDepth: "bezeldepth",
    activeAreaWidth: "activeareawidth",
    activeAreaHeight: "activeareaheight",
    flexCableLength: "flex",
    flexCableWidth: "flexwidth",
    flexCableThickness: "flexthickness",
    conductorPitch: "conductorpitch",
    conductorWidth: "conductorwidth",
    conductorThickness: "conductorthickness",
    cableEdgeMargin: "cableedgemargin",
    exposedContactLength: "exposedcontactlength",
    stiffenerLength: "stiffenerlength",
    stiffenerThickness: "stiffenerthickness",
    bendRadius: "bendradius",
    rightAngleVerticalLead: "rightangleverticallead",
    distanceAboveBoard: "distanceabove",
    distanceBelowBoard: "distancebelow",
    foldDistanceFromConnector: "folddistance",
    foldOutset: "outset",
    screenGap: "screengap",
    boardTopZ: "boardtopz",
    boardThickness: "boardthickness",
    boardClearance: "boardclearance",
    cableStartX: "cablestartx",
    cableStartY: "cablestarty",
    cableStartZ: "cablestartz",
    cableLateralOffset: "lateraloffset",
  },
}
const numberTokens: Partial<Record<ModelName, Record<string, string>>> = {
  hexbolt: {
    headChamferAngle: "headchamferangle",
    tipChamferAngle: "tipchamferangle",
    threadFlankAngle: "threadflankangle",
  },
  helicalgear: {
    pressureAngle: "pa",
    helixAngle: "ha",
    phase: "phase",
    segmentsPerTooth: "segments",
    segmentsPerTurn: "turnsegments",
  },
  nema: {
    wireCount: "wirecount",
    wireSideAngle: "wireangle",
    shaftFlatAngle: "flatangle",
  },
  spurgear: {
    pressureAngle: "pa",
    phase: "phase",
    segmentsPerTooth: "segments",
  },
  wormgear: {
    starts: "starts",
    pressureAngle: "pa",
    phase: "phase",
    radialSegments: "segments",
    segmentsPerTurn: "turnsegments",
  },
  flexscreen: {
    conductorCount: "conductors",
    bendSegments: "bendsegments",
    foldSegments: "foldsegments",
  },
}
const enumTokens: Partial<
  Record<ModelName, Record<string, Record<string, string>>>
> = {
  hexbolt: {
    standard: {
      iso4017: "standard(iso4017)",
      "iso4017:2014": "standard(iso4017:2014)",
    },
    thread: { full: "fullthread" },
    drive: { hex: "hex" },
    threadHand: {
      right: "",
      left: "lefthanded",
    },
    threadClass: { "6g": "threadclass(6g)" },
    threadGender: { male: "" },
  },
  nema: {
    backFace: {
      plain: "plainbackface",
      holes: "backfaceholes",
      screws: "backfacescrews",
    },
    wireConnection: {
      none: "nowires",
      stubs: "wirestubs",
      "jst-ph-6": "jstph6",
    },
    shaftShape: { round: "round", d: "dshaft" },
  },
  flexscreen: {
    orientation: {
      sitsFlat: "sitsflat",
      sitsFlatBelowBoard: "sitsflatbelow",
      foldedToFaceAboveBoard: "foldsabove",
      foldedToFaceBelowBoard: "foldsbelow",
      foldedToRightAngleAboveBoard: "rightangleabove",
      foldedToRightAngleBelowBoard: "rightanglebelow",
    },
  },
}
const booleanTokens: Partial<
  Record<ModelName, Record<string, [string, string]>>
> = {
  nema: { mountingHoleThrough: ["throughholes", "blindholes"] },
  hexsocketbolt: { showThreads: ["threads", "nothreads"] },
  hexbolt: { showThreads: ["threads", "nothreads"] },
  flexscreen: {
    showScreen: ["showscreen", "hidescreen"],
    showFlexCable: ["showflex", "hideflex"],
    showConductors: ["showconductors", "hideconductors"],
    showStiffeners: ["showstiffeners", "hidestiffeners"],
  },
}
const colorTokens: Record<string, string> = {
  screenColor: "screencolor",
  bezelColor: "bezelcolor",
  flexCableColor: "flexcolor",
  conductorColor: "conductorcolor",
  stiffenerColor: "stiffenercolor",
}
const shortcutTokens: Record<string, string> = {
  sitsFlat: "sitsflat",
  sitsFlatBelowBoard: "sitsflatbelow",
  foldedToFaceAboveBoard: "foldsabove",
  foldsAboveBoard: "foldsabove",
  foldedToFaceBelowBoard: "foldsbelow",
  foldsBelowBoard: "foldsbelow",
  foldedToRightAngleAboveBoard: "rightangleabove",
  foldedToRightAngleBelowBoard: "rightanglebelow",
}

const inputAliases: Partial<Record<ModelName, Record<string, string>>> = {
  helicalgear: {
    teeth: "toothCount",
    width: "faceWidth",
    right: "handedness",
    left: "handedness",
  },
  nema: {
    l: "bodyLength",
    length: "bodyLength",
    backscrewm: "backFaceScrewSize",
  },
  spurgear: { teeth: "toothCount", width: "faceWidth" },
  hexsocketbolt: { m: "metricSize" },
  hexbolt: {
    m: "metricSize",
    metricsize: "metricSize",
    d: "diameter",
    headh: "headHeight",
    af: "headAcrossFlats",
  },
  sheetmetal: {
    plate: "profile",
    angle: "profile",
    channel: "profile",
    hole: "holes",
    slot: "holes",
  },
  wormgear: { right: "handedness", left: "handedness" },
  flexscreen: {
    d: "diagonal",
    defaultdiag: "defaultDiagonal",
    activew: "activeAreaWidth",
    activeh: "activeAreaHeight",
    flexlength: "flexCableLength",
    edgemargin: "cableEdgeMargin",
    contactlength: "exposedContactLength",
    verticallead: "rightAngleVerticalLead",
    distanceaboveboard: "distanceAboveBoard",
    distancebelowboard: "distanceBelowBoard",
    foldstart: "foldDistanceFromConnector",
    sitsflatbelowboard: "orientation",
    foldsaboveboard: "orientation",
    foldsbelowboard: "orientation",
    foldedtofaceaboveboard: "orientation",
    foldedtofacebelowboard: "orientation",
    rightangleaboveboard: "orientation",
    rightanglebelowboard: "orientation",
    foldedtorightangleaboveboard: "orientation",
    foldedtorightanglebelowboard: "orientation",
    ratio: "aspectRatio",
  },
}

/** Keep explicit DSL input separate from resolved defaults when importing a string. */
export function modelInputFromSpec(spec: string): {
  fn: ModelName
  values: Record<string, unknown>
} {
  const builder = modelprinter.string(spec)
  const { fn: name, ...parsed } = builder.json()
  const fn = name as ModelName
  const adapter = adapterFor(fn)
  if (adapter) return { fn, values: adapterInput(spec, adapter) }
  const raw = builder.params()
  const definition = parsed as Record<string, unknown>
  const tokenToProperty: Record<string, string> = { ...inputAliases[fn] }
  for (const [key, token] of Object.entries({
    ...lengthTokens[fn],
    ...numberTokens[fn],
  })) {
    tokenToProperty[token] = key
    tokenToProperty[key.toLowerCase()] = key
  }
  for (const [key, flags] of Object.entries(booleanTokens[fn] ?? {})) {
    for (const flag of flags) tokenToProperty[flag] = key
  }
  for (const [key, options] of Object.entries(enumTokens[fn] ?? {})) {
    tokenToProperty[key.toLowerCase()] = key
    for (const token of Object.values(options))
      tokenToProperty[token.replace(/\d+$/, "")] = key
  }
  if (fn === "flexscreen") {
    for (const [key, token] of Object.entries(colorTokens))
      tokenToProperty[token] = key
    if (raw.distance !== undefined)
      tokenToProperty.distance =
        definition.orientation === "foldedToFaceAboveBoard"
          ? "distanceAboveBoard"
          : "distanceBelowBoard"
  }
  const values: Record<string, unknown> = {}
  if (fn === "nema") values.nemaSize = definition.nemaSize
  if ((fn === "spurgear" || fn === "helicalgear") && raw.num_pins !== undefined)
    values.toothCount = definition.toothCount
  for (const token of Object.keys(raw)) {
    const key = tokenToProperty[token]
    if (key && definition[key] !== undefined) values[key] = definition[key]
  }
  return { fn, values }
}

/** Model string numbers use decimal notation; the upstream grammar rejects exponents. */
function decimal(value: number): string {
  const [coefficient, exponent] = String(value).toLowerCase().split("e")
  if (exponent === undefined) return coefficient!
  const negative = coefficient!.startsWith("-")
  const unsigned = negative ? coefficient!.slice(1) : coefficient!
  const [integer, fraction = ""] = unsigned.split(".")
  const digits = integer! + fraction
  const point = integer!.length + Number(exponent)
  const expanded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`
  return negative ? `-${expanded}` : expanded
}

export function serializeModelInput(
  fn: ModelName,
  input: Record<string, unknown>,
): string {
  const adapter = adapterFor(fn)
  if (adapter) return serializeAdapter(fn, input, adapter, decimal)
  const props = modelSchemas[fn].parse(input) as Record<string, any>
  const tokens = [
    fn === "nema"
      ? `nema${props.nemaSize}`
      : fn === "spurgear" || fn === "helicalgear"
        ? `${fn}${props.toothCount}`
        : fn,
  ]
  // Emit only supplied fields; schema/parser defaults retain their upstream semantics.
  for (const key of Object.keys(input)) {
    const value = props[key]
    if (
      fn === "flexscreen" &&
      key === "orientation" &&
      Object.keys(shortcutTokens).some((shortcut) => props[shortcut] === true)
    )
      continue
    if (value === undefined || ["nemaSize", "toothCount"].includes(key))
      continue
    const length = lengthTokens[fn][key]
    const numeric = numberTokens[fn]?.[key]
    const flag = booleanTokens[fn]?.[key]
    const selection = enumTokens[fn]?.[key]
    if (length) tokens.push(`${length}${decimal(value)}mm`)
    else if (numeric) tokens.push(`${numeric}${decimal(value)}`)
    else if (flag) tokens.push(flag[value ? 0 : 1])
    else if (selection) {
      const token = selection[String(value)]!
      if (token) tokens.push(token)
    } else if (
      (fn === "hexsocketbolt" || fn === "hexbolt") &&
      key === "metricSize"
    )
      tokens.push(`m${value.slice(1)}`)
    else if (fn === "nema" && key === "backFaceScrewSize")
      tokens.push(`backscrewm${value.slice(1)}`)
    else if (
      (fn === "wormgear" || fn === "helicalgear") &&
      key === "handedness"
    )
      tokens.push(value)
    else if (fn === "sheetmetal" && key === "profile") tokens.push(value)
    else if (fn === "sheetmetal" && key === "holes") {
      for (const [index, hole] of value.entries()) {
        const base = hole.panel === "base"
        const face = base
          ? "bottomface"
          : hole.panel === "left"
            ? "leftface"
            : props.profile === "angle"
              ? "angledface"
              : "rightface"
        const horizontal = base
          ? hole.u
          : hole.v * (hole.panel === "left" ? -1 : 1)
        const vertical = base ? hole.v : hole.u
        const feature = [
          hole.shape === "round"
            ? `d${decimal(hole.diameter)}mm`
            : `l${decimal(hole.length)}mm_w${decimal(hole.width)}mm`,
          face,
        ]
        if (horizontal)
          feature.push(
            `${horizontal > 0 ? "rightofcenter" : "leftofcenter"}${decimal(Math.abs(horizontal))}mm`,
          )
        if (vertical)
          feature.push(
            `${vertical > 0 ? "abovecenter" : "belowcenter"}${decimal(Math.abs(vertical))}mm`,
          )
        if (hole.shape === "slot")
          feature.push(
            (base && hole.axis === "u") || (!base && hole.axis === "v")
              ? "horizontal"
              : "vertical",
          )
        tokens.push(
          `${hole.shape === "round" ? "hole" : "slot"}${index + 1}(${feature.join("_")})`,
        )
      }
    } else if (fn === "flexscreen" && ["aspectRatio", "ratio"].includes(key)) {
      if (key === "ratio" && input.aspectRatio !== undefined) continue
      tokens.push(
        `ratio${Array.isArray(value) ? value.join("x") : String(value).replace(":", "x")}`,
      )
    } else if (fn === "flexscreen" && key in colorTokens)
      tokens.push(`${colorTokens[key]}(${value})`)
    else if (fn === "flexscreen" && key in shortcutTokens) {
      if (value) tokens.push(shortcutTokens[key]!)
    } else
      throw new Error(
        `The ${fn} string grammar cannot encode ${key}; use the JSON definition for this parameter.`,
      )
  }
  const result = tokens.join("_")
  modelprinter.string(result).json() // Upstream is final authority on token and geometry contract.
  return result
}

const componentNames: Record<ModelName, string> = {
  ...(Object.fromEntries(
    Object.entries(modelAdapters).map(([name, adapter]) => [
      name,
      adapter.componentName,
    ]),
  ) as Record<keyof typeof modelAdapters, string>),
  flexscreen: "FlexScreen",
  nema: "NemaMotor",
  hexsocketbolt: "HexSocketBolt",
  hexbolt: "HexBolt",
  sheetmetal: "SheetMetal",
  spurgear: "SpurGear",
  helicalgear: "HelicalGear",
  wormgear: "WormGear",
}
const placementKeys = ["offset", "rotation", "screenOffset", "screenRotation"]

/** Validate using upstream schemas; JSON-only properties still reach the live renderer. */
export function configureModel(
  entry: CatalogEntry,
  values: Record<string, unknown>,
): Configuration {
  const fn = entry.fn as ModelName
  const schema = modelSchemas[fn]
  if (!schema) throw new Error(`Unsupported model function: ${entry.fn}`)
  const input = Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  )
  for (const parameter of entry.parameters) {
    if (parameter.kind === "json" && typeof input[parameter.key] === "string") {
      try {
        input[parameter.key] = JSON.parse(input[parameter.key] as string)
      } catch {
        throw new Error(`${parameter.label}: enter valid JSON`)
      }
    }
  }
  if (fn === "flexscreen") {
    for (const key of ["aspectRatio", "ratio"]) {
      const value = input[key]
      if (
        typeof value === "string" &&
        /^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
      )
        input[key] = Number(value)
      else if (typeof value === "string" && value.startsWith("[")) {
        try {
          input[key] = JSON.parse(value)
        } catch {
          throw new Error("Aspect ratio: enter a ratio such as 16:9")
        }
      } else if (typeof value === "string") input[key] = value.replace("x", ":")
    }
  }
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new Error(
      result.error.issues
        .map((issue) => {
          const [key, ...nested] = issue.path
          const label = entry.parameters.find(
            (parameter) => parameter.key === key,
          )?.label
          return `${label ? `${label}${nested.length ? ` (${nested.join(".")})` : ""}: ` : ""}${issue.message}`
        })
        .join("; "),
    )
  }
  const parsed = result.data as Record<string, unknown>
  const representable = { ...input }
  let hasPlacement = false
  let hasOtherJsonOnly = false
  if (fn === "flexscreen") {
    for (const key of placementKeys) {
      if (representable[key] !== undefined) hasPlacement = true
      delete representable[key]
    }
    for (const key of Object.keys(colorTokens)) {
      if (
        typeof representable[key] === "string" &&
        /[()]/.test(representable[key] as string)
      ) {
        hasOtherJsonOnly = true
        delete representable[key]
      }
    }
  }
  const spec = serializeModelInput(fn, representable)
  const warnings = [
    ...(hasPlacement ? ["Placement settings are available in JSX/JSON"] : []),
    ...(hasOtherJsonOnly
      ? ["Some color settings are available in JSX/JSON"]
      : []),
  ]
  const component = componentNames[fn]
  const code = warnings.length
    ? `import { ${component} } from "jscad-electronics"\n\nconst props = ${JSON.stringify(parsed, null, 2)}\n\n<${component} {...props} />`
    : `import { modelprinter } from "@tscircuit/modelprinter"\n\nconst model = modelprinter.string(${JSON.stringify(spec)}).json()`
  return {
    spec,
    values: parsed,
    code,
    ...(warnings.length ? { warnings } : {}),
  }
}
