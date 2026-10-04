/**
 * Generate controls from Footprinter's native schemas. Its npm bundle exports
 * generators but not schemas. Builds fetch the pinned source through the shared
 * source cache; an explicit local checkout remains useful while developing.
 *
 * FOOTPRINTER_SOURCE_PATH=../footprinter bun scripts/generate-footprint-catalog.ts
 */
import { readFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { createRequire } from "node:module"
import { getPinnedSource, sourcePins } from "./generate-model-examples"

const sourcePath = resolve(
  process.argv[2] ??
    process.env.FOOTPRINTER_SOURCE_PATH ??
    (await getPinnedSource("footprinter")),
)
// SOT-457's actual Zod schemas are private. Expose them only to this build-time
// process instead of maintaining another copy of their fields/defaults.
Bun.plugin({
  name: "footprinter-schema-exports",
  setup(build) {
    build.onLoad({ filter: /[/\\]sot457\.ts$/ }, async ({ path }) => ({
      contents: `${await readFile(path, "utf8")}\nexport { sot457DefSchema, sot457WaveSchema }\n`,
      loader: "ts",
    }))
  },
})
const sourceRequire = createRequire(resolve(sourcePath, "package.json"))
const source = (path: string) => import(resolve(sourcePath, path))
const { getFootprintNames, getFootprintSizes, fp } =
  await source("src/index.ts")
const { passive_def } = await source("src/helpers/passive-fn.ts")
const { base_def } = await source("src/helpers/zod/base_def.ts")
const { dim2d } = await source("src/helpers/zod/dim-2d.ts")
const { function_call } = await source("src/helpers/zod/function-call.ts")
const { pin1_location } = await source("src/helpers/zod/pin1-location.ts")
const { length, distance } = await import(sourceRequire.resolve("circuit-json"))
const { z } = await import(sourceRequire.resolve("zod"))
const { dpak_def } = await source("src/fn/dpak.ts")
const exampleOverrides: Record<string, string> = {
  res: "res0603",
  cap: "cap0603",
  led: "led0603",
  diode: "diode0603",
  fpc: "fpc6",
  jst: "jst6_sh",
  pad: "pad_w1mm_h1mm",
  vson: "vson8_grid1.5x2mm_p0.5mm_w1.075mm_pinw0.575mm_pinh0.35mm",
  solderjumper: "solderjumper2",
  mountedpcbmodule: "mountedpcbmodule_pinrow6",
}
function getShape(s: any): Record<string, any> {
  const d = s?._def
  if (!d) return {}
  if (d.typeName === "ZodObject") return s.shape
  if (d.typeName === "ZodIntersection")
    return { ...getShape(d.left), ...getShape(d.right) }
  for (const k of ["schema", "innerType", "in", "type"]) {
    if (d[k]?._def) {
      const shape = getShape(d[k])
      if (Object.keys(shape).length) return shape
    }
  }
  return {}
}
function describe(s: any): any {
  const def = s?._def
  if (!def) return { kind: "text" }
  if (s === length || s === distance) return { kind: "length", unit: "mm" }
  if (s === dim2d) return { kind: "dimensions", placeholder: "2x3" }
  if (s === function_call) return { kind: "list", placeholder: "(1,2,3)" }
  if (s === pin1_location)
    return { kind: "text", placeholder: "(leftside,top)" }
  let out: any = {}
  if (def.typeName === "ZodBoolean") out = { kind: "boolean" }
  else if (def.typeName === "ZodNumber")
    out = {
      kind: "number",
      integer: def.checks?.some((c: any) => c.kind === "int") || undefined,
      min: def.checks?.find((c: any) => c.kind === "min")?.value,
      max: def.checks?.find((c: any) => c.kind === "max")?.value,
    }
  else if (def.typeName === "ZodEnum" || def.typeName === "ZodNativeEnum")
    out = { kind: "enum", options: def.values }
  else if (def.typeName === "ZodLiteral")
    out = {
      kind:
        typeof def.value === "number"
          ? "number"
          : typeof def.value === "boolean"
            ? "boolean"
            : "enum",
      options: [def.value],
    }
  else if (def.typeName === "ZodUnion") {
    const alternatives = def.options.map(describe)
    if (alternatives.every((a: any) => a.options))
      out = {
        kind: "enum",
        options: alternatives.flatMap((a: any) => a.options),
      }
    else if (alternatives.some((a: any) => a.kind === "dimensions"))
      out = {
        kind: "dimensions",
        allowBoolean: alternatives.some((a: any) => a.kind === "boolean"),
        placeholder: "2x3",
      }
    else if (alternatives.some((a: any) => a.kind === "length"))
      out = { kind: "length", unit: "mm" }
    else if (alternatives.some((a: any) => a.kind === "list"))
      out = { kind: "list", placeholder: "(1,2,3)" }
    else if (alternatives.some((a: any) => a.kind === "number"))
      out = { kind: "number" }
    else out = { kind: "text" }
  } else if (def.typeName === "ZodArray")
    out = { kind: "list", placeholder: "(1,2,3)" }
  else if (def.typeName === "ZodTuple") out = { kind: "text" }
  else if (def.typeName === "ZodObject") out = { kind: "object" }
  else {
    for (const k of ["schema", "innerType", "in", "type"])
      if (def[k]?._def) {
        out = describe(def[k])
        break
      }
    if (!out.kind) out = { kind: "text" }
  }
  if (def.description) out.description = def.description
  if (def.typeName === "ZodDefault") out.sourceDefault = def.defaultValue()
  return out
}

// Canonical controls avoid presenting several inputs for the same native value.
const aliases: Record<string, string> = {
  lrpw: "leftrightpadwidth",
  lrpl: "leftrightpadlength",
  lrpins: "leftrightpins",
  tbpins: "topbottompins",
  surfacemount: "smd",
  x: "array",
}
const padAliases: Record<string, string> = {
  pd: "d",
  diameter: "d",
  r: "d",
  pr: "d",
  radius: "d",
  pw: "w",
  width: "w",
  ph: "h",
  height: "h",
  s: "w",
  size: "w",
}
const holeAliases: Record<string, string> = {
  hd: "d",
  r: "d",
  hr: "d",
  pr: "pd",
}
// These fields are admitted by a shared upstream schema, but the selected
// generator fixes or ignores them. Keep them in acceptedParameters for DSL
// imports; expose only options that can change this function's preview.
const unusedFields: Record<string, string[]> = {
  qfn: ["legsoutside"],
  qfp: ["legsoutside"],
  lqfp: ["legsoutside"],
  tqfp: ["legsoutside"],
  lcc: ["legsoutside"],
  mlp: ["legsoutside"],
  sop8: [
    "legsoutside",
    "pillpads",
    "thermalpad",
    "thermalpadcenteroffsetx",
    "thermalpadcenteroffsety",
    "silkscreen_stroke_width",
  ],
  dfn: [
    "legsoutside",
    "silkscreen_stroke_width",
    "bodywidth",
    "bodylength",
    "bodythickness",
    "standoff",
    "terminalinset",
    "terminallength",
    "terminalwidth",
    "terminalpitch",
    "terminalthickness",
    "pin1terminalchamfer",
    "pin1markwidth",
  ],
  sot457: ["pillr", "reflow"],
  pushbutton: ["od"],
  radial: ["ceramic", "electrolytic"],
  pinrow: ["pinlabeltextaligncenter"],
  headermodule: ["pinlabeltextaligncenter"],
  mountedpcbmodule: [
    "pinlabeltextaligncenter",
    "pinrow",
    "pinrowleft",
    "pinrowright",
    "pinrowtop",
    "pinrowbottom",
    "usbleft",
    "usbtop",
    "usbright",
    "usbbottom",
    "usbmicro",
    "usbc",
  ],
  ms012: ["num_pins"],
  ms013: ["num_pins"],
  to92l: ["num_pins"],
  sot23w: ["num_pins"],
  sot323: ["num_pins"],
  sot343: ["num_pins"],
  potentiometer: ["num_pins"],
  to220: ["p"],
  sod123: ["w"],
}
const diodePhysicalFields = [
  "bodyheight",
  "leadspan",
  "cathodelength",
  "cathodewidth",
  "anodelength",
  "anodewidth",
  "terminalthickness",
  "standoff",
  "taperinset",
  "markingwidth",
]
unusedFields.do219ad = diodePhysicalFields
unusedFields.sod323he = diodePhysicalFields

function relevantParameter(
  name: string,
  key: string,
  shape: Record<string, any>,
  circuit: any[],
  implementation: string,
): boolean {
  if (["fn", "string", name, "faceup"].includes(key)) return false
  if (unusedFields[name]?.includes(key)) return false
  const field = describe(shape[key])
  // A fixed literal is a schema invariant, not a setting the user can change.
  if (field.options?.length === 1) return false
  const alias =
    (name === "smtpad"
      ? padAliases[key]
      : name === "platedhole"
        ? holeAliases[key]
        : undefined) ?? aliases[key]
  if (alias && shape[alias]) return false
  if (key === "invert") return name === "pinrow" || name === "headermodule"
  if (key === "anodepin" || key === "cathodepin") {
    return /\.anodepin\b|\.cathodepin\b|createFabricationNoteDiodeFromCopperPads|createStandardFlatLeadDiode/.test(
      implementation,
    )
  }
  if (key === "norefdes")
    return circuit.some((element) => element.type === "pcb_silkscreen_text")
  if (key === "nosilkscreen")
    return circuit.some((element) => element.type.startsWith("pcb_silkscreen_"))
  if (key === "rounded")
    return (
      Boolean(shape.circularpads) ||
      circuit.some(
        (element) =>
          (element.type === "pcb_smtpad" &&
            ["rect", "rotated_rect"].includes(element.shape)) ||
          (element.type === "pcb_plated_hole" && "rect_pad_width" in element),
      )
    )
  if (key === "pin1location") {
    const pads = circuit.filter(
      (element) =>
        element.type === "pcb_smtpad" || element.type === "pcb_plated_hole",
    )
    return (
      pads.length > 1 &&
      pads.some((pad) =>
        pad.port_hints?.some((hint: unknown) =>
          /^(?:pin)?1$/i.test(String(hint)),
        ),
      )
    )
  }
  if (key === "nonpolarized") return name === "res"
  if (["res", "cap", "led", "diode"].includes(name) && ["w", "h"].includes(key))
    return false
  if (key === "roundedPads" && name === "diode") return false // diode fixes this to true
  if (key === "cc" || key === "ccw" || key === "tlorigin") return false // accepted but never changes native output
  return true
}

const output = []
for (const name of getFootprintNames()) {
  const module = await source(`src/fn/${name}.ts`)
  const schemaEntries = Object.entries(module).filter(
    ([k, s]: any) =>
      (k.endsWith("_def") || k.endsWith("Schema") || k === "default") &&
      s?._def,
  )
  let schema: any =
    schemaEntries.find(([k]) => k === `${name}_def`)?.[1] ??
    schemaEntries[0]?.[1]
  if (["res", "cap", "diode", "led"].includes(name)) schema = passive_def
  if (["d2pak", "to252", "to263"].includes(name)) schema = dpak_def
  let shape = getShape(schema)
  // Include variant schemas (for example wave/reflow SOT-457) without adding
  // controls from other footprint functions.
  for (const [, variant] of schemaEntries)
    shape = { ...getShape(variant), ...shape }
  if (name === "solderjumper")
    shape = {
      ...base_def.shape,
      num_pins: z.union([z.literal(2), z.literal(3)]).default(2),
      bridged: z.string().optional(),
      p: length.default(2.54),
      pw: length.default(1.5),
      ph: length.default(1.5),
    }
  if (name === "dfn")
    shape = {
      ...shape,
      cornerpads: z.boolean().optional(),
      cornerpadcutlength: length.optional(),
      missing: function_call.optional(),
    }
  if (name === "res")
    shape = { ...shape, array: z.number().optional(), x: z.number().optional() }
  if (name === "jst") shape = { ...shape, num_pins: z.number() }
  if (!Object.keys(shape).length)
    throw new Error(
      `No native parameter schema or documented input adapter for ${name}`,
    )
  // Origin is processed globally by Footprinter even where the per-function schema strips it.
  if (!shape.origin)
    shape = {
      ...shape,
      origin: z
        .enum([
          "center",
          "bottomleft",
          "pin1",
          "bottomcenter",
          "topcenter",
          "leftcenter",
          "rightcenter",
        ])
        .optional(),
    }
  const example = exampleOverrides[name] ?? name
  const generated = fp.string(example)
  const resolved: any = generated.json()
  const circuit = generated.circuitJson()
  if (
    !circuit.some(
      (e: any) => e.type === "pcb_smtpad" || e.type === "pcb_plated_hole",
    )
  )
    throw new Error(`${name} has no copper`)
  const implementation = await readFile(
    resolve(sourcePath, `src/fn/${name}.ts`),
    "utf8",
  )
  const parameters = Object.entries(shape)
    .filter(([key]) =>
      relevantParameter(name, key, shape, circuit, implementation),
    )
    .map(([key, s]: any) => {
      let required = false
      try {
        required = !s.safeParse(undefined).success
      } catch {}
      const info = describe(s)
      if (
        (info.kind === "text" || info.kind === "number") &&
        (info.sourceDefault?.endsWith?.("mm") ||
          resolved[key]?.endsWith?.("mm"))
      )
        (info.kind = "length"), (info.unit = "mm")
      if (
        ["res", "cap", "diode", "led"].includes(name) &&
        ["metric", "imperial"].includes(key)
      ) {
        info.kind = "enum"
        info.options = getFootprintSizes().map((s: any) => s[key])
        delete info.unit
      }
      if (["res", "cap", "diode", "led"].includes(name) && key === "tht")
        required = false
      return {
        key,
        ...info,
        required,
        resolvedDefault:
          info.options && !info.options.includes(resolved[key])
            ? undefined
            : resolved[key],
      }
    })
  output.push({
    name,
    example,
    acceptedParameters: Object.keys(shape),
    parameters,
  })
}
const packageInfo = JSON.parse(
  await readFile(resolve(sourcePath, "package.json"), "utf8"),
)
// Cached archives live inside this app's Git checkout. Git would walk up and
// report the app revision, so prefer the archive's recorded source revision.
const archiveCommit = await readFile(
  resolve(sourcePath, ".source-commit"),
  "utf8",
)
  .then((value) => value.trim())
  .catch(() => undefined)
const repositoryRoot = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
  cwd: sourcePath,
})
const revision =
  repositoryRoot.exitCode === 0 &&
  repositoryRoot.stdout.toString().trim() === sourcePath
    ? Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: sourcePath })
    : undefined
const commit =
  archiveCommit ??
  (revision?.exitCode === 0
    ? revision.stdout.toString().trim()
    : sourcePins.footprinter.commit)
const destination = resolve(
  dirname(import.meta.path),
  "../src/lib/footprint-parameters.json",
)
await Bun.write(
  destination,
  JSON.stringify(
    {
      source: {
        package: packageInfo.name,
        version: packageInfo.version,
        commit,
      },
      functions: output,
    },
    null,
    2,
  ) + "\n",
)
console.log(
  output.length,
  "functions",
  output.reduce((n, f) => n + f.parameters.length, 0),
  "parameters",
)
