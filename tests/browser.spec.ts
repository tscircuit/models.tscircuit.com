import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { join } from "node:path"
import { readFile } from "node:fs/promises"
import { Box3, Vector3 } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

const browserErrors = new WeakMap<Page, string[]>()
const canvas = (page: Page) => page.locator(".three-preview-host canvas")
const spec = (page: Page) =>
  page.getByRole("textbox", { name: "Model string", exact: true })
const dimensions = (page: Page) =>
  page.locator(".model-stats .stat-item").filter({ hasText: "×" })
const screenshotPath = (info: TestInfo, name: string) =>
  process.env.PLAYWRIGHT_SCREENSHOT_DIR
    ? join(process.env.PLAYWRIGHT_SCREENSHOT_DIR, name)
    : info.outputPath(name)

const workspaceUrl = (model = "modelprinter:spurgear") =>
  `/?model=${encodeURIComponent(model)}`

async function expectTopSpec(page: Page) {
  await expect(spec(page)).toBeInViewport()
  const field = await spec(page).boundingBox()
  const preview = await page.getByTestId("model-preview").boundingBox()
  expect(field).not.toBeNull()
  expect(preview).not.toBeNull()
  expect(field!.y + field!.height).toBeLessThanOrEqual(preview!.y)
}

async function settle(page: Page) {
  await expect(page.getByTestId("model-preview")).toHaveAttribute(
    "aria-busy",
    "false",
  )
  await expect(page.getByText("Live preview", { exact: true })).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
}

async function openGroup(page: Page, name: string) {
  const group = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: name }) })
    .first()
  if ((await group.getAttribute("open")) === null)
    await group.locator("summary").click()
}

async function svgPads(page: Page) {
  return page.getByTestId("footprint-svg").evaluate((image) => {
    const source = (image as HTMLImageElement).src
    const svg = decodeURIComponent(source.slice(source.indexOf(",") + 1))
    const document = new DOMParser().parseFromString(svg, "image/svg+xml")
    const pads = Array.from(
      document.querySelectorAll('[data-type="pcb_smtpad"]'),
    )
    return {
      count: pads.length,
      circles: pads.filter((pad) => pad.tagName === "circle").length,
      rectangles: pads.filter((pad) => pad.tagName === "rect").length,
      svg,
    }
  })
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  // Exercise the exact text written by Share without relying on an OS clipboard.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as unknown as { copiedText: string }).copiedText = text
        },
      },
    })
  })
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "Browser errors").toEqual([])
})

