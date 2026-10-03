import { describe, expect, test } from "bun:test"
import { fp, getFootprintNames } from "@tscircuit/footprinter"
import type { AnyCircuitElement } from "circuit-json"
import { footprintCatalog } from "../src/lib/footprint-catalog"
import {
  configureFootprint,
  createConfiguredFootprint,
  footprintInputFromSpec,
} from "../src/lib/footprint-configuration"

const entry = (fn: string) =>
  footprintCatalog.find((candidate) => candidate.fn === fn)!
const copper = (json: AnyCircuitElement[]) =>
  json.filter(
    (element) =>
      element.type === "pcb_smtpad" || element.type === "pcb_plated_hole",
  )
const pads = (
  fn: string,
  values: Record<string, unknown> = {},
  spec = entry(fn).initialSpec,
) =>
  createConfiguredFootprint(fn, spec, values)
    .circuitJson()
    .filter((element) => element.type === "pcb_smtpad")

describe("footprint catalog", () => {
  test("covers every function exported by the installed Footprinter version", () => {
    expect(footprintCatalog.map((candidate) => candidate.fn).sort()).toEqual(
      getFootprintNames().sort(),
    )
    expect(
      new Set(footprintCatalog.map((candidate) => candidate.id)).size,
    ).toBe(footprintCatalog.length)
  })

  for (const candidate of footprintCatalog) {
    test(`${candidate.fn} has a working default preview`, () => {
      const configuration = configureFootprint(
        candidate,
        candidate.initialValues,
      )
      const generated = createConfiguredFootprint(
        candidate.fn,
        configuration.spec,
        configuration.values,
      ).circuitJson()
      expect(copper(generated).length).toBeGreaterThan(0)
      expect(configuration.code).toContain("footprint.circuitJson()")
    })
  }

  test("optional, transformed, and schema-intersection controls remain discoverable", () => {
    expect(entry("dfn").parameters.map((parameter) => parameter.key)).toEqual(
      expect.arrayContaining([
        "bodywidth",
        "thermalvias",
        "cornerpads",
        "cornerpadcutlength",
        "missing",
      ]),
    )
    expect(
      entry("bga")
        .parameters.find((parameter) => parameter.key === "pinnumbering")
        ?.options?.map((option) => option.value),
    ).toEqual(["rowmajor", "columnmajor", "ballcoords"])
    expect(
      entry("mountedpcbmodule").parameters.map((parameter) => parameter.key),
    ).toContain("pinRowHoleEdgeToEdgeDist")
  })
})

