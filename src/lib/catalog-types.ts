export type Library = "modelprinter" | "footprinter"

export interface ParameterDefinition {
  key: string
  label: string
  kind: "number" | "length" | "boolean" | "enum" | "json" | "text"
  optional?: boolean
  default?: unknown
  options?: { value: string | number | boolean; label: string }[]
  min?: number
  max?: number
  step?: number
  description?: string
  group?: string
  stringSupported?: boolean
}

export interface CatalogEntry {
  id: string
  library: Library
  fn: string
  name: string
  description: string
  category: string
  tags: string[]
  initialSpec: string
  initialValues: Record<string, unknown>
  parameters: ParameterDefinition[]
}

export interface Configuration {
  spec: string
  values: Record<string, unknown>
  resolvedValues?: Record<string, unknown>
  code: string
  warnings?: string[]
}

export interface PreviewRequest {
  id: number
  library: Library
  fn: string
  spec: string
  values: Record<string, unknown>
}

export interface PreviewMesh {
  positions: Float32Array
  color: string | number[]
}

export interface PreviewResult {
  id: number
  meshes: PreviewMesh[]
  svg?: string
  bounds?: { min: [number, number, number]; max: [number, number, number] }
  message?: string
  error?: string
}
