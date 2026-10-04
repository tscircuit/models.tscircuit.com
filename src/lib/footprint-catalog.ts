import { getFootprintNames } from "@tscircuit/footprinter"
import type { CatalogEntry, ParameterDefinition } from "./catalog-types"
import metadata from "./footprint-parameters.json"

const labels: Record<string, string> = {
  p: "Pitch",
  px: "Horizontal pitch",
  py: "Vertical pitch",
  w: "Body width",
  h: "Body height",
  d: "Diameter",
  id: "Hole diameter",
  od: "Plating diameter",
  pw: "Pad width",
  ph: "Pad height",
  pl: "Pad length",
  leftrightpins: "Left and right pin count",
  topbottompins: "Top and bottom pin count",
  leftrightpadwidth: "Left and right pad width",
  leftrightpadlength: "Left and right pad length",
  num_pins: "Pin count",
  numPins: "Pin count",
  cyw: "Courtyard width",
  cyh: "Courtyard height",
  ep: "Exposed pad",
  epw: "Exposed pad width",
  eph: "Exposed pad height",
  epx: "Exposed pad offset",
  grid: "Grid dimensions",
  imperial: "Imperial size",
  metric: "Metric size",
  thermalpad: "Thermal pad dimensions",
  thermalvias: "Thermal via grid",
  pin1location: "Pin 1 location",
  pinnumbering: "Pin numbering",
  origin: "Origin",
  norefdes: "Hide reference label",
  nosilkscreen: "Hide silkscreen",
  rounded: "Pad corner radius",
  array: "Resistor array count",
  x: "Array count alias",
  pillpads: "Use pill pads",
  circularpads: "Use circular pads",
  missing: "Missing pin positions",
  tht: "Through hole",
  smd: "Surface mount",
  bridged: "Bridged pins",
  pw1: "Pin 1 pad width",
  pw2: "Pin 2 pad width",
  p1w: "Pin 1 pad width",
  p2w: "Pin 2 pad width",
  p1x: "Pin 1 horizontal offset",
  p2x: "Pin 2 horizontal offset",
  sh: "SH connector family",
  zh: "ZH connector family",
  xh: "XH connector family",
  tabw: "Tab pad width",
  tabh: "Tab pad height",
  span: "Lead to tab spacing",
}

const fullNames: Record<string, string> = {
  res: "Resistor",
  cap: "Capacitor",
  diode: "Diode",
  led: "LED",
  axial: "Axial through hole",
  radial: "Radial through hole",
  electrolytic: "Electrolytic capacitor",
  crystal: "Crystal",
  pinrow: "Pin header",
  headermodule: "Header module",
  smdpinheader: "SMD pin header",
  jst: "JST connector",
  fpc: "FPC connector",
  rj45: "RJ45 connector",
  usbcmidmount: "USB-C mid-mount",
  smtpad: "Surface mount pad",
  smdpads: "SMD pad row",
  platedhole: "Plated hole",
  pad: "Rectangular pad",
  solderjumper: "Solder jumper",
  pushbutton: "Push button",
  smdpushbutton: "SMD push button",
  smdslideswitch: "SMD slide switch",
  potentiometer: "Potentiometer",
  breakoutheaders: "Breakout headers",
  stampboard: "Stamp board",
  stampreceiver: "Stamp receiver",
  mountedpcbmodule: "Mounted PCB module",
  m2host: "M.2 host connector",
  quad: "Quad package",
  bga: "BGA · Ball grid array",
  dip: "DIP · Dual inline package",
  qfn: "QFN · Quad flat no-lead",
  qfp: "QFP · Quad flat package",
  soic: "SOIC · Small outline IC",
  dfn: "DFN · Dual flat no-lead",
}

function words(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(
      /(silkscreen|thermal|courtyard|terminal|diameter|thickness|numbering|standoff|length|height|width|radius|spacing|pitch|offset|center|margin|bottom|right|left|top|body|chamfer|inverted|orthogonal|labels|label|origin|location|plating|missing|pins|pin|pad|hole|square|border)/g,
      " $1 ",
    )
    .replace(/\s+/g, " ")
    .trim()
}

function category(fn: string): string {
  if (
    [
      "res",
      "cap",
      "diode",
      "axial",
      "radial",
      "electrolytic",
      "crystal",
      "hc49",
    ].includes(fn)
  )
    return "Passives"
  if (fn.startsWith("led")) return "LEDs"
  if (
    [
      "pinrow",
      "headermodule",
      "smdpinheader",
      "jst",
      "fpc",
      "rj45",
      "usbcmidmount",
      "m2host",
      "breakoutheaders",
    ].includes(fn)
  )
    return "Connectors"
  if (["smtpad", "smdpads", "platedhole", "pad", "solderjumper"].includes(fn))
    return "Pads & holes"
  if (
    ["pushbutton", "smdpushbutton", "smdslideswitch", "potentiometer"].includes(
      fn,
    )
  )
    return "Switches & controls"
  if (["mountedpcbmodule", "stampboard", "stampreceiver"].includes(fn))
    return "Modules"
  if (/^(?:sot|sod|to\d|do\d|sma$|smb|smc$|smf$|.*melf$|d2?pak$)/.test(fn))
    return "Discrete packages"
  return "IC packages"
}