test("downloads the current geometry as GLB and STEP, including after edits", async ({ page }) => {
  await page.goto(workspaceUrl())
  const downloadButton = page.getByRole("button", { name: "Download model", exact: true })
  await expect(downloadButton).toBeEnabled()
  await downloadButton.focus()
  await page.keyboard.press("ArrowDown")
  await expect(page.getByRole("menuitem", { name: "GLB (.glb)", exact: true })).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await expect(page.getByRole("menuitem", { name: "STEP (.step)", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(downloadButton).toBeFocused()
  await expect(page.getByRole("menu")).toHaveCount(0)

  const download = async (format: "GLB" | "STEP") => {
    await downloadButton.click()
    const pending = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: `${format} (.${format.toLowerCase()})`, exact: true }).click()
    const file = await pending
    expect(file.suggestedFilename()).toMatch(new RegExp(`^spurgear.*\\.${format.toLowerCase()}$`))
    return readFile((await file.path())!)
  }

  const glbBounds = async (buffer: Buffer) => {
    expect(buffer.toString("ascii", 0, 4)).toBe("glTF")
    const gltf = await new GLTFLoader().parseAsync(new Uint8Array(buffer).buffer, "")
    return new Box3().setFromObject(gltf.scene).getSize(new Vector3())
  }
  const initial = await glbBounds(await download("GLB"))
  // Export retains real dimensions while converting Z-up millimeters to Y-up meters.
  expect(initial.x).toBeCloseTo(0.026, 5)
  expect(initial.y).toBeCloseTo(0.005, 5)
  expect(initial.z).toBeCloseTo(0.026, 5)

  await page.getByLabel("Face width", { exact: true }).fill("9mm")
  await expect(downloadButton).toBeDisabled()
  await expect(downloadButton).toBeEnabled()
  const edited = await glbBounds(await download("GLB"))
  expect(edited.y).toBeCloseTo(0.009, 5)
  const step = (await download("STEP")).toString()
  expect(step).toContain("ISO-10303-21;")
  expect(step).toContain("FACETED_BREP")
  expect(step).toContain("SI_UNIT(.MILLI.,.METRE.)")
  expect(step).toContain("END-ISO-10303-21;")

  await openGroup(page, "Bore and hub")
  await page.getByLabel("Bore diameter", { exact: true }).fill("100mm")
  await expect(page.getByRole("alert")).toBeVisible()
  await expect(downloadButton).toBeDisabled()
  await page.getByTestId("catalog-qfn").click()
  await expect(downloadButton).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(downloadButton).toBeInViewport()
  await downloadButton.click()
  await expect(page.getByRole("menuitem", { name: "STEP (.step)", exact: true })).toBeInViewport()
  const pending = page.waitForEvent("download")
  await page.getByRole("menuitem", { name: "GLB (.glb)", exact: true }).click()
  const footprint = await pending
  expect(footprint.suggestedFilename()).toMatch(/^qfn.*\.glb$/)
  expect((await glbBounds(await readFile((await footprint.path())!))).x).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test("spur controls regenerate real geometry and preserve the last valid preview", async ({
  page,
}, testInfo) => {
  await page.goto(workspaceUrl())
  await expect(dimensions(page)).toContainText("26 × 26 × 5")
  await settle(page)
  await expectTopSpec(page)
  await expect(canvas(page)).toBeVisible()
  const before = await canvas(page).screenshot()

  await page.getByLabel("Teeth", { exact: true }).fill("32")
  await expect(spec(page)).toHaveValue(/^spurgear32/)
  await expect(dimensions(page)).toContainText("34 × 34 × 5")
  await settle(page)
  const enlarged = await canvas(page).screenshot()
  expect(enlarged.equals(before)).toBe(false)

  await openGroup(page, "Bore and hub")
  await page.getByLabel("Bore diameter", { exact: true }).fill("3mm")
  await expect(spec(page)).toHaveValue(/bore3mm/)
  await expect
    .poll(async () => (await canvas(page).screenshot()).equals(enlarged))
    .toBe(false)
  await settle(page)

  await page.getByLabel("Bore diameter", { exact: true }).fill("100mm")
  await expect(page.getByRole("alert")).toContainText("Check your parameters")
  await expect(
    page.getByText("Last valid preview", { exact: true }),
  ).toBeVisible()
  await expect(dimensions(page)).toContainText("34 × 34 × 5")
  await expect(canvas(page)).toBeVisible()

  await page.getByLabel("Bore diameter", { exact: true }).fill("2mm")
  await expect(spec(page)).toHaveValue(/bore2mm/)
  await settle(page)
  await page
    .getByRole("button", { name: "Reset defaults", exact: true })
    .click()
  await expect(spec(page)).toHaveValue("spurgear24")
  await expect(dimensions(page)).toContainText("26 × 26 × 5")
  await settle(page)
  await page.screenshot({
    path: screenshotPath(testInfo, "models-configurator-desktop.png"),
    fullPage: true,
  })
})

test("function search and worm controls produce a multi-start left-handed screw", async ({
  page,
}) => {
  await page.goto(workspaceUrl())
  const search = page.getByRole("textbox", { name: "Search functions" })
  await search.fill("gear")
  await expect(page.locator(".catalog-item")).toHaveCount(2)
  await search.fill("nothing-matches-this-function")
  await expect(
    page.getByText("No functions found", { exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Clear search" }).first().click()
  await expect(page.getByTestId("catalog-qfn")).toBeVisible()
  await page.getByTestId("catalog-wormgear").click()
  await expect(dimensions(page)).toContainText("12 × 12 × 20")
  await settle(page)
  const rightHanded = await canvas(page).screenshot()

  await page.getByLabel("Starts", { exact: true }).fill("2")
  await page.getByLabel("Handedness", { exact: true }).selectOption("left")
  await page.getByLabel("Length", { exact: true }).fill("30mm")
  await expect(spec(page)).toHaveValue(/starts2/)
  await expect(spec(page)).toHaveValue(/left/)
  await expect(dimensions(page)).toContainText("12 × 12 × 30")
  await settle(page)
  expect((await canvas(page).screenshot()).equals(rightHanded)).toBe(false)

  await page.getByRole("button", { name: "TypeScript", exact: true }).click()
  await expect(page.locator(".code-content code")).toContainText(
    "modelprinter.string",
  )
  await expect(page.locator(".code-content code")).toContainText(
    "starts2_left_l30mm",
  )
  await page.getByRole("button", { name: "Parameters", exact: true }).click()
  await expect(page.locator(".code-content code")).toContainText(
    '"handedness": "left"',
  )
  await expect(page.locator(".code-content code")).toContainText('"starts": 2')
})

test("footprint controls change SVG pad count, dimensions, and the 3D preview", async ({
  page,
}) => {
  await page.goto(workspaceUrl())
  await page.getByRole("button", { name: "Footprints", exact: true }).click()
  await page.getByTestId("catalog-qfn").click()
  await expect(page.getByTestId("footprint-svg")).toBeVisible()
  await expect.poll(async () => (await svgPads(page)).count).toBe(64)
  const before = await svgPads(page)
  const originalDimensions = await dimensions(page).innerText()

  await page.getByLabel("Pin count", { exact: true }).fill("16")
  await expect.poll(async () => (await svgPads(page)).count).toBe(16)
  await expect(dimensions(page)).not.toHaveText(originalDimensions)
  await settle(page)
  expect((await svgPads(page)).svg).not.toBe(before.svg)
  const small = await svgPads(page)
  const smallDimensions = await dimensions(page).innerText()

  await page.getByLabel("Pitch", { exact: true }).fill("0.75mm")
  await expect.poll(async () => (await svgPads(page)).svg).not.toBe(small.svg)
  await expect(dimensions(page)).not.toHaveText(smallDimensions)
  await expect.poll(async () => (await svgPads(page)).count).toBe(16)
  await settle(page)
  await page.getByRole("button", { name: "3D model", exact: true }).click()
  await expect(canvas(page)).toBeVisible()
  expect((await canvas(page).screenshot()).byteLength).toBeGreaterThan(5000)
  await page.getByRole("button", { name: "Footprint", exact: true }).click()
  await expect(page.getByTestId("footprint-svg")).toBeVisible()
  await expect.poll(async () => (await svgPads(page)).count).toBe(16)
})

test("false boolean overrides change actual BGA pads from circles to rectangles", async ({
  page,
}) => {
  await page.goto(workspaceUrl())
  await page.getByTestId("catalog-bga").click()
  await expect(page.getByTestId("footprint-svg")).toBeVisible()
  await expect
    .poll(async () => (await svgPads(page)).circles)
    .toBeGreaterThan(0)
  const count = (await svgPads(page)).count
  await openGroup(page, "Pads & holes")
  const circular = page.getByLabel("Use circular pads", { exact: true })
  await expect(circular).toBeChecked()
  await circular.uncheck()
  await expect.poll(async () => (await svgPads(page)).circles).toBe(0)
  await expect.poll(async () => (await svgPads(page)).rectangles).toBe(count)
  await settle(page)
  await page.getByRole("button", { name: "TypeScript", exact: true }).click()
  await expect(page.locator(".code-content code")).toContainText(
    '"circularpads": false',
  )
})

test("raw DSL updates controls and shared links restore both libraries", async ({
  page,
}) => {
  await page.goto(workspaceUrl())
  await spec(page).fill("spurgear20_m0.5mm_w3mm_bore2mm")
  await page.getByRole("button", { name: "Apply", exact: true }).click()
  await expect(page.getByLabel("Teeth", { exact: true })).toHaveValue("20")
  await expect(dimensions(page)).toContainText("11 × 11 × 3")
  await settle(page)
  await page.getByRole("button", { name: "Share", exact: true }).click()
  const modelUrl = await page.evaluate(
    () => (window as unknown as { copiedText: string }).copiedText,
  )
  expect(new URL(modelUrl).searchParams.get("model")).toBe(
    "modelprinter:spurgear",
  )
  await page.goto(modelUrl)
  await expect(page.getByLabel("Teeth", { exact: true })).toHaveValue("20")
  await expect(dimensions(page)).toContainText("11 × 11 × 3")
  await settle(page)

  await page.getByTestId("catalog-qfn").click()
  await spec(page).fill("qfn12_p0.75mm")
  await page.getByRole("button", { name: "Apply", exact: true }).click()
  await expect(page.getByLabel("Pin count", { exact: true })).toHaveAttribute(
    "placeholder",
    "12",
  )
  await expect(page.getByLabel("Pitch", { exact: true })).toHaveAttribute(
    "placeholder",
    "0.75",
  )
  await expect.poll(async () => (await svgPads(page)).count).toBe(12)
  await settle(page)
  await page.getByRole("button", { name: "Share", exact: true }).click()
  const footprintUrl = await page.evaluate(
    () => (window as unknown as { copiedText: string }).copiedText,
  )
  expect(new URL(footprintUrl).searchParams.get("spec")).toBe("qfn12_p0.75mm")
  await page.goto(footprintUrl)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("QFN")
  await expect.poll(async () => (await svgPads(page)).count).toBe(12)
  await expect(page.getByLabel("Pitch", { exact: true })).toHaveAttribute(
    "placeholder",
    "0.75",
  )
  await settle(page)

  await spec(page).fill("soic8_p1.27mm")
  await page.getByRole("button", { name: "Apply", exact: true }).click()
  await expect(page.getByRole("heading", { level: 1 })).toContainText("SOIC")
  await expect(page.getByTestId("catalog-soic")).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByLabel("Pin count", { exact: true })).toHaveAttribute(
    "placeholder",
    "8",
  )
  await expect(page.getByLabel("Pitch", { exact: true })).toHaveAttribute(
    "placeholder",
    "1.27",
  )
  await expect.poll(async () => (await svgPads(page)).count).toBe(8)
  await settle(page)
})

test("mobile drawers support configuration and keyboard dismissal", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  const homeSearch = page.getByRole("textbox", { name: "Search functions" })
  await expect(homeSearch).toBeInViewport()
  await homeSearch.fill("wormgear")
  await page.getByRole("button", { name: "Configure wormgear", exact: true }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Worm gear")
  await expect(
    page.getByRole("textbox", { name: "Search functions" }),
  ).not.toBeVisible()
  await expect(dimensions(page)).toContainText("12 × 12 × 20")
  await settle(page)
  await expectTopSpec(page)

  await page
    .getByRole("button", { name: "Open parameters", exact: true })
    .click()
  await page.getByLabel("Starts", { exact: true }).fill("2")
  await page.getByLabel("Handedness", { exact: true }).selectOption("left")
  await page.keyboard.press("Escape")
  await expect(page.getByLabel("Starts", { exact: true })).not.toBeVisible()
  await expect(spec(page)).toHaveValue(/starts2/)
  await expect(spec(page)).toHaveValue(/left/)
  await settle(page)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: screenshotPath(testInfo, "models-configurator-mobile.png"),
    fullPage: true,
  })
  await page.getByRole("button", { name: "Open catalog", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("textbox", { name: "Search functions" }),
  ).not.toBeVisible()
  await page.getByRole("button", { name: "Back to search", exact: true }).click()
  await expect(homeSearch).toBeInViewport()
  await expect(page.getByRole("button", { name: "Configure wormgear", exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
})

test("imported NEMA strings retain automatic frame dimensions and required resets", async ({
  page,
}) => {
  await page.goto(workspaceUrl())
  await expect(dimensions(page)).toContainText("26 × 26 × 5")
  await settle(page)
  await spec(page).fill("")
  await spec(page).blur()
  await expect(spec(page)).toHaveValue("")
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled()

  await spec(page).fill("nema17")
  await page.getByRole("button", { name: "Apply", exact: true }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("NEMA motor")
  const frame = page.getByLabel("NEMA frame", { exact: true })
  const bodyLength = page.getByLabel(/^Body length$/i)
  await expect(frame).toHaveValue("17")
  await expect(bodyLength).toHaveValue("")
  await expect(bodyLength).toHaveAttribute("placeholder", "38")
  await expect(dimensions(page)).toContainText("× 42.3 ×")
  await settle(page)
  const largeMotor = await canvas(page).screenshot()

  await frame.selectOption("8")
  await expect(spec(page)).toHaveValue("nema8")
  await expect(bodyLength).toHaveValue("")
  await expect(bodyLength).toHaveAttribute("placeholder", "33")
  await expect(dimensions(page)).toContainText("× 20.3 ×")
  await settle(page)
  expect((await canvas(page).screenshot()).equals(largeMotor)).toBe(false)

  await page
    .getByRole("button", { name: "Reset NEMA frame", exact: true })
    .click()
  await expect(frame).toHaveValue("17")
  await expect(spec(page)).toHaveValue("nema17")
  await expect(bodyLength).toHaveAttribute("placeholder", "38")
  await expect(dimensions(page)).toContainText("× 42.3 ×")
  await settle(page)
})

test("home searches build-time examples and opens the selected geometry", async ({
  page,
}, testInfo) => {
  await page.goto("/")
  const search = page.getByRole("textbox", { name: "Search functions" })
  await expect(search).toBeInViewport()
  await expect(page.getByRole("textbox", { name: "Model string", exact: true })).toHaveCount(0)
  await expect(page.getByRole("complementary", { name: "Model parameters" })).toHaveCount(0)
  await expect(page.getByTestId("model-preview")).toHaveCount(0)
  await expect(page.locator(".example-card").first()).toBeVisible()
  await expect(page.locator(".example-card img").first()).toBeVisible()
  await page.screenshot({
    path: screenshotPath(testInfo, "models-example-home.png"),
    fullPage: false,
  })

  await search.fill("qfn")
  const footprintExample = page.locator(".example-card").first()
  const footprintImage = footprintExample.getByRole("img")
  await expect(footprintImage).toBeVisible()
  await expect(footprintImage).toHaveAttribute("src", /^data:image\/svg\+xml/)
  const thumbnailPads = await footprintImage.evaluate((image) => {
    const source = (image as HTMLImageElement).src
    const svg = decodeURIComponent(source.slice(source.indexOf(",") + 1))
    return new DOMParser()
      .parseFromString(svg, "image/svg+xml")
      .querySelectorAll('[data-type="pcb_smtpad"]').length
  })
  expect(thumbnailPads).toBeGreaterThan(0)

  await search.fill("missing-example-239847")
  await expect(page.locator(".example-card")).toHaveCount(0)
  await search.fill("spurgear6 width2mm")
  const example = page.getByRole("button", { name: "Configure spurgear6_width2mm", exact: true })
  await expect(example).toBeVisible()
  const modelImage = example.getByRole("img")
  await expect(modelImage).toBeVisible()
  await expect(modelImage).toHaveAttribute("src", /^data:image\/png/)
  await expect.poll(async () => modelImage.evaluate((image) =>
    (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
  )).toBe(true)
  await expect(page.locator(".example-card canvas")).toHaveCount(0)
  await page.screenshot({
    path: screenshotPath(testInfo, "models-example-search.png"),
    fullPage: true,
  })
  await example.click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Spur gear")
  await expect(page.getByLabel("Teeth", { exact: true })).toHaveValue("6")
  await expect(page.getByLabel("Face width", { exact: true })).toHaveValue(/^2(?:mm)?$/)
  await expect(dimensions(page)).toContainText("× 2")
  await settle(page)
  await expectTopSpec(page)
  await page.getByLabel("Face width", { exact: true }).fill("4mm")
  await expect(spec(page)).toHaveValue(/w4mm/)
  await expect(dimensions(page)).toContainText("× 4")
  await settle(page)
  await page.getByRole("button", { name: "Back to search", exact: true }).click()
  await expect(search).toBeInViewport()
  await expect(example).toBeVisible()
  await expect(page.getByTestId("model-preview")).toHaveCount(0)

  await example.click()
  await page.getByRole("button", { name: "Reset Teeth", exact: true }).click()
  await page.getByRole("button", { name: "Reset Face width", exact: true }).click()
  await expect(spec(page)).toHaveValue("spurgear24")
  await expect(dimensions(page)).toContainText("26 × 26 × 5")
  await settle(page)
  await page.getByRole("button", { name: "Share", exact: true }).click()
  const resetUrl = await page.evaluate(
    () => (window as unknown as { copiedText: string }).copiedText,
  )
  await page.goto(resetUrl)
  await expect(spec(page)).toHaveValue("spurgear24")
  await expect(dimensions(page)).toContainText("26 × 26 × 5")
  await settle(page)
})
