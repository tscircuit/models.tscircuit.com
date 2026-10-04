import { beforeAll, expect, test } from "bun:test"
import { createRequire } from "node:module"
import jscad from "@jscad/modeling"
import { exportStep } from "../src/lib/export-step"
import { exportParasolid } from "../src/lib/export-parasolid"
import { inspectParasolid } from "./parasolid-helpers"
import {
  generatePreview,
  geometryToMesh,
  getMeshBounds,
} from "../src/lib/preview-engine"
import { modelCatalog } from "../src/lib/model-catalog"
import { configureModel } from "../src/lib/model-configuration"
import type { PreviewMesh } from "../src/lib/catalog-types"

for (const [fn, edits] of [
  ["spurgear", { faceWidth: 9, hubLength: 0 }],
  [
    "flexscreen",
    {
      offset: { x: 100, y: -50, z: 25 },
      orientation: "sitsFlat",
      conductorCount: 2,
    },
  ],
] as const) {
  test(`Parasolid preserves ${fn} bodies, dimensions, and resolved parameters`, () => {
    const entry = modelCatalog.find((entry) => entry.fn === fn)!
    const config = configureModel(entry, { ...entry.initialValues, ...edits })
    const request = { id: 1, library: "modelprinter" as const, fn, ...config }
    const preview = generatePreview(request)
    expect(preview.error).toBeUndefined()
    const parsed = inspectParasolid(exportParasolid(request))
    expect(parsed.fullyParsed).toBe(true)
    expect(parsed.bodies).toBe(preview.meshes.length)
    // Parasolid stores meters and preserves the model's Z-up orientation.
    for (let axis = 0; axis < 3; axis++) {
      expect(parsed.min[axis] * 1000).toBeCloseTo(preview.bounds!.min[axis], 3)
      expect(parsed.max[axis] * 1000).toBeCloseTo(preview.bounds!.max[axis], 3)
    }
  }, 30_000)
}

test("Parasolid exports NEMA solids without collapsing small faces to Float32", () => {
  const entry = modelCatalog.find((entry) => entry.fn === "nema")!
  const config = configureModel(entry, entry.initialValues)
  const text = exportParasolid({
    id: 1,
    library: "modelprinter",
    fn: entry.fn,
    ...config,
  })
  expect(text).toContain("TRANSMIT FILE")
  expect(text).not.toMatch(/NaN|Infinity/)
}, 15_000)

test("Parasolid includes footprint copper and rejects invalid requests", () => {
  const request = {
    id: 1,
    library: "footprinter" as const,
    fn: "smtpad",
    spec: "smtpad",
    values: { width: 4, height: 3 },
  }
  const parsed = inspectParasolid(exportParasolid(request))
  expect(parsed.fullyParsed).toBe(true)
  expect(parsed.bodies).toBeGreaterThan(0)
  expect(parsed.max[0] - parsed.min[0]).toBeCloseTo(0.004, 6)
  expect(parsed.max[1] - parsed.min[1]).toBeCloseTo(0.003, 6)
  expect(() =>
    exportParasolid({ ...request, fn: "unknown", spec: "unknown" }),
  ).toThrow()
})

// The independent OpenCascade importer ships no TypeScript declarations.
const createOcct = createRequire(import.meta.url)("occt-import-js")
let occt: {
  ReadStepFile: (
    data: Uint8Array,
    options: null,
  ) => {
    success: boolean
    meshes: {
      color?: number[]
      attributes: { position: { array: number[] } }
    }[]
  }
}
beforeAll(async () => {
  occt = await createOcct()
})

function roundTrip(meshes: PreviewMesh[]) {
  const step = exportStep(meshes)
  const imported = occt.ReadStepFile(new TextEncoder().encode(step), null)
  expect(imported.success).toBe(true)
  expect(imported.meshes.length).toBeGreaterThan(0)
  const expected = getMeshBounds(meshes)!
  const actual = getMeshBounds(
    imported.meshes.map((mesh) => ({
      positions: Float32Array.from(mesh.attributes.position.array),
      color: mesh.color ?? "#fff",
    })),
  )!
  for (let axis = 0; axis < 3; axis++) {
    expect(actual.min[axis]).toBeCloseTo(expected.min[axis], 3)
    expect(actual.max[axis]).toBeCloseTo(expected.max[axis], 3)
  }
  return imported
}

test("CAD can read STEP with millimeter dimensions, transforms, colors, and collapsed triangles", () => {
  const box = jscad.primitives.cuboid({ size: [2, 3, 4] })
  const red = geometryToMesh(
    jscad.transforms.translate([-5, 7, 0.000001], box),
    "#ff0000",
  )!
  const blue = geometryToMesh(
    jscad.transforms.translate([10, -3, 6], box),
    [0, 0, 255],
  )!
  // Preview tessellation can contain collapsed triangles at curved poles.
  red.positions = Float32Array.from([
    ...red.positions,
    ...red.positions.slice(0, 3),
    ...red.positions.slice(0, 3),
    ...red.positions.slice(0, 3),
  ])
  const imported = roundTrip([red, blue])
  expect(imported.meshes.map((mesh) => mesh.color)).toContainEqual([1, 0, 0])
  expect(imported.meshes.map((mesh) => mesh.color)).toContainEqual([0, 0, 1])
})

for (const fn of ["spurgear", "nema"]) {
  test(`CAD can read the actual ${fn} model with unchanged bounds`, () => {
    const entry = modelCatalog.find((entry) => entry.fn === fn)!
    const config = configureModel(entry, entry.initialValues)
    const preview = generatePreview({
      id: 1,
      library: "modelprinter",
      fn,
      spec: config.spec,
      values: config.values,
    })
    expect(preview.error).toBeUndefined()
    roundTrip(preview.meshes)
  }, 30_000)
}

test("detailed default threaded models export within the download time budget", () => {
  for (const fn of ["hexsocketbolt", "wormgear"]) {
    const entry = modelCatalog.find((entry) => entry.fn === fn)!
    const config = configureModel(entry, entry.initialValues)
    const preview = generatePreview({
      id: 1,
      library: "modelprinter",
      fn,
      spec: config.spec,
      values: config.values,
    })
    expect(preview.error).toBeUndefined()
    const started = performance.now()
    const step = exportStep(preview.meshes)
    expect(step).toContain("FACETED_BREP")
    expect(step).not.toMatch(/NaN|Infinity/)
    expect(performance.now() - started).toBeLessThan(15_000)
  }
}, 40_000)
