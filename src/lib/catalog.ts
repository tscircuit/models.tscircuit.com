import type { CatalogEntry, Configuration } from "./catalog-types"
import { modelCatalog } from "./model-catalog"
import { footprintCatalog } from "./footprint-catalog"
import { configureModel, modelInputFromSpec } from "./model-configuration"
import {
  configureFootprint,
  footprintInputFromSpec,
} from "./footprint-configuration"

export const catalog = [...modelCatalog, ...footprintCatalog]

export function configure(
  entry: CatalogEntry,
  values: Record<string, unknown>,
): Configuration {
  return entry.library === "modelprinter"
    ? configureModel(entry, values)
    : configureFootprint(entry, values)
}

export function searchCatalog(query: string, library = "all") {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return catalog.filter((entry) => {
    if (library !== "all" && entry.library !== library) return false
    const text = [
      entry.fn,
      entry.name,
      entry.description,
      entry.category,
      ...entry.tags,
    ]
      .join(" ")
      .toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

export function prepareValues(
  entry: CatalogEntry,
  values: Record<string, unknown>,
) {
  const result = { ...values }
  for (const parameter of entry.parameters) {
    if (result[parameter.key] === "" || result[parameter.key] === undefined) {
      delete result[parameter.key]
    } else if (
      parameter.kind === "json" &&
      typeof result[parameter.key] === "string"
    ) {
      try {
        result[parameter.key] = JSON.parse(result[parameter.key] as string)
      } catch {
        throw new Error(`${parameter.label} must be valid JSON`)
      }
    }
  }
  return result
}

export function updateValues(
  entry: CatalogEntry,
  previous: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  const next = { ...previous }
  if (entry.library === "footprinter" && value !== "" && value !== undefined) {
    if (key === "metric" || key === "imperial") {
      for (const field of [
        "metric",
        "imperial",
        "p",
        "pw",
        "ph",
        "w",
        "h",
        "cyw",
        "cyh",
      ])
        delete next[field]
    }
    const exclusive =
      entry.fn === "jst"
        ? ["sh", "ph", "zh", "xh", "smd"]
        : entry.fn === "smtpad"
          ? ["circle", "rect", "square", "pill"]
          : []
    if (value === true && exclusive.includes(key)) {
      for (const field of exclusive) delete next[field]
    }
  }
  if (value === "" || value === undefined) delete next[key]
  else next[key] = value
  return next
}

export function initialState(
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  const fallback =
    catalog.find(
      (entry) => entry.fn === "spurgear" && entry.library === "modelprinter",
    ) ?? catalog[0]
  const query = new URLSearchParams(search)
  let entry = catalog.find((item) => item.id === query.get("model")) ?? fallback
  let values: Record<string, unknown> = { ...entry.initialValues }
  let spec = query.get("spec") ?? entry.initialSpec
  if (query.has("spec")) {
    try {
      const input =
        entry.library === "modelprinter"
          ? modelInputFromSpec(spec)
          : footprintInputFromSpec(spec)
      entry =
        catalog.find(
          (item) => item.library === entry.library && item.fn === input.fn,
        ) ?? entry
      values = input.values
    } catch {
      spec = entry.initialSpec
    }
  }
  try {
    const parsed = JSON.parse(query.get("params") ?? "null")
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      values = parsed
  } catch {
    /* Invalid links fall back to the model's defaults. */
  }
  return { entry, values, spec }
}

export function shareUrl(
  entry: CatalogEntry,
  values: Record<string, unknown>,
  spec: string,
) {
  const url = new URL(window.location.href)
  url.search = ""
  url.searchParams.set("model", entry.id)
  if (Object.keys(values).length)
    url.searchParams.set("params", JSON.stringify(values))
  if (spec !== entry.initialSpec) url.searchParams.set("spec", spec)
  return url.toString()
}
