/** Discover supported model strings without executing upstream test code. */
import { createHash } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import ts from "typescript"
import { fp, getFootprintNames } from "@tscircuit/footprinter"
import { modelprinter } from "@tscircuit/modelprinter"
import footprintMetadata from "../src/lib/footprint-parameters.json"
import type { Library } from "../src/lib/catalog-types"
import type { ModelExample } from "../src/lib/examples"

const appRoot = resolve(import.meta.dir, "..")
export const sourcePins = {
  footprinter: {
    package: "@tscircuit/footprinter",
    version: "0.0.430",
    repository: "tscircuit/footprinter",
    commit: "69b6d99f65c30afc0e1c578a7754dce5d1dbcdfe",
  },
  modelprinter: {
    package: "@tscircuit/modelprinter",
    version: "0.0.7",
    repository: "tscircuit/modelprinter",
    commit: "e20a65dab565666481c2a6872c9eff6bfd9df53b",
  },
} as const

/** Clean Vercel checkouts fetch the exact sources matching the installed packages. */
export async function getPinnedSource(library: Library): Promise<string> {
  const pin = sourcePins[library]
  const installed = JSON.parse(
    await readFile(
      join(appRoot, "node_modules", pin.package, "package.json"),
      "utf8",
    ),
  )
  if (installed.version !== pin.version)
    throw new Error(
      `Update the ${library} source pin: installed ${installed.version}, pinned ${pin.version}`,
    )
  const cacheRoot = join(appRoot, "node_modules/.cache/tscircuit-sources")
  const destination = join(cacheRoot, `${library}-${pin.commit}`)
  const marker = join(destination, ".source-commit")
  try {
    if ((await readFile(marker, "utf8")).trim() === pin.commit)
      return destination
  } catch {
    /* A missing source cache is downloaded below. */
  }

  await mkdir(cacheRoot, { recursive: true })
  const temporary = await mkdtemp(join(cacheRoot, `.building-${library}-`))
  try {
    const url = `https://codeload.github.com/${pin.repository}/tar.gz/${pin.commit}`
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok)
      throw new Error(`Cannot fetch ${library} source (${response.status})`)
    const archive = join(temporary, "source.tar.gz")
    await Bun.write(archive, response)
    const extracted = join(temporary, "source")
    await mkdir(extracted)
    const extraction = Bun.spawn(
      ["tar", "-xzf", archive, "--strip-components=1", "-C", extracted],
      {
        stdout: "ignore",
        stderr: "pipe",
      },
    )
    if ((await extraction.exited) !== 0)
      throw new Error(
        `Cannot extract ${library}: ${await new Response(extraction.stderr).text()}`,
      )
    const downloaded = JSON.parse(
      await readFile(join(extracted, "package.json"), "utf8"),
    )
    if (downloaded.version !== pin.version)
      throw new Error(
        `${library} commit ${pin.commit} contains unexpected version ${downloaded.version}`,
      )
    // Source schema imports resolve through the app's locked dependencies.
    await symlink(
      join(appRoot, "node_modules"),
      join(extracted, "node_modules"),
      "dir",
    )
    await writeFile(join(extracted, ".source-commit"), pin.commit)
    try {
      await rename(extracted, destination)
    } catch (error) {
      // A parallel build may already have populated this immutable cache.
      if (
        (await readFile(marker, "utf8").catch(() => "")).trim() !== pin.commit
      )
        throw error
    }
    return destination
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

type StaticValue =
  | string
  | number
  | boolean
  | null
  | StaticValue[]
  | { [key: string]: StaticValue }
type Environment = Map<string, StaticValue[]>
export interface StringCandidate {
  spec: string
  file: string
  line: number
}
export interface TestSource {
  source: string
  file: string
}
interface ExtractionOptions {
  functionArguments?: Map<string, StaticValue[][]>
  onCall?: (call: ts.CallExpression, environment: Environment) => void
}
const combinationLimit = 256

function combinations<T>(groups: T[][]): T[][] {
  let rows: T[][] = [[]]
  for (const group of groups) {
    if (!group.length) return []
    rows = rows
      .flatMap((row) => group.map((value) => [...row, value]))
      .slice(0, combinationLimit)
  }
  return rows
}

/** Resolve finite literal expressions and loop variables; never eval test code. */
function evaluate(
  node: ts.Node | undefined,
  environment: Environment,
): StaticValue[] {
  if (!node) return []
  if (ts.isStringLiteralLike(node)) return [node.text]
  if (ts.isNumericLiteral(node)) return [Number(node.text)]
  if (node.kind === ts.SyntaxKind.TrueKeyword) return [true]
  if (node.kind === ts.SyntaxKind.FalseKeyword) return [false]
  if (node.kind === ts.SyntaxKind.NullKeyword) return [null]
  if (ts.isIdentifier(node)) return environment.get(node.text) ?? []
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  )
    return evaluate(node.expression, environment)
  if (ts.isArrayLiteralExpression(node))
    return combinations(
      node.elements.map((element) => evaluate(element, environment)),
    )
  if (ts.isObjectLiteralExpression(node)) {
    const properties = node.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property)) return []
      const name = property.name
      if (
        !ts.isIdentifier(name) &&
        !ts.isStringLiteral(name) &&
        !ts.isNumericLiteral(name)
      )
        return []
      return [
        { key: name.text, values: evaluate(property.initializer, environment) },
      ]
    })
    return combinations(properties.map((property) => property.values)).map(
      (values) =>
        Object.fromEntries(
          properties.map((property, index) => [property.key, values[index]!]),
        ) as StaticValue,
    )
  }
  if (ts.isPropertyAccessExpression(node))
    return evaluate(node.expression, environment).flatMap((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return []
      const member = value[node.name.text]
      return member === undefined ? [] : [member]
    })
  if (ts.isElementAccessExpression(node))
    return combinations([
      evaluate(node.expression, environment),
      evaluate(node.argumentExpression, environment),
    ]).flatMap(([value, key]) => {
      if (
        typeof value !== "object" ||
        value === null ||
        (typeof key !== "string" && typeof key !== "number")
      )
        return []
      const member = (value as Record<string, StaticValue>)[String(key)]
      return member === undefined ? [] : [member]
    })
  if (ts.isPrefixUnaryExpression(node))
    return evaluate(node.operand, environment).flatMap((value) =>
      typeof value === "number" && node.operator === ts.SyntaxKind.MinusToken
        ? [-value]
        : [],
    )
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return combinations([
      evaluate(node.left, environment),
      evaluate(node.right, environment),
    ]).flatMap<StaticValue>(([left, right]) => {
      if (typeof left === "number" && typeof right === "number")
        return [left + right]
      if (typeof left === "string" || typeof right === "string")
        return [String(left) + String(right)]
      return []
    })
  if (ts.isConditionalExpression(node))
    return [
      ...evaluate(node.whenTrue, environment),
      ...evaluate(node.whenFalse, environment),
    ].slice(0, combinationLimit)
  if (ts.isTemplateExpression(node)) {
    const groups = node.templateSpans.map((span) =>
      evaluate(span.expression, environment),
    )
    return combinations(groups).map(
      (values) =>
        node.head.text +
        node.templateSpans
          .map((span, index) => String(values[index]) + span.literal.text)
          .join(""),
    )
  }
  return []
}

