/**
 * Generate controls from Footprinter's native schemas. Its npm bundle exports
 * generators but not schemas, so regeneration needs a source checkout with
 * dependencies installed. No source checkout is needed to build this app.
 *
 * FOOTPRINTER_SOURCE_PATH=../footprinter bun scripts/generate-footprint-catalog.ts
 */
import { readFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { createRequire } from "node:module"

const sourcePath = resolve(
  process.argv[2] ?? process.env.FOOTPRINTER_SOURCE_PATH ?? "../footprinter",
)
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
const output = []
for (const name of getFootprintNames()) {
  const module = await source(`src/fn/${name}.ts`)
  const schemaEntries = Object.entries(module).filter(
    ([k, s]: any) => (k.endsWith("_def") || k === "default") && s?._def,
  )
  let schema: any =
    schemaEntries.find(([k]) => k === `${name}_def`)?.[1] ??
    schemaEntries[0]?.[1]
  if (["res", "cap", "diode", "led"].includes(name)) schema = passive_def
  if (["d2pak", "to252", "to263"].includes(name)) schema = dpak_def
  let shape = getShape(schema)
  if (!Object.keys(shape).length) shape = { ...base_def.shape }
  if (name === "solderjumper")
    shape = {
      ...shape,
      num_pins: z.union([z.literal(2), z.literal(3)]).default(2),
      bridged: z.string().optional(),
      p: z.number().default(2.54),
      pw: z.number().default(1.5),
      ph: z.number().default(1.5),
    }
  if (name === "sot457")
    shape = {
      ...shape,
      num_pins: z.literal(6).default(6),
      pillh: length.default("0.45mm"),
      pillw: length.default("1.45mm"),
      pl: length.default("0.8mm"),
      pw: length.default("0.55mm"),
      p: length.default("0.95mm"),
      h: length.default("2.5mm"),
      w: length.default("2.7mm"),
      pillr: length.optional(),
      wave: z.boolean().optional(),
      reflow: z.boolean().optional(),
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
  const parameters = Object.entries(shape)
    .filter(([key]) => !["fn", "string", name, "faceup"].includes(key))
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
  output.push({ name, example, parameters })
}
const packageInfo = JSON.parse(
  await readFile(resolve(sourcePath, "package.json"), "utf8"),
)
const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: sourcePath })
  .stdout.toString()
  .trim()
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
