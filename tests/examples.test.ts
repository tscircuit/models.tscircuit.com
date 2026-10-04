import { describe, expect, test } from "bun:test"
import { modelprinter } from "@tscircuit/modelprinter"
import {
  extractAllTestStrings,
  extractTestStrings,
  validatedExamples,
  sourcePins,
} from "../scripts/generate-model-examples"
import {
  exampleSources,
  modelExamples,
  searchExamples,
} from "../src/lib/examples"

describe("test string discovery", () => {
  test("resolves multiline literals, finite loop templates, and object variants without running test code", () => {
    const source = [
      'const base = "spurgear24";',
      'fp.string(base + "_m1mm");',
      "for (const starts of [1, 2]) {",
      "  mp.string(`wormgear_starts${starts}_left`)",
      "}",
      'const variants = [{ part: "jst6_sh" }, { part: "jst4_ph" }];',
      "variants.forEach((variant) => fp.string(`${variant.part}_p1mm`));",
      'throw new Error("The scanner must never execute this");',
    ].join("\n")
    const strings = extractTestStrings(source, "tests/discovery.test.ts")
    const specs = strings.map((candidate) => candidate.spec)
    expect(specs).toContain("spurgear24_m1mm")
    expect(specs).toContain("wormgear_starts1_left")
    expect(specs).toContain("wormgear_starts2_left")
    expect(specs).toContain("jst6_sh_p1mm")
    expect(specs).toContain("jst4_ph_p1mm")
    expect(
      strings.find((candidate) => candidate.spec === "wormgear_starts1_left"),
    ).toEqual({
      spec: "wormgear_starts1_left",
      file: "tests/discovery.test.ts",
      line: 4,
    })
  })

  test("validates complete strings and deduplicates them while retaining source locations", () => {
    const candidates = extractTestStrings(
      [
        'mp.string("spurgear24_m1mm");',
        'mp.string("spurgear24_m1mm");',
        'expect(() => mp.string("spurgear5").json()).toThrow();',
        'expect(() => mp.string("spurgear24_unknown1").json()).toThrow();',
        'expect(() => mp.string("wormgear_starts0").json()).toThrow();',
        'const label = "spurgear24 example";',
      ].join("\n"),
      "tests/gears.test.ts",
    )
    const examples = validatedExamples("modelprinter", candidates)
    expect(examples.map((example) => example.spec)).toEqual(["spurgear24_m1mm"])
    expect(examples[0]?.sources).toEqual([
      { file: "tests/gears.test.ts", line: 1 },
      { file: "tests/gears.test.ts", line: 2 },
    ])
  })

  test("propagates finite loop arguments through imported fixture functions", () => {
    const candidates = extractAllTestStrings([
      {
        file: "tests/nema.test.ts",
        source:
          'import { assertMotor as assertNema } from "./fixtures/motor"; for (const size of [8, 17, 23] as const) test("contract", () => assertNema(size));',
      },
      {
        file: "tests/fixtures/motor.ts",
        source:
          'import { motorString } from "./string"; export function assertMotor(size: number) { mp.string(`NEMA${size}`); motorString(size) }',
      },
      {
        file: "tests/fixtures/string.ts",
        source:
          'export function motorString(size: number) { for (const token of ["round", "dshaft"]) mp.string(`nema${size}_${token}`) }',
      },
    ])
    const examples = validatedExamples("modelprinter", candidates)
    expect(examples.map((example) => example.spec)).toEqual([
      "NEMA17",
      "nema17_dshaft",
      "nema17_round",
      "NEMA23",
      "nema23_dshaft",
      "nema23_round",
      "NEMA8",
      "nema8_dshaft",
      "nema8_round",
    ])
  })

  test("drops ignored Footprinter tokens, negative geometry cases, and test labels", () => {
    const candidates = extractTestStrings(
      [
        'fp.string("qfn32_thermalpad3.1x3.1mm");',
        'fp.string("qfn32_madeup4mm");',
        'fp.string("0402_parity");',
        'fp.string("0603_x2 with custom p");',
        'fp.string("nonexistentfn4_p3");',
        'fp.string("smdpads4_centerpadwidth2mm");',
        'fp.string("pinrow1025");',
        'fp.string("bga4_grid33x33");',
      ].join("\n"),
    )
    expect(
      validatedExamples("footprinter", candidates).map(
        (example) => example.spec,
      ),
    ).toEqual(["qfn32_thermalpad3.1x3.1mm"])
  })
})

describe("generated example catalog", () => {
  test("retains pinned provenance and discovers all installed ModelPrinter families", () => {
    expect(
      exampleSources.map((source) => `${source.package}@${source.version}`),
    ).toEqual([
      `${sourcePins.modelprinter.package}@${sourcePins.modelprinter.version}`,
      `${sourcePins.footprinter.package}@${sourcePins.footprinter.version}`,
    ])
    expect(
      exampleSources.every(
        (source) =>
          /^[a-f0-9]{40}$/.test(source.commit) && source.testFiles > 0,
      ),
    ).toBe(true)
    expect(
      new Set(
        modelExamples
          .filter((example) => example.library === "modelprinter")
          .map((example) => example.fn),
      ).size,
    ).toBe(modelprinter.getModelNames().length)
    expect(
      modelExamples.filter((example) => example.library === "footprinter")
        .length,
    ).toBeGreaterThan(300)
    expect(new Set(modelExamples.map((example) => example.id)).size).toBe(
      modelExamples.length,
    )
    expect(
      modelExamples.every((example) =>
        example.sources.every(
          (source) => source.file.startsWith("tests/") && source.line > 0,
        ),
      ),
    ).toBe(true)
  })

  test("searches model strings and respects library filters", () => {
    const spur = searchExamples("SPURGEAR bore", "modelprinter")
    expect(spur.length).toBeGreaterThan(0)
    expect(
      spur.every(
        (example) =>
          example.fn === "spurgear" &&
          example.spec.toLowerCase().includes("bore"),
      ),
    ).toBe(true)
    expect(searchExamples("thermalpad", "footprinter").length).toBeGreaterThan(
      0,
    )
    expect(searchExamples("this-query-does-not-exist")).toEqual([])
  })
})
