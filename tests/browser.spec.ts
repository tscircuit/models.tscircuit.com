import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { join } from "node:path"

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

test("spur controls regenerate real geometry and preserve the last valid preview", async ({
  page,
}, testInfo) => {
  await page.goto("/")
  await expect(dimensions(page)).toContainText("26 × 26 × 5")
  await settle(page)
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
  await page.goto("/")
  const search = page.getByRole("textbox", { name: "Search functions" })
  await search.fill("gear")
  await expect(page.locator(".catalog-item")).toHaveCount(2)
  await search.fill("nothing-matches-this-function")
  await expect(
    page.getByText("No functions found", { exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Clear search" }).click()
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
  await page.goto("/")
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
  await page.goto("/")
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
  await page.goto("/")
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
  await expect(dimensions(page)).toContainText("26 × 26 × 5")
  await settle(page)
  await expect(
    page.getByRole("textbox", { name: "Search functions" }),
  ).not.toBeVisible()
  await page.getByRole("button", { name: "Open catalog", exact: true }).click()
  await page.getByRole("textbox", { name: "Search functions" }).fill("worm")
  await page.getByTestId("catalog-wormgear").click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Worm gear")
  await expect(
    page.getByRole("textbox", { name: "Search functions" }),
  ).not.toBeVisible()
  await expect(dimensions(page)).toContainText("12 × 12 × 20")

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
})

test("imported NEMA strings retain automatic frame dimensions and required resets", async ({
  page,
}) => {
  await page.goto("/")
  await expect(dimensions(page)).toContainText("26 × 26 × 5")
  await settle(page)
  await spec(page).fill("")
  await page.getByRole("heading", { level: 1 }).click()
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