describe("typed footprint configuration", () => {
  test("raw DSL function resolution accepts normalized aliases and different functions", () => {
    expect(footprintInputFromSpec("qfn12_p0.75mm")).toEqual({
      fn: "qfn",
      values: {},
    })
    expect(footprintInputFromSpec("0603").fn).toBe("res")
    expect(footprintInputFromSpec("pinheader8").fn).toBe("pinrow")
    expect(footprintInputFromSpec("SOD-323HE").fn).toBe("sod323he")
    expect(() => footprintInputFromSpec("unknown8")).toThrow(
      "supported footprint",
    )
    expect(() => footprintInputFromSpec("vson")).toThrow()
  })

  test("changing pin count preserves dependent automatic package dimensions", () => {
    const initial = configureFootprint(entry("qfn"), {})
    const changed = configureFootprint(entry("qfn"), { num_pins: 16 })
    expect(pads("qfn", changed.values, changed.spec)).toHaveLength(16)
    expect(changed.resolvedValues?.w).toBeLessThan(
      initial.resolvedValues?.w as number,
    )
    expect(changed.values).toEqual({ num_pins: 16 })
  })

  test("a false boolean actually disables a true library default", () => {
    expect(pads("bga")[0]?.shape).toBe("circle")
    const configured = configureFootprint(entry("bga"), { circularpads: false })
    expect(pads("bga", configured.values, configured.spec)[0]?.shape).toBe(
      "rect",
    )
    expect(configured.values.circularpads).toBe(false)
    expect(configured.warnings).toHaveLength(1)
  })

  test("enum options reach the native API and reposition actual pads", () => {
    const generated = createConfiguredFootprint(
      "soic",
      entry("soic").initialSpec,
      { origin: "pin1" },
    ).circuitJson()
    const first = copper(generated)[0]
    if (!first || !("x" in first) || !("y" in first))
      throw new Error("Expected a pad with a center")
    expect(first.x).toBe(0)
    expect(first.y).toBe(0)
    const ballCoordinates = createConfiguredFootprint(
      "bga",
      entry("bga").initialSpec,
      { pinnumbering: "ballcoords" },
    ).circuitJson()
    expect(copper(ballCoordinates)[0]?.port_hints).toEqual(["A1"])
  })

  test("a passive pad dimension overrides the selected size while keeping the other dimensions", () => {
    const before = pads("res")[0]
    const configuration = configureFootprint(entry("res"), { pw: 1.4 })
    const after = pads("res", configuration.values, configuration.spec)[0]
    expect(after?.shape).toBe("rect")
    if (after?.shape !== "rect" || before?.shape !== "rect")
      throw new Error("Expected rectangular resistor pads")
    expect(after.width).toBe(1.4)
    expect(after.height).toBe(before.height)
    expect(configuration.resolvedValues?.imperial).toBeUndefined()
  })

  test("changing the metric preset replaces the seeded imperial preset", () => {
    const configured = configureFootprint(entry("cap"), { metric: "1005" })
    const after = pads("cap", configured.values, configured.spec)[0]
    expect(after?.shape).toBe("rect")
    if (after?.shape !== "rect")
      throw new Error("Expected rectangular capacitor pad")
    expect(after.width).toBe(0.54)
    expect(configured.resolvedValues?.imperial).toBeUndefined()
  })

  test("changing the seeded JST family selects the requested package", () => {
    const configured = createConfiguredFootprint(
      "jst",
      entry("jst").initialSpec,
      { xh: true },
    ).json() as unknown as Record<string, unknown>
    expect(configured.xh).toBe(true)
    expect(configured.sh).toBe(false)
    expect(configured.p).toBe(2.5)
  })

  test("the mounted PCB module pin count overrides its seeded pinrow alias", () => {
    const generated = createConfiguredFootprint(
      "mountedpcbmodule",
      entry("mountedpcbmodule").initialSpec,
      { numPins: 9 },
    ).circuitJson()
    expect(copper(generated)).toHaveLength(9)
  })

  test("raw specification edits supply the current base dimensions", () => {
    const changedEntry = { ...entry("qfn"), initialSpec: "qfn12_p0.75mm" }
    const configured = configureFootprint(changedEntry, {})
    expect(configured.spec).toBe("qfn12_p0.75mm")
    expect(configured.resolvedValues?.p).toBe(0.75)
    expect(pads("qfn", configured.values, configured.spec)).toHaveLength(12)
  })

  test("copied TypeScript reproduces combinations that the DSL cannot represent", () => {
    for (const [fn, values] of [
      ["bga", { circularpads: false, pinnumbering: "ballcoords" }],
      ["res", { pw: 1.4, origin: "pin1" }],
      ["jst", { xh: true }],
    ] as const) {
      const configuration = configureFootprint(entry(fn), values)
      const source = configuration.code.replace(/^import[^\n]*\n/, "")
      const copiedResult = new Function("fp", `${source}\nreturn circuitJson`)(
        fp,
      )
      const preview = createConfiguredFootprint(
        fn,
        entry(fn).initialSpec,
        values,
      ).circuitJson()
      expect(copiedResult).toEqual(preview)
    }
  })

  test("invalid counts and mismatched raw specifications fail with useful errors", () => {
    expect(() => configureFootprint(entry("qfn"), { num_pins: 1.5 })).toThrow(
      "Pin count must be an integer",
    )
    expect(() =>
      configureFootprint(entry("qfn"), { num_pins: Number.POSITIVE_INFINITY }),
    ).toThrow("finite number")
    expect(() => createConfiguredFootprint("qfn", "soic8", {})).toThrow(
      "Expected a qfn footprint",
    )
  })
})
