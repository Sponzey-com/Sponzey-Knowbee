import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { writeFileSync } from "node:fs"
import { chromium } from "playwright-core"

const require = createRequire(import.meta.url)
const axePath = require.resolve("axe-core/axe.min.js")
const token = process.env.KNOWBEE_TEST_TOKEN ?? ""
if (!token) throw new Error("knowbee_test_token_required")

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4221"
const outputPath = resolve(process.argv[3] ?? ".tasks/canonical-accessibility-evidence.json")
const routes = ["/chat", "/work/runs", "/agents", "/capabilities/skills", "/settings/basics"]
const profiles = [
  { id: "mobile-ko", language: "ko", viewport: { width: 375, height: 812 }, textZoom: 2 },
  { id: "mobile-en", language: "en", viewport: { width: 375, height: 812 }, textZoom: 2 },
  { id: "desktop-en", language: "en", viewport: { width: 1440, height: 900 }, textZoom: 1 },
]

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
})

try {
  const samples = []
  for (const profile of profiles) {
    for (const route of routes) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        reducedMotion: "reduce",
      })
      await context.addInitScript(
        ({ authToken, language }) => {
          localStorage.setItem("knowbee_token", authToken)
          localStorage.setItem("knowbee_ui_language", language)
        },
        { authToken: token, language: profile.language },
      )
      const page = await context.newPage()
      page.setDefaultTimeout(20_000)
      const pageErrors = []
      page.on("pageerror", (error) => pageErrors.push(error.message))
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" })
      const languageButton = page.getByRole("button", {
        name: profile.language === "en" ? /^English$/u : /^한글$/u,
      })
      await languageButton.click()
      await page.locator("main h1").first().waitFor({ state: "visible" })
      if (profile.textZoom > 1) {
        await page.evaluate((scale) => {
          document.documentElement.style.fontSize = `${scale * 100}%`
        }, profile.textZoom)
        await page.waitForTimeout(100)
      }
      await page.addScriptTag({ path: axePath })
      const axe = await page.evaluate(async () => {
        const result = await globalThis.axe.run("main", {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        })
        return result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodeCount: violation.nodes.length,
        }))
      })
      const semantic = await page.evaluate(() => {
        const visible = (element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden"
        }
        const headings = [...document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6")]
          .filter(visible)
          .map((heading) => Number(heading.tagName.slice(1)))
        const headingHierarchyValid =
          headings[0] === 1 && headings.every((level, index) => index === 0 || level <= headings[index - 1] + 1)
        const controls = [...document.querySelectorAll("main input, main select, main textarea")].filter(visible)
        const unlabeledFormControlCount = controls.filter((control) => {
          const labels = "labels" in control && control.labels ? control.labels.length : 0
          return labels === 0 && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby")
        }).length
        const invalidErrorAssociationCount = controls.filter((control) => {
          if (control.getAttribute("aria-invalid") !== "true") return false
          const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean)
          return ids.length === 0 || ids.some((id) => !document.getElementById(id))
        }).length
        const invalidLiveRegionCount = [...document.querySelectorAll("main [role='alert'], main [role='status'], main [aria-live]")]
          .filter(visible)
          .filter((region) => !(region.textContent ?? "").trim()).length
        return {
          mainCount: document.querySelectorAll("main").length,
          h1Count: headings.filter((level) => level === 1).length,
          headingLevels: headings,
          headingHierarchyValid,
          formControlCount: controls.length,
          unlabeledFormControlCount,
          invalidErrorAssociationCount,
          invalidLiveRegionCount,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        }
      })
      await page.locator("body").focus()
      const keyboard = await collectKeyboardTraversal(page, 20)
      const ariaSnapshot = await page.locator("main").ariaSnapshot()
      const languageApplied = (await languageButton.getAttribute("aria-pressed")) === "true"
      const criticalViolationCount = axe
        .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
        .reduce((sum, violation) => sum + violation.nodeCount, 0)
      const passed =
        criticalViolationCount === 0 &&
        semantic.mainCount === 1 &&
        semantic.h1Count === 1 &&
        semantic.headingHierarchyValid &&
        semantic.unlabeledFormControlCount === 0 &&
        semantic.invalidErrorAssociationCount === 0 &&
        semantic.invalidLiveRegionCount === 0 &&
        !semantic.horizontalOverflow &&
        keyboard.hiddenFocusCount === 0 &&
        keyboard.focusedElementCount > 0 &&
        languageApplied &&
        pageErrors.length === 0
      samples.push({
        profile: profile.id,
        language: profile.language,
        route,
        passed,
        criticalViolationCount,
        axe,
        semantic,
        keyboard,
        languageApplied,
        ariaSnapshotHash: createHash("sha256").update(ariaSnapshot).digest("hex"),
        ariaSnapshotLineCount: ariaSnapshot.split("\n").length,
        pageErrorCount: pageErrors.length,
      })
      await context.close()
    }
  }

  const commandPalette = await verifyCommandPalette(browser)
  const evidence = {
    schemaVersion: "knowbee.canonical-accessibility:v2",
    passed: samples.every((sample) => sample.passed) && commandPalette.passed,
    sampleCount: samples.length,
    criticalViolationCount: samples.reduce((sum, sample) => sum + sample.criticalViolationCount, 0),
    samples,
    commandPalette,
  }
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({
    passed: evidence.passed,
    sampleCount: evidence.sampleCount,
    criticalViolationCount: evidence.criticalViolationCount,
    failedSamples: samples.filter((sample) => !sample.passed).map((sample) => `${sample.profile}:${sample.route}`),
    commandPalette,
    outputPath,
  }, null, 2)}\n`)
  if (!evidence.passed) process.exitCode = 1
} finally {
  await browser.close()
}

async function collectKeyboardTraversal(page, limit) {
  let hiddenFocusCount = 0
  const fingerprints = new Set()
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab")
    const focused = await page.evaluate(() => {
      const element = document.activeElement
      if (!(element instanceof HTMLElement) || element === document.body) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        fingerprint: `${element.tagName}:${element.getAttribute("role") ?? ""}:${element.getAttribute("aria-label") ?? ""}:${element.id}`,
        hidden: rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden",
      }
    })
    if (!focused) continue
    fingerprints.add(focused.fingerprint)
    if (focused.hidden) hiddenFocusCount += 1
  }
  return { focusedElementCount: fingerprints.size, hiddenFocusCount }
}

async function verifyCommandPalette(browserInstance) {
  const context = await browserInstance.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((authToken) => {
    localStorage.setItem("knowbee_token", authToken)
    localStorage.setItem("knowbee_ui_language", "en")
  }, token)
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  await page.goto(`${baseUrl}/chat`, { waitUntil: "networkidle" })
  const trigger = page.getByRole("button", { name: /명령|Command/u }).first()
  await trigger.focus()
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: /Command palette/u })
  await dialog.waitFor({ state: "visible" })
  const initialFocusContained = await dialog.evaluate((element) => element.contains(document.activeElement))
  let tabContained = true
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab")
    if (!(await dialog.evaluate((element) => element.contains(document.activeElement)))) tabContained = false
  }
  await page.keyboard.press("Escape")
  await dialog.waitFor({ state: "hidden" })
  const focusReturned = await trigger.evaluate((element) => document.activeElement === element)
  await context.close()
  return {
    passed: initialFocusContained && tabContained && focusReturned,
    initialFocusContained,
    tabContained,
    focusReturned,
  }
}
