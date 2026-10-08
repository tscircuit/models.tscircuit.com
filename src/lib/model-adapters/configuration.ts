import { modelprinter } from "@tscircuit/modelprinter"
import { modelAdapters } from "."
import type { ModelAdapter } from "./types"

export type AdapterName = keyof typeof modelAdapters
export const adapterFor = (name: string): ModelAdapter | undefined =>
  Object.hasOwn(modelAdapters, name)
    ? modelAdapters[name as AdapterName]
    : undefined

/** Upstream parsing resolves dimensions; only explicit tokens become form overrides. */
export function adapterInput(
  spec: string,
  adapter: ModelAdapter,
): Record<string, unknown> {
  const builder = modelprinter.string(spec)
  const { fn, ...definition } = builder.json()
  const parsed = definition as Record<string, unknown>
  const aliases: Record<string, string> = {
    ...adapter.aliases,
    m: "metricSize",
  }
  for (const [key, token] of Object.entries({
    ...adapter.lengths,
    ...adapter.numbers,
    ...adapter.selectors,
    ...adapter.tuples,
  })) {
    aliases[token] = key
  }
  for (const [key, options] of Object.entries(adapter.flags ?? {})) {
    for (const flag of Object.values(options)) if (flag) aliases[flag] = key
  }
  for (const [key, options] of Object.entries(adapter.booleans ?? {})) {
    for (const flag of options) if (flag) aliases[flag] = key
  }
  const raw = builder.params()
  const values: Record<string, unknown> = {}
  for (const token of Object.keys(raw)) {
    const key = aliases[token]
    if (key && parsed[key] !== undefined) values[key] = parsed[key]
  }
  if (fn === "ballbearing") {
    // Canonical global face flags resolve to the two per-face flags in JSON.
    for (const key of Object.keys(adapter.booleans ?? {})) {
      if (key.startsWith("bothSides")) continue
      if (parsed[key] === true) values[key] = true
    }
  }
  return values
}

export function serializeAdapter(
  name: string,
  input: Record<string, unknown>,
  adapter: ModelAdapter,
  decimal: (value: number) => string,
): string {
  const props = adapter.schema.parse(input) as Record<string, unknown>
  const tokens = [
    name === "ballbearing" && input.code ? `${name}${input.code}` : name,
  ]
  for (const key of Object.keys(input)) {
    if (key === "code" && name === "ballbearing") continue
    const value =
      props[key] ?? (key.startsWith("bothSides") ? input[key] : undefined)
    if (value === undefined) continue
    const length = adapter.lengths?.[key],
      number = adapter.numbers?.[key]
    const flag = adapter.booleans?.[key],
      choice = adapter.flags?.[key]
    const selector = adapter.selectors?.[key],
      tuple = adapter.tuples?.[key]
    if (length) tokens.push(`${length}${decimal(value as number)}mm`)
    else if (number) tokens.push(`${number}${decimal(value as number)}`)
    else if (key === "metricSize") tokens.push(`m${String(value).slice(1)}`)
    else if (flag) {
      const token = flag[value ? 0 : 1]
      if (token) tokens.push(token)
    } else if (choice && String(value) in choice) {
      const token = choice[String(value)]!
      if (token) tokens.push(token)
    } else if (selector) tokens.push(`${selector}(${value})`)
    else if (tuple)
      tokens.push(
        `${tuple}(${(value as number[]).map((v) => `${decimal(v)}mm`).join(",")})`,
      )
    else throw new Error(`The ${name} string grammar cannot encode ${key}.`)
  }
  const result = tokens.join("_")
  const builder = modelprinter.string(result)
  builder.json()
  return builder.params().string
}
