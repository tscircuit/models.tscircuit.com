import { expect, test } from "bun:test"
import { modelprinter, nemaMotorDimensions } from "@tscircuit/modelprinter"
import { modelCatalog } from "../src/lib/model-catalog"
import {
  configureModel,
  modelInputFromSpec,
} from "../src/lib/model-configuration"

const parseSpec = (spec: string) =>
  modelprinter.string(spec).json() as unknown as Record<string, unknown>

const entry = (fn: string) => modelCatalog.find((model) => model.fn === fn)!

test("every current model function has controls and a valid preview seed", () => {
  expect(modelCatalog.map((model) => model.fn).sort()).toEqual(
    modelprinter.getModelNames().sort(),
  )
  for (const model of modelCatalog) {
    const configured = configureModel(model, model.initialValues)
    const { fn, ...parsed } = parseSpec(configured.spec)
    expect(fn).toBe(model.fn)
    expect(configured.values).toEqual(parsed)
    expect(model.parameters.length).toBeGreaterThan(0)
  }
})

test("schema controls expose dimensions, enums, resolution, and JSON placement", () => {
  expect(
    entry("spurgear").parameters.find((parameter) => parameter.key === "module")
      ?.kind,
  ).toBe("length")
  expect(
    entry("wormgear").parameters.find(
      (parameter) => parameter.key === "starts",
    ),
  ).toMatchObject({ kind: "number", min: 1, max: 8, step: 1 })
  expect(
    entry("nema")
      .parameters.find((parameter) => parameter.key === "nemaSize")
      ?.options?.map((option) => option.value),
  ).toEqual([8, 17, 23])
  expect(
    entry("flexscreen").parameters.find(
      (parameter) => parameter.key === "offset",
    ),
  ).toMatchObject({ kind: "json", stringSupported: false })
  expect(
    entry("sheetmetal").parameters.find(
      (parameter) => parameter.key === "holes",
    )?.kind,
  ).toBe("json")
})

test("changing the NEMA frame resolves new defaults and preserves explicit overrides", () => {
  const motor = entry("nema")
  for (const nemaSize of [8, 17, 23] as const) {
    const configured = configureModel(motor, {
      ...motor.initialValues,
      nemaSize,
    })
    expect(configured.values.bodyWidth).toBe(
      nemaMotorDimensions[nemaSize].bodyWidth,
    )
    expect(configured.values.mountingHoleSpacing).toBe(
      nemaMotorDimensions[nemaSize].mountingHoleSpacing,
    )
    expect(configured.values.shaftDiameter).toBe(
      nemaMotorDimensions[nemaSize].shaftDiameter,
    )
  }
  expect(
    configureModel(motor, { nemaSize: 23, bodyLength: 44 }).values.bodyLength,
  ).toBe(44)
})

test("applying a model string retains explicit inputs without freezing NEMA defaults", () => {
  const motor = entry("nema")
  const imported = modelInputFromSpec("nema17")
  expect(imported).toEqual({ fn: "nema", values: { nemaSize: 17 } })
  expect(
    configureModel(motor, { ...imported.values, nemaSize: 23 }).values
      .bodyWidth,
  ).toBe(nemaMotorDimensions[23].bodyWidth)
  const explicit = modelInputFromSpec("nema17_length38mm_wirestubs")
  const changed = configureModel(motor, { ...explicit.values, nemaSize: 23 })
  expect(explicit.values).toEqual({
    nemaSize: 17,
    bodyLength: 38,
    wireConnection: "stubs",
  })
  expect(changed.values.bodyLength).toBe(38)
  expect(changed.values.bodyWidth).toBe(nemaMotorDimensions[23].bodyWidth)
})

test("DSL imports retain aliases, orientations, feature arrays, and all explicit gear settings", () => {
  for (const spec of [
    "flexscreen_width1in_height30mm_foldedtofaceaboveboard_distance12mm_conductorcount8_hidescreen",
    "sheetmetal_angle_w40mm_l50mm_hole1(d3mm_bottomface)_slot2(l6mm_w2mm_angledface_vertical)",
    "hexsocketbolt_m2.5_length12mm_nothreads",
    "spurgear_teeth48_module1.25mm_width6mm_pressureangle20_borediameter5mm",
    "wormgear_module1.25mm_pitchdiameter14mm_length30mm_starts3_left_turnsegments48",
    "nema17_jstph6",
  ]) {
    const imported = modelInputFromSpec(spec)
    const configured = configureModel(entry(imported.fn), imported.values)
    expect(parseSpec(spec)).toEqual({ fn: imported.fn, ...configured.values })
  }
})