function bind(
  name: ts.BindingName,
  values: StaticValue[],
  environment: Environment,
) {
  if (ts.isIdentifier(name)) environment.set(name.text, values)
  else if (ts.isArrayBindingPattern(name)) {
    name.elements.forEach((element, index) => {
      if (!ts.isBindingElement(element)) return
      bind(
        element.name,
        values.flatMap((value) =>
          Array.isArray(value) && value[index] !== undefined
            ? [value[index]!]
            : [],
        ),
        environment,
      )
    })
  } else {
    name.elements.forEach((element) => {
      const key = element.propertyName ?? element.name
      if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) return
      bind(
        element.name,
        values.flatMap((value) => {
          if (
            typeof value !== "object" ||
            value === null ||
            Array.isArray(value)
          )
            return []
          return value[key.text] === undefined ? [] : [value[key.text]!]
        }),
        environment,
      )
    })
  }
}

export function extractTestStrings(
  source: string,
  file = "test.ts",
  options: ExtractionOptions = {},
): StringCandidate[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const candidates: StringCandidate[] = []
  const add = (node: ts.Node, values: StaticValue[]) => {
    for (const value of values) {
      if (typeof value !== "string" || !value.trim() || value.length > 4096)
        continue
      candidates.push({
        spec: value.trim(),
        file,
        line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      })
    }
  }
  const visit = (node: ts.Node, environment: Environment) => {
    if (ts.isVariableDeclaration(node))
      bind(node.name, evaluate(node.initializer, environment), environment)
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateExpression(node) ||
      ts.isBinaryExpression(node)
    )
      add(node, evaluate(node, environment))
    if (ts.isCallExpression(node)) options.onCall?.(node, environment)
    if (ts.isFunctionDeclaration(node) && node.name) {
      const local = new Map(environment)
      const argumentsByPosition = options.functionArguments?.get(node.name.text)
      node.parameters.forEach((parameter, index) =>
        bind(
          parameter.name,
          argumentsByPosition?.[index] ??
            evaluate(parameter.initializer, environment),
          local,
        ),
      )
      if (node.body) visit(node.body, local)
      return
    }
    if (ts.isForOfStatement(node)) {
      visit(node.expression, environment)
      const local = new Map(environment)
      const iterableValues = evaluate(node.expression, environment).flatMap(
        (value) => (Array.isArray(value) ? value : []),
      )
      const declaration = ts.isVariableDeclarationList(node.initializer)
        ? node.initializer.declarations[0]
        : undefined
      if (declaration) bind(declaration.name, iterableValues, local)
      visit(node.statement, local)
      return
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["forEach", "map"].includes(node.expression.name.text)
    ) {
      const callback = node.arguments[0]
      if (
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ) {
        visit(node.expression, environment)
        const local = new Map(environment)
        const values = evaluate(
          node.expression.expression,
          environment,
        ).flatMap((value) => (Array.isArray(value) ? value : []))
        if (callback.parameters[0])
          bind(callback.parameters[0].name, values, local)
        visit(callback.body, local)
        return
      }
    }
    const scoped =
      ts.isBlock(node) || ts.isFunctionLike(node)
        ? new Map(environment)
        : environment
    ts.forEachChild(node, (child) => visit(child, scoped))
  }
  visit(tree, new Map())
  return candidates
}

