import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const applicationUrl = process.argv[2] ?? "http://127.0.0.1:18888/capabilities/mcp"
const executablePath = process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/mcp-catalog-ui-evidence.json")
const refs = { penpot: `mcp_v1_${"a".repeat(24)}`, archive: `mcp_v1_${"b".repeat(24)}` }
const items = [
  { mcpRef: refs.penpot, displayName: "Penpot", transport: "stdio", configuredStatus: "enabled", runtimeStatus: "ready", required: false, toolCount: 2, bindingCount: 1, issueCode: null, revision: 7 },
  { mcpRef: refs.archive, displayName: "Archive", transport: "http", configuredStatus: "enabled", runtimeStatus: "unavailable", required: true, toolCount: 0, bindingCount: 0, issueCode: "mcp_required_unavailable", revision: 8 },
]

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const results = []
  for (const profile of [{ id: "desktop", viewport: { width: 1440, height: 900 } }, { id: "mobile", viewport: { width: 390, height: 844 } }]) {
    const context = await browser.newContext({ viewport: profile.viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    let listReads = 0
    let detailReads = 0
    await page.route("**/api/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ setupCompleted: true }) }))
    await page.route("**/api/setup/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: true, currentStep: "done" }) }))
    await page.route("**/api/setup/draft", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }))
    await page.route("**/api/setup/checks", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ setupCompleted: true }) }))
    await page.route("**/api/ui/shell", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "fixture_unavailable" }) }))
    await page.route("**/api/capabilities", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], generatedAt: Date.now() }) }))
    await page.route("**/api/capabilities/mcp**", async (route) => {
      const url = new URL(route.request().url())
      const ref = url.pathname.split("/").at(-1)
      if (ref?.startsWith("mcp_v1_")) {
        detailReads += 1
        if (ref === refs.penpot) await new Promise((resolveDelay) => setTimeout(resolveDelay, 300))
        const item = items.find((entry) => entry.mcpRef === ref)
        const tools = ref === refs.penpot ? [{ name: "inspect", description: "Inspect a Penpot design" }, { name: "export", description: "Export selected design data" }] : []
        return route.fulfill({ status: item ? 200 : 404, contentType: "application/json", body: JSON.stringify(item ? { ...item, tools } : { error: "mcp_ref_not_found" }) })
      }
      listReads += 1
      const search = (url.searchParams.get("search") ?? "").toLocaleLowerCase()
      const transport = url.searchParams.get("transport")
      const status = url.searchParams.get("status")
      const bound = url.searchParams.get("bound") === "true"
      const filtered = items.filter((item) => (!search || item.displayName.toLocaleLowerCase().includes(search)) && (!transport || item.transport === transport) && (!status || item.runtimeStatus === status) && (!bound || item.bindingCount > 0))
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: filtered, nextCursor: null, revision: 8, observedAt: Date.now() }) })
    })
    await page.goto(applicationUrl, { waitUntil: "commit" })
    await page.getByRole("heading", { name: "MCP", exact: true }).waitFor()
    await page.getByRole("button", { name: /Penpot/ }).waitFor()
    await page.getByLabel("MCP 검색").fill("Penpot")
    await page.getByRole("button", { name: /Archive/ }).waitFor({ state: "detached" })
    await page.getByLabel("MCP 검색").fill("")
    await page.getByLabel("전송 방식").selectOption("http")
    await page.getByRole("button", { name: /Archive/ }).waitFor()
    await page.getByRole("button", { name: /Penpot/ }).waitFor({ state: "detached" })
    await page.getByLabel("전송 방식").selectOption("")
    await page.getByLabel("실행 상태").selectOption("unavailable")
    await page.getByRole("button", { name: /Archive/ }).waitFor()
    await page.getByLabel("실행 상태").selectOption("")
    await page.getByText("연결된 항목만").click()
    await page.getByRole("button", { name: /Archive/ }).waitFor({ state: "detached" })
    await page.getByText("연결된 항목만").click()
    await page.getByRole("button", { name: /Penpot/ }).click()
    await page.getByRole("button", { name: "Close Penpot" }).click()
    await page.getByRole("button", { name: /Archive/ }).click()
    await page.getByText("필수 연결이 준비되지 않았습니다.").waitFor()
    await page.waitForTimeout(400)
    await page.getByRole("heading", { name: "Archive" }).waitFor()
    if (await page.getByText("Inspect a Penpot design").count()) throw new Error("stale MCP detail replaced the current selection")
    await page.getByRole("button", { name: "Close Archive" }).click()
    await page.getByRole("button", { name: /Penpot/ }).click()
    await page.getByText("Inspect a Penpot design").waitFor()
    const screenshotPath = resolve(`.tasks/mcp-catalog-${profile.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    const dimensions = await page.evaluate(() => ({ viewportWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth }))
    results.push({ profileId: profile.id, dimensions, screenshotPath, listReads, detailReads, staleDetailIgnored: true })
    await context.close()
  }
  const status = results.every((item) => !item.dimensions.horizontalOverflow && item.listReads >= 7 && item.detailReads >= 3 && item.staleDetailIgnored) ? "passed" : "failed"
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ status, results }, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ status, outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}
