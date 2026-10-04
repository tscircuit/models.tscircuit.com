import {
  fp,
  getFootprintNames,
  getFootprintSizes,
  type Footprinter,
} from "@tscircuit/footprinter"
import type { CatalogEntry, Configuration } from "./catalog-types"

type Values = Record<string, unknown>
const passiveFunctions = new Set(["res", "cap", "led", "diode"])
const sizeDimensions = new Set(["p", "pw", "ph", "w", "h", "cyw", "cyh"])

/** Resolve normalized aliases and validate the spec without freezing derived defaults. */
export function footprintInputFromSpec(spec: string): {
  fn: string
  values: Values
} {
  const builder = fp.string(spec.trim())
  const fn = (builder.params() as Values).fn
  if (typeof fn !== "string" || !getFootprintNames().includes(fn)) {
    throw new Error("Choose a supported footprint function.")
  }
  builder.json()
  // Keep the DSL as the base spec; only later GUI edits become explicit values.
  return { fn, values: {} }
}

function explicitValues(values: Values): Values {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  )
}

function passiveDimensions(parameters: Values): Values | undefined {
  const sizes = getFootprintSizes()
  const selected =
    parameters.imperial !== undefined
      ? sizes.find(
          (size) =>
            size.imperial === String(parameters.imperial).split(/[_x]/)[0],
        )
      : sizes.find((size) => size.metric === String(parameters.metric))
  if (!selected) return undefined
  return {
    p: selected.p_mm_min,
    pw: selected.pw_mm_min,
    ph: selected.ph_mm_min,
    w: selected.w_mm_min,
    h: selected.h_mm_min,
    ...(selected.courtyard_width_mm
      ? { cyw: selected.courtyard_width_mm }
      : {}),
    ...(selected.courtyard_height_mm
      ? { cyh: selected.courtyard_height_mm }
      : {}),
  }
}

function applyValues(builder: Footprinter, fn: string, values: Values): void {
  const raw = builder.params() as Values
  const effectiveValues = { ...values }
  const canonicalAliases: Record<string, string[]> = {
    leftrightpadwidth: ["lrpw"],
    leftrightpadlength: ["lrpl"],
    leftrightpins: ["lrpins"],
    topbottompins: ["tbpins"],
    smd: ["surfacemount"],
    array: ["x"],
    numPins: ["pinrow"],
  }
  if (fn === "smtpad")
    Object.assign(canonicalAliases, {
      d: ["pd", "diameter", "r", "pr", "radius"],
      w: ["pw", "width", "s", "size"],
      h: ["ph", "height"],
    })
  if (fn === "platedhole")
    Object.assign(canonicalAliases, { d: ["hd", "r", "hr"], pd: ["pr"] })
  if (fn === "mountedpcbmodule")
    Object.assign(canonicalAliases, {
      pinRowSide: ["pinrowleft", "pinrowright", "pinrowtop", "pinrowbottom"],
      usbposition: ["usbleft", "usbtop", "usbright", "usbbottom"],
      usbtype: ["usbmicro", "usbc"],
    })
  for (const [canonical, aliases] of Object.entries(canonicalAliases)) {
    if (values[canonical] === undefined) continue
    for (const alias of aliases) {
      delete raw[alias]
      delete effectiveValues[alias]
    }
  }
  if (values.metric !== undefined) delete raw.imperial
  if (values.imperial !== undefined) delete raw.metric
  if (fn === "mountedpcbmodule" && values.numPins !== undefined)
    delete raw.pinrow
  for (const [key, value] of Object.entries(effectiveValues)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`${key} must be a finite number.`)
    }
    const minimumCount = fn === "mountedpcbmodule" ? 0 : 1
    if (
      (key === "num_pins" || key === "numPins") &&
      (typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < minimumCount ||
        value > 1024)
    ) {
      throw new Error(
        `Pin count must be an integer from ${minimumCount} to 1024.`,
      )
    }
    const exclusiveFlags =
      fn === "jst"
        ? ["sh", "ph", "zh", "xh", "smd"]
        : fn === "smtpad"
          ? ["circle", "square", "rect", "pill"]
          : []
    if (value === true && exclusiveFlags.includes(key)) {
      for (const flag of exclusiveFlags) if (flag !== key) delete raw[flag]
    }
    const setter = (
      builder as unknown as Record<string, (value: unknown) => Footprinter>
    )[key]
    setter(value)
  }
  // Passive sizes take precedence over individual dimensions inside Footprinter.
  // Expand the selected preset before clearing it, so editing one dimension keeps
  // the remaining dimensions of the selected size instead of losing required pads.
  if (
    passiveFunctions.has(fn) &&
    Object.keys(values).some((key) => sizeDimensions.has(key))
  ) {
    const preset = passiveDimensions(raw)
    if (preset) {
      for (const [key, value] of Object.entries(preset)) {
        if (values[key] === undefined) raw[key] = value
      }
      delete raw.imperial
      delete raw.metric
    }
  }
}

