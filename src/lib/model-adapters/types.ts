import type { ComponentType } from "react"
import type { ZodTypeAny } from "zod"

export interface ModelAdapter {
  name: string
  category: string
  description: string
  tags: string[]
  spec: string
  schema: ZodTypeAny
  component: ComponentType<any>
  componentName: string
  lengths?: Record<string, string>
  numbers?: Record<string, string>
  selectors?: Record<string, string>
  flags?: Record<string, Record<string, string>>
  booleans?: Record<string, [string, string]>
  tuples?: Record<string, string>
  aliases?: Record<string, string>
}