function parameterGroup(key: string): string {
  if (
    ["norefdes", "nosilkscreen", "pin1location", "origin", "invert"].includes(
      key,
    ) ||
    key.startsWith("pinlabel") ||
    key.startsWith("silkscreen")
  )
    return "Display"
  if (key.includes("thermal") || /^ep[whx]?$/.test(key)) return "Thermal pad"
  if (
    key.includes("pin") ||
    ["grid", "rows", "cols", "missing", "p", "px", "py", "array", "x"].includes(
      key,
    )
  )
    return "Pins & layout"
  if (
    [
      "imperial",
      "metric",
      "tht",
      "smd",
      "male",
      "female",
      "sh",
      "zh",
      "xh",
      "surfacemount",
      "rightangle",
    ].includes(key)
  )
    return "Package"
  if (
    key.includes("pad") ||
    [
      "pw",
      "ph",
      "pl",
      "rounded",
      "circle",
      "square",
      "pill",
      "rect",
      "id",
      "od",
    ].includes(key)
  )
    return "Pads & holes"
  return "Dimensions & options"
}

export const footprintCatalog: CatalogEntry[] = metadata.functions.map(
  (entry) => {
    const group = category(entry.name)
    const name = fullNames[entry.name] ?? entry.name.toUpperCase()
    const parameters: ParameterDefinition[] = entry.parameters.map(
      (parameter) => {
        const raw = parameter as {
          key: string
          kind: string
          required: boolean
          sourceDefault?: unknown
          resolvedDefault?: unknown
          description?: string
          placeholder?: string
          options?: (string | number | boolean)[]
          min?: number
          max?: number
          integer?: boolean
        }
        const kind =
          raw.kind === "dimensions" || raw.kind === "list"
            ? "text"
            : raw.kind === "object"
              ? "json"
              : (raw.kind as ParameterDefinition["kind"])
        const label =
          entry.name === "jst" && raw.key === "ph"
            ? "PH connector family"
            : (labels[raw.key] ??
              words(raw.key).replace(/^./, (char) => char.toUpperCase()))
        const defaultValue = raw.resolvedDefault ?? raw.sourceDefault
        const description = [
          raw.description,
          raw.placeholder ? `Example: ${raw.placeholder}` : undefined,
        ]
          .filter(Boolean)
          .join(". ")
        return {
          key: raw.key,
          label,
          kind,
          optional: !raw.required,
          default: defaultValue,
          options: raw.options?.map((value) => ({
            value,
            label: words(String(value)),
          })),
          min: raw.min,
          max: raw.max,
          step: raw.integer ? 1 : kind === "length" ? 0.05 : undefined,
          description: description || undefined,
          group: parameterGroup(raw.key),
          stringSupported:
            raw.key === "num_pins" ||
            (/^(?:[a-z]+|p\d+[a-z]+|pin1[a-z]+)$/.test(raw.key) &&
              (kind !== "enum" || raw.key === "pinnumbering") &&
              raw.key !== "origin"),
        }
      },
    )
    // Show shape controls first, while retaining every supported optional field.
    parameters.sort((a, b) => {
      const priority = (p: ParameterDefinition) =>
        p.key === "num_pins" || p.key === "numPins"
          ? 0
          : ["imperial", "metric", "p", "w", "h", "pw", "ph", "pl"].includes(
                p.key,
              )
            ? 1
            : p.group === "Display"
              ? 3
              : 2
      return priority(a) - priority(b)
    })
    return {
      id: `footprinter:${entry.name}`,
      library: "footprinter",
      fn: entry.name,
      name,
      category: group,
      description: `Configure ${name.toLowerCase()} copper pads, holes, and silkscreen.`,
      tags: [
        entry.name,
        group,
        "footprint",
        "pcb",
        ...(group === "Passives"
          ? ["resistor", "capacitor", "through hole", "smd"]
          : []),
      ],
      initialSpec: entry.example,
      initialValues: {},
      parameters,
    }
  },
)

const discovered = new Set(getFootprintNames())
const catalogNames = new Set(footprintCatalog.map((entry) => entry.fn))
const missing = [...discovered].filter((fn) => !catalogNames.has(fn))
const outdated = [...catalogNames].filter((fn) => !discovered.has(fn))
if (missing.length || outdated.length) {
  throw new Error(
    `Footprinter catalog needs regeneration (missing: ${missing.join(", ") || "none"}; outdated: ${outdated.join(", ") || "none"}).`,
  )
}
