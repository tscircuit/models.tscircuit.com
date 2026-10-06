import { expect, test } from "bun:test"
import jscad from "@jscad/modeling"
import { hexBoltDimensions, modelprinter } from "@tscircuit/modelprinter"
import { modelCatalog } from "../src/lib/model-catalog"
import {
  configureModel,
  modelInputFromSpec,
} from "../src/lib/model-configuration"
import { generatePreview } from "../src/lib/preview-engine"

test("the updated catalog configures, imports, and renders ISO hex bolts", () => {
  const entry = modelCatalog.find((model) => model.fn === "hexbolt")!
  expect(entry).toBeDefined()
  expect(modelCatalog.map((model) => model.fn)).toEqual(
    expect.arrayContaining([
      "flexscreen",
      "nema",
      "hexsocketbolt",
      "sheetmetal",
      "spurgear",
      "helicalgear",
      "wormgear",
    ]),
  )
  for (const [key, value] of [
    ["thread", "full"],
    ["drive", "hex"],
    ["threadClass", "6g"],
    ["threadGender", "male"],
  ]) {
    expect(
      entry.parameters.find((parameter) => parameter.key === key),
    ).toMatchObject({
      kind: "enum",
      options: [{ value, label: expect.any(String) }],
    })
  }

  for (const metricSize of ["M3", "M4", "M5", "M6"] as const) {
    for (const threadHand of ["right", "left"] as const) {
      for (const showThreads of [true, false]) {
        const values = {
          metricSize,
          length: "0.5in",
          standard: "iso4017",
          thread: "full",
          drive: "hex",
          threadHand,
          threadClass: "6g",
          threadGender: "male",
          showThreads,
        }
        const configured = configureModel(entry, values)
        const definition = modelprinter.string(configured.spec).json()
        const { fn, ...parsed } = definition
        expect(fn).toBe("hexbolt")
        expect(configured.values).toEqual(parsed)
        expect(configured.values).toMatchObject({
          ...hexBoltDimensions[metricSize],
          length: 12.7,
          standard: "iso4017:2014",
          threadHand,
          showThreads,
        })
        expect(configured.warnings).toBeUndefined()
        const imported = modelInputFromSpec(configured.spec)
        expect(imported.fn).toBe("hexbolt")
        expect(configureModel(entry, imported.values).values).toEqual(
          configured.values,
        )

        const preview = generatePreview(
          {
            id: 8,
            library: "modelprinter",
            fn: "hexbolt",
            spec: configured.spec,
            values: configured.values,
          },
          (geometries) => {
            expect(geometries.length).toBeGreaterThan(0)
            for (const geometry of geometries)
              expect(
                jscad.measurements.measureVolume(geometry),
              ).toBeGreaterThan(0)
          },
        )
        expect(preview.error).toBeUndefined()
        expect(preview.meshes.length).toBeGreaterThan(0)
        expect(preview.bounds!.max[2] - preview.bounds!.min[2]).toBeCloseTo(
          12.7 + hexBoltDimensions[metricSize].headHeight,
          4,
        )
        for (const mesh of preview.meshes) {
          expect(mesh.positions.length % 9).toBe(0)
          expect(mesh.positions.every(Number.isFinite)).toBe(true)
        }
      }
    }
    const imported = modelInputFromSpec(
      `hexbolt_metricsize(${metricSize.toLowerCase()})_length12mm_d${hexBoltDimensions[metricSize].diameter}mm_af${hexBoltDimensions[metricSize].headAcrossFlats}mm_headh${hexBoltDimensions[metricSize].headHeight}mm`,
    )
    expect(configureModel(entry, imported.values).values).toMatchObject({
      metricSize,
      length: 12,
      ...hexBoltDimensions[metricSize],
    })
  }
  expect(() =>
    configureModel(entry, {
      metricSize: "M3",
      length: 12,
      headAcrossFlats: 20,
    }),
  ).toThrow("contradicts")
})
