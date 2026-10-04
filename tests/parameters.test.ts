import { describe, expect, test } from "bun:test"
import { footprintCatalog } from "../src/lib/footprint-catalog"
import metadata from "../src/lib/footprint-parameters.json"
import { createConfiguredFootprint } from "../src/lib/footprint-configuration"
import { modelCatalog } from "../src/lib/model-catalog"
import { sourcePins } from "../scripts/generate-model-examples"

const footprint = (fn: string) =>
  footprintCatalog.find((entry) => entry.fn === fn)!
const keys = (fn: string) =>
  footprint(fn).parameters.map((parameter) => parameter.key)

describe("relevant native-schema controls", () => {
  test("a quad package exposes its layout and optional thermal inputs without unrelated inherited flags", () => {
    expect(keys("qfn")).toEqual(
      expect.arrayContaining([
        "num_pins",
        "leftrightpins",
        "topbottompins",
        "leftrightpadwidth",
        "thermalpad",
        "thermalvias",
        "thermalviapitch",
        "thermalviaid",
        "thermalviaod",
      ]),
    )
    for (const key of [
      "invert",
      "faceup",
      "anodepin",
      "cathodepin",
      "cc",
      "ccw",
      "tlorigin",
      "legsoutside",
      "lrpins",
      "lrpw",
    ])
      expect(keys("qfn")).not.toContain(key)
    expect(
      footprint("qfn").parameters.find(
        (parameter) => parameter.key === "thermalvias",
      )?.optional,
    ).toBe(true)
  })

  test("polarity belongs to diode and LED controls; header inversion remains available", () => {
    for (const fn of ["diode", "led"])
      expect(keys(fn)).toEqual(
        expect.arrayContaining(["anodepin", "cathodepin"]),
      )
    for (const fn of ["bga", "soic", "jst", "res"])
      expect(keys(fn)).not.toContain("cathodepin")
    expect(keys("pinrow")).toContain("invert")
    expect(keys("headermodule")).toContain("invert")
  })

  test("pad and hole controls use canonical dimensions while raw imports retain aliases", () => {
    expect(keys("smtpad")).toEqual(
      expect.arrayContaining(["d", "w", "h", "circle", "pill"]),
    )
    for (const key of [
      "radius",
      "r",
      "pr",
      "diameter",
      "pd",
      "pw",
      "ph",
      "width",
      "height",
      "size",
    ])
      expect(keys("smtpad")).not.toContain(key)
    expect(keys("platedhole")).toEqual(
      expect.arrayContaining(["d", "pd", "squarepad"]),
    )
    for (const key of ["r", "hr", "hd", "pr"])
      expect(keys("platedhole")).not.toContain(key)
    expect(
      metadata.functions.find((entry) => entry.name === "smtpad")
        ?.acceptedParameters,
    ).toEqual(expect.arrayContaining(["r", "radius", "diameter", "pw", "size"]))
    expect(
      metadata.functions.find((entry) => entry.name === "qfn")
        ?.acceptedParameters,
    ).toEqual(
      expect.arrayContaining(["lrpw", "lrpins", "cathodepin", "invert"]),
    )
  })

  test("fixed-count packages have no ineffective count input, while configurable families retain it", () => {
    for (const fn of [
      "ms012",
      "ms013",
      "to92l",
      "sot23w",
      "sot323",
      "sot343",
      "potentiometer",
    ])
      expect(keys(fn)).not.toContain("num_pins")
    for (const fn of ["jst", "sot23", "to92", "to92s", "qfn", "sop8"])
      expect(keys(fn)).toContain("num_pins")
  })

  test("unsupported inherited body fields are hidden while consumed package body fields remain", () => {
    for (const key of [
      "bodywidth",
      "bodylength",
      "bodythickness",
      "terminalpitch",
      "terminalwidth",
      "standoff",
    ])
      expect(keys("dfn")).not.toContain(key)
    for (const fn of ["ssop", "lga"])
      expect(keys(fn)).toEqual(
        expect.arrayContaining(["bodywidth", "bodyheight", "bodythickness"]),
      )
    expect(keys("to92s")).toContain("w")
    expect(keys("mountedpcbmodule")).toContain("nopin")
    expect(keys("radial")).toContain("polarized")
    expect(keys("radial")).not.toContain("ceramic")
    expect(keys("radial")).not.toContain("electrolytic")
  })

  test("optional thermal controls change actual copper when enabled", () => {
    const entry = footprint("qfn")
    const withoutVias = createConfiguredFootprint(entry.fn, entry.initialSpec, {
      thermalpad: "2x2",
    }).circuitJson()
    const withVias = createConfiguredFootprint(entry.fn, entry.initialSpec, {
      thermalpad: "2x2",
      thermalvias: "2x2",
    }).circuitJson()
    expect(
      withoutVias.filter((element) => element.type === "pcb_via"),
    ).toHaveLength(0)
    expect(
      withVias.filter((element) => element.type === "pcb_via"),
    ).toHaveLength(4)
  })

  test("model schemas expose gear settings and one control for each flex-screen alias group", () => {
    const modelKeys = (fn: string) =>
      modelCatalog
        .find((entry) => entry.fn === fn)!
        .parameters.map((parameter) => parameter.key)
    expect(modelKeys("spurgear")).toEqual(
      expect.arrayContaining([
        "toothCount",
        "module",
        "pressureAngle",
        "boreDiameter",
        "segmentsPerTooth",
      ]),
    )
    expect(modelKeys("wormgear")).toEqual(
      expect.arrayContaining([
        "starts",
        "handedness",
        "pitchDiameter",
        "segmentsPerTurn",
      ]),
    )
    expect(modelKeys("flexscreen")).toEqual(
      expect.arrayContaining([
        "orientation",
        "aspectRatio",
        "screenOffset",
        "screenRotation",
      ]),
    )
    for (const alias of [
      "ratio",
      "sitsFlat",
      "sitsFlatBelowBoard",
      "foldedToFaceAboveBoard",
      "foldsAboveBoard",
      "foldsBelowBoard",
      "foldedToRightAngleAboveBoard",
    ])
      expect(modelKeys("flexscreen")).not.toContain(alias)
    const gear = modelCatalog.find((entry) => entry.fn === "spurgear")!
    expect(
      gear.parameters.find((parameter) => parameter.key === "module")?.kind,
    ).toBe("length")
    expect(
      gear.parameters.find((parameter) => parameter.key === "toothCount")?.step,
    ).toBe(1)
  })

  test("generated schemas record the source package revision rather than the app revision", () => {
    expect(metadata.source).toEqual({
      package: sourcePins.footprinter.package,
      version: sourcePins.footprinter.version,
      commit: sourcePins.footprinter.commit,
    })
  })
})
