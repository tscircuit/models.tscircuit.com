import generated from "./model-examples.json"
import type { Library } from "./catalog-types"

export interface ModelExample {
  id: string
  library: Library
  fn: string
  spec: string
  sources: { file: string; line: number }[]
}

export const modelExamples = generated.examples as ModelExample[]
export const exampleSources = generated.sources

export function searchExamples(
  query: string,
  library: Library | "all" = "all",
): ModelExample[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return modelExamples.filter((example) => {
    if (library !== "all" && example.library !== library) return false
    const text =
      `${example.fn} ${example.spec} ${example.library}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}
