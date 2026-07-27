import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const token = process.env.KNOWBEE_TEST_TOKEN ?? ""
if (!token) throw new Error("knowbee_test_token_required")

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4220"
const executablePath =
  process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/task047-settings-guard-evidence.json")

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
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))

    await page.goto(`${baseUrl}/settings/basics`, { waitUntil: "domcontentloaded" })
    await page.locator('[data-testid="single-settings-workspace"]').waitFor({ state: "visible" })
    const userName = page.getByLabel(/사용자 이름|User name/u)
    const originalName = await userName.inputValue()
    const editedName = `${originalName} guard-check`
    await userName.fill(editedName)

    await page
      .locator('[data-testid="single-settings-workspace"] nav button')
      .filter({ hasText: "AI" })
      .click()
    const dialog = page.getByRole("alertdialog")
    await dialog.waitFor({ state: "visible" })
    const sectionStayPath = new URL(page.url()).pathname
    const focusedAfterOpen = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    )
    await page.keyboard.press("Shift+Tab")
    const focusedAfterReverseTab = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    )
    await page.keyboard.press("Tab")
    const focusedAfterForwardTab = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    )
    await page.keyboard.press("Escape")
    await dialog.waitFor({ state: "hidden" })
    const valueAfterEscape = await userName.inputValue()

    await page.locator('aside a[href="/chat"]').click()
    await dialog.waitFor({ state: "visible" })
    const sidebarStayPath = new URL(page.url()).pathname
    await dialog.getByRole("button", { name: /버리고 이동|Discard and leave/u }).click()
    await page.waitForURL("**/chat")

    await page.goto(`${baseUrl}/settings/ai`, { waitUntil: "domcontentloaded" })
    await page.locator('[data-testid="single-settings-workspace"]').waitFor({ state: "visible" })
    await page
      .locator("button")
      .filter({ hasText: /기본 설정|Basics/u })
      .click()
    await page.waitForURL("**/settings/basics")
    const restoredName = await page.getByLabel(/사용자 이름|User name/u).inputValue()
    await page.getByLabel(/사용자 이름|User name/u).fill(editedName)
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined)
    await dialog.waitFor({ state: "visible" })
    const backStayPath = new URL(page.url()).pathname
    const layout = await page.evaluate(() => {
      const root = document.documentElement
      const modal = document.querySelector('[role="alertdialog"]')
      const buttons = modal ? [...modal.querySelectorAll("button")] : []
      return {
        overflow: root.scrollWidth > window.innerWidth + 1,
        modalWidth: modal?.getBoundingClientRect().width ?? 0,
        smallestButtonHeight: buttons.length
          ? Math.min(...buttons.map((button) => button.getBoundingClientRect().height))
          : 0,
      }
    })
    const screenshot = resolve(`.tasks/task047-${profile.id}-settings-guard.png`)
    await page.screenshot({ path: screenshot, fullPage: false })
    await dialog.getByRole("button", { name: /버리고 이동|Discard and leave/u }).click()
    await page.waitForURL("**/settings/ai")
    const backDiscardPath = new URL(page.url()).pathname

    results.push({
      profile: profile.id,
      sectionStayPath,
      focusedAfterOpen,
      focusedAfterReverseTab,
      focusedAfterForwardTab,
      valueAfterEscapeMatches: valueAfterEscape === editedName,
      sidebarStayPath,
      restoredNameMatches: restoredName === originalName,
      backStayPath,
      backDiscardPath,
      layout,
      screenshot,
      errors,
    })
    await context.close()
  }

  const passed = results.every(
    (result) =>
      result.sectionStayPath === "/settings/basics" &&
      /계속 편집|Keep editing/u.test(result.focusedAfterOpen) &&
      /버리고 이동|Discard and leave/u.test(result.focusedAfterReverseTab) &&
      /계속 편집|Keep editing/u.test(result.focusedAfterForwardTab) &&
      result.valueAfterEscapeMatches &&
      result.sidebarStayPath === "/settings/basics" &&
      result.restoredNameMatches &&
      result.backStayPath === "/settings/basics" &&
      result.backDiscardPath === "/settings/ai" &&
      !result.layout.overflow &&
      result.layout.modalWidth <= (result.profile === "mobile" ? 358 : 448) &&
      result.layout.smallestButtonHeight >= 44 &&
      result.errors.length === 0,
  )
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ passed, results }, null, 2)}\n`)
  if (!passed) throw new Error("settings_navigation_guard_verification_failed")
  process.stdout.write(`${JSON.stringify({ passed, outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}