/** Carry finite arguments into imported fixture functions, including nested calls. */
export function extractAllTestStrings(files: TestSource[]): StringCandidate[] {
  const fileNames = new Set(files.map((file) => file.file))
  const definitions = new Set<string>()
  const aliases = new Map<string, Map<string, string>>()
  for (const file of files) {
    const tree = ts.createSourceFile(
      file.file,
      file.source,
      ts.ScriptTarget.Latest,
      true,
    )
    const local = new Map<string, string>()
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const canonical = `${file.file}#${node.name.text}`
        definitions.add(canonical)
        local.set(node.name.text, canonical)
      }
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const module = node.moduleSpecifier.text
        const bindings = node.importClause?.namedBindings
        if (module.startsWith(".") && bindings && ts.isNamedImports(bindings)) {
          const path = join(dirname(file.file), module)
          const target = [
            path,
            `${path}.ts`,
            `${path}.tsx`,
            `${path}.js`,
            join(path, "index.ts"),
          ].find((candidate) => fileNames.has(candidate))
          if (target)
            for (const binding of bindings.elements)
              local.set(
                binding.name.text,
                `${target}#${binding.propertyName?.text ?? binding.name.text}`,
              )
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
    aliases.set(file.file, local)
  }

  const argumentsByFunction = new Map<string, StaticValue[][]>()
  let candidates: StringCandidate[] = []
  for (let iteration = 0; iteration < 8; iteration++) {
    let changed = false
    candidates = files.flatMap((file) => {
      const localAliases = aliases.get(file.file)!
      const localArguments = new Map<string, StaticValue[][]>()
      for (const [name, canonical] of localAliases) {
        if (
          canonical.startsWith(`${file.file}#`) &&
          argumentsByFunction.has(canonical)
        )
          localArguments.set(name, argumentsByFunction.get(canonical)!)
      }
      return extractTestStrings(file.source, file.file, {
        functionArguments: localArguments,
        onCall(call, environment) {
          if (!ts.isIdentifier(call.expression)) return
          const canonical = localAliases.get(call.expression.text)
          if (!canonical || !definitions.has(canonical)) return
          const previous = argumentsByFunction.get(canonical) ?? []
          call.arguments.forEach((argument, index) => {
            const values = evaluate(argument, environment)
            const known = new Map(
              (previous[index] ?? []).map((value) => [
                JSON.stringify(value),
                value,
              ]),
            )
            for (const value of values) {
              const key = JSON.stringify(value)
              if (!known.has(key) && known.size < combinationLimit) {
                known.set(key, value)
                changed = true
              }
            }
            previous[index] = [...known.values()]
          })
          argumentsByFunction.set(canonical, previous)
        },
      })
    })
    if (!changed) break
  }
  return candidates
}

const supportedFunctions = {
  footprinter: new Set(getFootprintNames()),
  modelprinter: new Set(modelprinter.getModelNames()),
}
const footprintParameters = new Map(
  footprintMetadata.functions.map((definition) => [
    definition.name,
    new Set(
      (definition as typeof definition & { acceptedParameters?: string[] })
        .acceptedParameters ??
        definition.parameters.map((parameter) => parameter.key),
    ),
  ]),
)

