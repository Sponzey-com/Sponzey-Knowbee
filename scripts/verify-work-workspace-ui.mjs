import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const token = process.env.KNOWBEE_TEST_TOKEN ?? ""
if (!token) throw new Error("knowbee_test_token_required")

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4220"
const executablePath =
  process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/task046-work-workspace-evidence.json")

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
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(15_000)
    let runRequests = 0
    let scheduleRequests = 0
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname
      if (/^\/api\/(?:runs|tasks|operations)(?:\/|$)/u.test(pathname)) runRequests += 1
      if (/^\/api\/(?:schedules|scheduler)(?:\/|$)/u.test(pathname)) scheduleRequests += 1
    })

    await page.goto(`${baseUrl}/setup`, { waitUntil: "domcontentloaded" })
    await page.waitForURL("**/settings/basics")
    await page.locator('[data-testid="single-settings-workspace"]').waitFor({ state: "visible" })
    runRequests = 0
    scheduleRequests = 0

    const openClientRoute = async (pathname) => {
      await page.evaluate((path) => {
        window.history.pushState({}, "", path)
        window.dispatchEvent(new PopStateEvent("popstate"))
      }, pathname)
      await page.waitForURL(`**${pathname}`)
      await page.locator('[data-testid="work-workspace"]').waitFor({ state: "visible" })
      await page.locator(`a[href="${pathname}"][aria-current="page"]`).waitFor({ state: "visible" })
    }

    await openClientRoute("/work/schedules")
    await page.waitForTimeout(800)
    const runRequestsOnSchedules = runRequests
    const scheduleRequestsAfterSchedules = scheduleRequests
    const scheduleLayout = await measureLayout(page)
    const scheduleScreenshot = resolve(`.tasks/task046-${profile.id}-schedules.png`)
    await page.screenshot({ path: scheduleScreenshot, fullPage: false })

    await openClientRoute("/work/runs")
    await page.waitForTimeout(800)
    const scheduleRequestsOnRuns = scheduleRequests - scheduleRequestsAfterSchedules
    const runLayout = await measureLayout(page)
    const runsScreenshot = resolve(`.tasks/task046-${profile.id}-runs.png`)
    await page.screenshot({ path: runsScreenshot, fullPage: false })

    await page.goBack({ waitUntil: "domcontentloaded" })
    await page.waitForURL("**/work/schedules")
    const backRestoredPath = new URL(page.url()).pathname

    await page.evaluate(() => {
      window.history.pushState({}, "", "/work/not-a-view")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    await page.waitForURL("**/work/runs")
    const invalidNormalizedPath = new URL(page.url()).pathname

    results.push({
      profile: profile.id,
      runRequestsOnSchedules,
      scheduleRequestsAfterSchedules,
      scheduleRequestsOnRuns,
      runRequestsAfterRuns: runRequests,
      backRestoredPath,
      invalidNormalizedPath,
      scheduleLayout,
      runLayout,
      scheduleScreenshot,
      runsScreenshot,
    })
    await context.close()
  }

  const passed = results.every(
    (result) =>
      result.runRequestsOnSchedules === 0 &&
      result.scheduleRequestsAfterSchedules > 0 &&
      result.scheduleRequestsOnRuns === 0 &&
      result.runRequestsAfterRuns > 0 &&
      result.backRestoredPath === "/work/schedules" &&
      result.invalidNormalizedPath === "/work/runs" &&
      !result.scheduleLayout.overflow &&
      !result.runLayout.overflow &&
      result.scheduleLayout.smallestTabHeight >= 44 &&
      result.runLayout.smallestTabHeight >= 44,
  )
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ passed, results }, null, 2)}\n`)
  if (!passed) throw new Error("work_workspace_verification_failed")
  process.stdout.write(`${JSON.stringify({ passed, outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const tabs = [...document.querySelectorAll('[data-testid="work-workspace"] nav a')].map(
      (element) => element.getBoundingClientRect().height,
    )
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: root.scrollWidth,
      overflow: root.scrollWidth > window.innerWidth + 1,
      smallestTabHeight: tabs.length ? Math.min(...tabs) : 0,
    }
  })
}