test("spur and worm edits roundtrip all gear parameters through the official grammar", () => {
  const spur = configureModel(entry("spurgear"), {
    toothCount: 48,
    module: "1.25mm",
    faceWidth: 6,
    pressureAngle: 20,
    boreDiameter: 7,
    hubDiameter: 16,
    hubLength: 3,
    backlash: 0.01,
    clearance: 0.3,
    phase: 30,
    segmentsPerTooth: 16,
  })
  const worm = configureModel(entry("wormgear"), {
    module: 1.25,
    pitchDiameter: 14,
    length: 30,
    starts: 3,
    handedness: "left",
    pressureAngle: 20,
    boreDiameter: 3,
    backlash: 0.01,
    clearance: 0.3,
    phase: 45,
    radialSegments: 120,
    segmentsPerTurn: 48,
  })
  expect(parseSpec(spur.spec)).toEqual({ fn: "spurgear", ...spur.values })
  expect(parseSpec(worm.spec)).toEqual({ fn: "wormgear", ...worm.values })
  expect(worm.spec).toContain("_left_")
})

test("sheet features retain signed positions and slot orientation on every panel", () => {
  for (const profile of ["plate", "angle", "channel"]) {
    const panels =
      profile === "plate"
        ? ["base"]
        : profile === "angle"
          ? ["base", "right"]
          : ["base", "left", "right"]
    for (const panel of panels)
      for (const axis of ["u", "v"]) {
        const configured = configureModel(entry("sheetmetal"), {
          profile,
          width: 60,
          baseLength: 60,
          holes: [
            { panel, shape: "round", u: 4, v: -5, diameter: 3 },
            { panel, shape: "slot", u: -8, v: 6, length: 8, width: 2, axis },
          ],
        })
        expect(parseSpec(configured.spec)).toEqual({
          fn: "sheetmetal",
          ...configured.values,
        })
      }
  }
})

test("JSON-only flex placement remains in preview props and exported JSX", () => {
  const configured = configureModel(entry("flexscreen"), {
    width: "1in",
    aspectRatio: "16:9",
    showFlexCable: false,
    offset: '{"x":"2mm","y":3}',
    rotation: [0, 0, 45],
  })
  expect(configured.values.width).toBe(25.4)
  expect(configured.values.offset).toEqual({ x: 2, y: 3 })
  expect(configured.values.rotation).toEqual([0, 0, 45])
  expect(configured.code).toContain("<FlexScreen {...props} />")
  expect(configured.warnings).toEqual([
    "Placement settings are available in JSX/JSON",
  ])
  expect(parseSpec(configured.spec)).toEqual({
    fn: "flexscreen",
    width: 25.4,
    aspectRatio: "16:9",
    showFlexCable: false,
  })
})

test("invalid fields and conflicting orientation shortcuts produce useful errors", () => {
  expect(() => configureModel(entry("spurgear"), { toothCount: 2 })).toThrow(
    "Teeth:",
  )
  expect(() =>
    configureModel(entry("spurgear"), { boreDiameter: 100 }),
  ).toThrow("Bore diameter:")
  expect(() =>
    configureModel(entry("wormgear"), { radialSegments: 98 }),
  ).toThrow("divisible by four")
  expect(() =>
    configureModel(entry("spurgear"), { unknownParameter: true }),
  ).toThrow("unknownParameter")
  expect(() =>
    configureModel(entry("flexscreen"), {
      sitsFlat: true,
      foldedToFaceAboveBoard: true,
    }),
  ).toThrow("Only one")
  expect(() =>
    configureModel(entry("sheetmetal"), {
      width: 30,
      baseLength: 40,
      holes: "[",
    }),
  ).toThrow("Holes and slots: enter valid JSON")
})

test("tiny numerical values serialize without unsupported exponent notation", () => {
  const configured = configureModel(entry("spurgear"), {
    backlash: 0.0000001,
    phase: 0.0000001,
  })
  expect(configured.spec).toContain("backlash0.0000001mm")
  expect(parseSpec(configured.spec)).toEqual({
    fn: "spurgear",
    ...configured.values,
  })
})