function withinPreviewLimits(parameters: Record<string, unknown>): boolean {
  if (
    ["num_pins", "numPins"].some(
      (key) =>
        parameters[key] !== undefined &&
        (!Number.isFinite(Number(parameters[key])) ||
          Number(parameters[key]) < 0 ||
          Number(parameters[key]) > 1024),
    )
  )
    return false
  return !["grid", "thermalvias"].some((key) => {
    const value = parameters[key]
    let dimensions: [number, number] | undefined
    if (typeof value === "string") {
      const match = value.match(/^([\d.]+)(?:mm)?x([\d.]+)(?:mm)?$/i)
      if (match) dimensions = [Number(match[1]), Number(match[2])]
    } else if (
      value &&
      typeof value === "object" &&
      "x" in value &&
      "y" in value
    )
      dimensions = [Number(value.x), Number(value.y)]
    if (!dimensions) return false
    const count = dimensions[0] * dimensions[1]
    return !Number.isFinite(count) || count < 0 || count > 1024
  })
}

export function validatedExamples(
  library: Library,
  candidates: StringCandidate[],
): ModelExample[] {
  const entries = new Map<string, ModelExample>()
  for (const candidate of candidates) {
    const existing = entries.get(candidate.spec)
    if (existing) {
      if (
        !existing.sources.some(
          (source) =>
            source.file === candidate.file && source.line === candidate.line,
        )
      )
        existing.sources.push({ file: candidate.file, line: candidate.line })
      continue
    }
    try {
      if (/\s/.test(candidate.spec)) continue
      const builder =
        library === "footprinter"
          ? fp.string(candidate.spec)
          : modelprinter.string(candidate.spec)
      if (library === "footprinter") {
        // Footprinter's .json() also invokes its generator, so reject excessive
        // raw counts before constructing any pads, vias, or silkscreen.
        const raw = builder.params() as Record<string, unknown>
        const fn = raw.fn
        if (
          typeof fn !== "string" ||
          !supportedFunctions.footprinter.has(fn) ||
          !withinPreviewLimits(raw)
        )
          continue
        const accepted = footprintParameters.get(fn)
        if (
          !accepted ||
          Object.keys(raw).some(
            (key) =>
              !["fn", "num_pins", "string", fn].includes(key) &&
              !accepted.has(key),
          )
        )
          continue
      }
      const result = builder.json()
      if (
        !result ||
        typeof result !== "object" ||
        !("fn" in result) ||
        typeof result.fn !== "string"
      )
        continue
      const definition = result as Record<string, unknown> & { fn: string }
      if (!supportedFunctions[library].has(definition.fn)) continue
      if (library === "footprinter") {
        if (!withinPreviewLimits(definition)) continue
        const geometry = fp.string(candidate.spec).circuitJson()
        if (
          !geometry.some((element) =>
            ["pcb_smtpad", "pcb_plated_hole"].includes(element.type),
          )
        )
          continue
      }
      entries.set(candidate.spec, {
        id: `${library}:${createHash("sha256").update(candidate.spec).digest("hex").slice(0, 16)}`,
        library,
        fn: definition.fn,
        spec: candidate.spec,
        sources: [{ file: candidate.file, line: candidate.line }],
      })
    } catch {
      /* Negative test cases and snapshot labels are not examples. */
    }
  }
  return [...entries.values()].sort(
    (left, right) =>
      left.fn.localeCompare(right.fn) || left.spec.localeCompare(right.spec),
  )
}

async function testFiles(directory: string): Promise<string[]> {
  const children = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    children.map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return testFiles(path)
      return /\.(?:[cm]?[jt]sx?|json)$/.test(entry.name) ? [path] : []
    }),
  )
  return nested.flat().sort()
}

export async function generateModelExamples() {
  const examples: ModelExample[] = []
  const sources = []
  for (const library of ["modelprinter", "footprinter"] as const) {
    const sourceDirectory = await getPinnedSource(library)
    const files = await testFiles(join(sourceDirectory, "tests"))
    const candidates = extractAllTestStrings(
      await Promise.all(
        files.map(async (file) => ({
          source: await readFile(file, "utf8"),
          file: relative(sourceDirectory, file),
        })),
      ),
    )
    const validated = validatedExamples(library, candidates)
    examples.push(...validated)
    sources.push({
      library,
      ...sourcePins[library],
      testFiles: files.length,
      scannedStrings: candidates.length,
      examples: validated.length,
    })
    console.log(
      `${library}: ${validated.length} valid examples from ${files.length} test files`,
    )
  }
  const output = join(appRoot, "src/lib/model-examples.json")
  const contents = JSON.stringify({ sources, examples }, null, 2) + "\n"
  // Stable output keeps unchanged source scans from creating unnecessary diffs.
  if ((await readFile(output, "utf8").catch(() => "")) !== contents)
    await writeFile(output, contents)
}

if (import.meta.main) await generateModelExamples()