/** Apply GUI values as typed API arguments, including false and exact key casing. */
export function createConfiguredFootprint(
  fn: string,
  spec: string,
  values: Values,
): Footprinter {
  let builder = fp.string(spec)
  const selectedFn = (builder.params() as Values).fn
  if (selectedFn !== fn)
    throw new Error(
      `Expected a ${fn} footprint, but the spec selects ${String(selectedFn)}.`,
    )
  if (values.num_pins !== undefined) {
    // Several package variants read their count from the source string after
    // parsing. Updating only the Proxy's num_pins leaves their old geometry.
    const normalized = String((builder.params() as Values).string ?? spec)
    const [, ...parts] = normalized.split(/_(?!metric)/)
    if (/^\d+$/.test(parts[0] ?? "")) parts.shift()
    const head =
      /\d/.test(fn) || fn === "potentiometer"
        ? `${fn}_${String(values.num_pins)}`
        : `${fn}${String(values.num_pins)}`
    builder = fp.string([head, ...parts].join("_"))
  }
  applyValues(builder, fn, explicitValues(values))
  return builder
}

function bestSpec(fn: string, raw: Values, resolved: Values): string {
  let head = fn
  if (passiveFunctions.has(fn)) {
    if (raw.imperial !== undefined) head = `${fn}${String(raw.imperial)}`
    else if (raw.metric !== undefined)
      head = `${fn}${String(raw.metric)}_metric`
  } else {
    const count = raw.num_pins ?? resolved.num_pins
    if (typeof count === "number")
      head =
        /\d$/.test(fn) || fn === "d2pak" ? `${fn}_${count}` : `${fn}${count}`
  }
  const parts = [head]
  for (const [key, value] of Object.entries(raw)) {
    if (
      ["fn", "string", fn, "num_pins", "imperial", "metric", "origin"].includes(
        key,
      ) ||
      value === undefined ||
      value === false
    )
      continue
    if (!/^(?:[a-z]+|p\d+[a-z]+|pin1[a-z]+)$/.test(key)) continue
    if (value === true) parts.push(key)
    else if (typeof value === "number") parts.push(`${key}${value}`)
    else if (typeof value === "string") {
      if (/^[\d.\-+(]/.test(value)) parts.push(`${key}${value}`)
      else if (key === "pinnumbering") parts.push(`${key}(${value})`)
    } else if (Array.isArray(value)) parts.push(`${key}(${value.join(",")})`)
  }
  return parts.join("_")
}

function fluentCode(spec: string, configured: Footprinter): string {
  const configuredParameters = configured.params() as Values
  const codeSpec =
    typeof configuredParameters.string === "string"
      ? configuredParameters.string
      : spec
  const seeded = fp.string(codeSpec)
  const seededParameters = seeded.params() as Values
  const lines = [
    'import { fp } from "@tscircuit/footprinter"',
    "",
    `const footprint = fp.string(${JSON.stringify(codeSpec)})`,
  ]
  // Show preset expansion explicitly, making the copied snippet independent of
  // this site's configuration helper and faithful to the generated copper.
  const changes = Object.fromEntries(
    Object.entries(configuredParameters).filter(([key]) => {
      return (
        !["fn", "string"].includes(key) &&
        JSON.stringify(seededParameters[key]) !==
          JSON.stringify(configuredParameters[key])
      )
    }),
  )
  const deleted = Object.keys(seededParameters).filter(
    (key) => !(key in configuredParameters),
  )
  if (Object.keys(changes).length || deleted.length) {
    lines.push("const parameters = footprint.params()")
    if (Object.keys(changes).length)
      lines.push(
        `Object.assign(parameters, ${JSON.stringify(changes, null, 2)})`,
      )
    for (const key of deleted)
      lines.push(`delete parameters[${JSON.stringify(key)}]`)
  }
  lines.push("", "const circuitJson = footprint.circuitJson()")
  return lines.join("\n")
}

export function configureFootprint(
  entry: CatalogEntry,
  input: Values,
): Configuration {
  const values = explicitValues(input)
  const builder = createConfiguredFootprint(entry.fn, entry.initialSpec, values)
  const parsed = builder.json() as unknown as Values
  const raw = builder.params() as Values
  const resolvedValues = passiveFunctions.has(entry.fn)
    ? { ...parsed, ...passiveDimensions(raw) }
    : parsed
  let spec = Object.keys(values).length
    ? bestSpec(entry.fn, raw, parsed)
    : entry.initialSpec
  let exactString = true
  if (Object.keys(values).length) {
    try {
      // The DSL supports fewer values than the fluent API. Verify the generated
      // string against copper geometry instead of silently losing a GUI option.
      exactString =
        JSON.stringify(fp.string(spec).circuitJson()) ===
        JSON.stringify(builder.circuitJson())
    } catch {
      spec = entry.initialSpec
      exactString = false
    }
  }
  return {
    spec,
    values,
    resolvedValues,
    code: fluentCode(entry.initialSpec, builder),
    warnings: exactString
      ? undefined
      : ["Copy TypeScript to preserve every setting in this configuration."],
  }
}
