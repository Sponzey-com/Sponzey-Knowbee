import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const token = process.env.KNOWBEE_TEST_TOKEN ?? ""
if (!token) throw new Error("knowbee_test_token_required")

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4220"
const executablePath =
  process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/task045-settings-route-evidence.json")

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const results = []
  for (const profile of [
    { id: "desktop", viewport: { width: 1440, height: 900 } },
    { id: "mobile", viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: profile.viewport })
    await context.addInitScript((value) => localStorage.setItem("knowbee_token", value), token)
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    page.setDefaultNavigationTimeout(10_000)
    const checkpoint = (step) => process.stderr.write(`[${profile.id}] ${step}\n`)
    page.on("pageerror", (error) =>
      process.stderr.write(`[${profile.id}] pageerror ${error.message}\n`),
    )
    let agentRequests = 0
    let scheduleRequests = 0
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname
      if (pathname.startsWith("/api/agent-workspace")) agentRequests += 1
      if (pathname.startsWith("/api/schedules")) scheduleRequests += 1
    })

    const openSettings = async (pathname) => {
      await page.evaluate((path) => {
        window.history.pushState({}, "", path)
        window.dispatchEvent(new PopStateEvent("popstate"))
      }, pathname)
      await page.waitForURL(`**${pathname}`)
      try {
        await page
          .locator('[data-testid="single-settings-workspace"]')
          .waitFor({ state: "visible" })
      } catch (error) {
        const bodyText = (await page.locator("body").innerText())
          .replace(/\s+/gu, " ")
          .slice(0, 240)
        throw new Error(
          `settings_workspace_missing path=${new URL(page.url()).pathname} body=${bodyText}`,
          {
            cause: error,
          },
        )
      }
    }

    checkpoint("setup")
    await page.goto(`${baseUrl}/setup`, { waitUntil: "domcontentloaded" })
    await page.waitForURL("**/settings/basics")
    await page.locator('[data-testid="single-settings-workspace"]').waitFor({ state: "visible" })
    const setupRedirectPath = new URL(page.url()).pathname

    checkpoint("sub_agents")
    await openSettings("/settings/sub_agents")
    const agentsLink = page.locator('main a[href="/agents"]')
    await agentsLink.waitFor({ state: "visible" })
    const requestsBeforeAgentsOpen = agentRequests

    checkpoint("automation")
    await openSettings("/settings/automation")
    const schedulesLink = page.locator('main a[href="/work/schedules"]')
    await schedulesLink.waitFor({ state: "visible" })
    const requestsBeforeSchedulesOpen = scheduleRequests

    checkpoint("history")
    await openSettings("/settings/ai")
    await openSettings("/settings/memory")
    await page.goBack({ waitUntil: "domcontentloaded" })
    await page.waitForURL("**/settings/ai")
    const backRestoredPath = new URL(page.url()).pathname

    checkpoint("normalization")
    await page.evaluate(() => {
      window.history.pushState({}, "", "/settings/not-a-section")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    await page.waitForURL("**/settings/basics")
    await page.locator('[data-testid="single-settings-workspace"]').waitFor({ state: "visible" })
    const invalidNormalizedPath = new URL(page.url()).pathname
    const layout = await page.evaluate(() => {
      const root = document.documentElement
      const controls = [
        ...document.querySelectorAll(
          '[data-testid="single-settings-workspace"] button, [data-testid="single-settings-workspace"] a',
        ),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden"
        })
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { width: rect.width, height: rect.height }
        })
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: root.scrollWidth,
        overflow: root.scrollWidth > window.innerWidth + 1,
        smallestControlHeight: controls.length
          ? Math.min(...controls.map((control) => control.height))
          : null,
      }
    })

    checkpoint("complete")
    results.push({
      profile: profile.id,
      setupRedirectPath,
      requestsBeforeAgentsOpen,
      requestsBeforeSchedulesOpen,
      backRestoredPath,
      invalidNormalizedPath,
      layout,
    })
    await context.close()
  }

  const passed = results.every(
    (result) =>
      result.setupRedirectPath === "/settings/basics" &&
      result.requestsBeforeAgentsOpen === 0 &&
      result.requestsBeforeSchedulesOpen === 0 &&
      result.backRestoredPath === "/settings/ai" &&
      result.invalidNormalizedPath === "/settings/basics" &&
      !result.layout.overflow &&
      (result.layout.smallestControlHeight ?? 0) >= 44,
  )
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ passed, results }, null, 2)}\n`)
  if (!passed) throw new Error("settings_route_separation_verification_failed")
  process.stdout.write(`${JSON.stringify({ passed, outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}
