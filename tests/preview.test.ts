import { describe, expect, test } from "bun:test"
import jscad from "@jscad/modeling"
import {
  generatePreview,
  geometryToMesh,
  getMeshBounds,
} from "../src/lib/preview-engine"
import { modelCatalog } from "../src/lib/model-catalog"
import { configureModel } from "../src/lib/model-configuration"
import type { PreviewRequest } from "../src/lib/catalog-types"

const request = (
  fn: string,
  spec: string,
  values: Record<string, unknown> = {},
): PreviewRequest => ({ id: 7, library: "footprinter", fn, spec, values })

function span(result: ReturnType<typeof generatePreview>, axis: number) {
  expect(result.bounds).toBeDefined()
  return result.bounds!.max[axis] - result.bounds!.min[axis]
}

describe("real library preview generation", () => {
  for (const entry of modelCatalog) {
    test(`generates finite ${entry.fn} geometry using its modelprinter values`, () => {
      const configuration = configureModel(entry, entry.initialValues)
      const result = generatePreview({
        id: 42,
        library: "modelprinter",
        fn: entry.fn,
        spec: configuration.spec,
        values: configuration.values,
      })
      expect(result.error).toBeUndefined()
      expect(result.id).toBe(42)
      expect(result.meshes.length).toBeGreaterThan(0)
      expect(result.bounds).toBeDefined()
      for (const mesh of result.meshes) {
        expect(mesh.positions.length % 9).toBe(0)
        expect(mesh.positions.every(Number.isFinite)).toBe(true)
      }
    })
  }

  test("spur gear face width changes actual 3D bounds", () => {
    const entry = modelCatalog.find((entry) => entry.fn === "spurgear")!
    const config = configureModel(entry, { faceWidth: 9, hubLength: 0 })
    const result = generatePreview({
      id: 1,
      library: "modelprinter",
      fn: "spurgear",
      spec: config.spec,
      values: config.values,
    })
    expect(result.error).toBeUndefined()
    expect(span(result, 2)).toBeCloseTo(9, 5)
  })

  test("FlexScreen placement fields affect geometry beyond string-supported parameters", () => {
    const entry = modelCatalog.find((entry) => entry.fn === "flexscreen")!
    const base = configureModel(entry, entry.initialValues)
    const moved = configureModel(entry, {
      ...entry.initialValues,
      offset: { x: 100, y: -50, z: 25 },
    })
    const before = generatePreview({
      id: 1,
      library: "modelprinter",
      fn: entry.fn,
      spec: base.spec,
      values: base.values,
    })
    const after = generatePreview({
      id: 2,
      library: "modelprinter",
      fn: entry.fn,
      spec: moved.spec,
      values: moved.values,
    })
    expect(before.error).toBeUndefined()
    expect(after.error).toBeUndefined()
    expect(after.bounds!.min[0] - before.bounds!.min[0]).toBeCloseTo(100, 4)
    expect(after.bounds!.min[1] - before.bounds!.min[1]).toBeCloseTo(-50, 4)
    expect(after.bounds!.min[2] - before.bounds!.min[2]).toBeCloseTo(25, 4)
  })

  test("footprint dimensions update SVG and exact 3D copper", () => {
    const small = generatePreview(
      request("smtpad", "smtpad", { width: 2, height: 1 }),
    )
    const large = generatePreview(
      request("smtpad", "smtpad", { width: 4, height: 3 }),
    )
    expect(small.error).toBeUndefined()
    expect(large.error).toBeUndefined()
    expect(large.svg).toContain("<svg")
    expect(large.svg).not.toBe(small.svg)
    expect(span(small, 0)).toBeCloseTo(2, 4)
    expect(span(large, 0)).toBeCloseTo(4, 4)
    expect(span(large, 1)).toBeCloseTo(3, 4)
  })

  test("fluent false overrides do not retain a package body from a mismatched string", () => {
    const hidden = generatePreview(request("qfn", "qfn16_nosilkscreen", {}))
    const visible = generatePreview(
      request("qfn", "qfn16_nosilkscreen", { nosilkscreen: false }),
    )
    expect(hidden.error).toBeUndefined()
    expect(visible.error).toBeUndefined()
    expect(visible.svg).not.toBe(hidden.svg)
    expect(visible.message).toContain("package body is not available")
    expect(visible.meshes.length).toBeGreaterThan(0)
    expect(visible.meshes.every((mesh) => mesh.color === "#71717a")).toBe(true)
  })

  test("unsupported model generators return an actionable error", () => {
    const result = generatePreview({
      id: 17,
      library: "modelprinter",
      fn: "unknown",
      spec: "unknown",
      values: {},
    })
    expect(result.id).toBe(17)
    expect(result.meshes).toEqual([])
    expect(result.error).toContain("No geometry generator")
  })
})

describe("geometry transfer", () => {
  test("pending JSCAD transforms are applied before calculating bounds", () => {
    const geometry = jscad.transforms.translate(
      [100, -50, 10],
      jscad.primitives.cuboid({ size: [4, 6, 8] }),
    )
    const mesh = geometryToMesh(geometry)!
    expect(getMeshBounds([mesh])).toEqual({
      min: [98, -53, 6],
      max: [102, -47, 14],
    })
  })
  test("an empty preview has no misleading bounds", () => {
    expect(getMeshBounds([])).toBeUndefined()
  })
})
