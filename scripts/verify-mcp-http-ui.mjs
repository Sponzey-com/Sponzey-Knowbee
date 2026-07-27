import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const applicationUrl = process.argv[2] ?? "http://127.0.0.1:4220/capabilities/mcp"
const executablePath =
  process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/mcp-http-ui-evidence.json")
const mcpRef = `mcp_v1_${"e".repeat(24)}`
const browser = await chromium.launch({ executablePath, headless: true })

try {
  const results = []
  for (const profile of [
    { id: "desktop", viewport: { width: 1440, height: 900 } },
    { id: "mobile", viewport: { width: 390, height: 844 } },
  ]) {
    let revision = 0
    let item = null
    let payloadExclusive = false
    const context = await browser.newContext({ viewport: profile.viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    await page.route("**/api/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupCompleted: true }),
      }),
    )
    await page.route("**/api/setup/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ completed: true, currentStep: "done", setupCompleted: true }),
      }),
    )
    await page.route("**/api/ui/shell", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
    )
    await page.route("**/api/capabilities", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], generatedAt: Date.now() }),
      }),
    )
    await page.route("**/api/capabilities/mcp**", async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      if (path === "/api/capabilities/mcp/probe" && method === "POST") {
        const body = request.postDataJSON()
        if (String(body.draft.url).includes("invalid"))
          return route.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({
              state: "failed",
              ready: false,
              reasonCode: "mcp_connection_probe_failed",
              tools: [],
              observedAt: Date.now(),
            }),
          })
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            state: "ready",
            ready: true,
            reasonCode: null,
            tools: [{ name: "inspect", description: "Inspect designs" }],
            observedAt: Date.now(),
          }),
        })
      }
      if (path === "/api/capabilities/mcp" && method === "POST") {
        const body = request.postDataJSON()
        payloadExclusive =
          body.draft.transport === "http" &&
          typeof body.draft.url === "string" &&
          body.draft.command === "" &&
          body.draft.cwd === "" &&
          Array.isArray(body.draft.args) &&
          body.draft.args.length === 0
        revision = 1
        item = {
          mcpRef,
          displayName: body.draft.displayName,
          transport: "http",
          configuredStatus: "enabled",
          runtimeStatus: "ready",
          required: false,
          toolCount: 1,
          bindingCount: 0,
          issueCode: null,
          revision,
        }
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            mutationId: body.envelope.mutationId,
            state: "active",
            reasonCode: null,
            allowedActions: [],
            revision,
            mcpRef,
          }),
        })
      }
      if (path === `/api/capabilities/mcp/${mcpRef}` && method === "GET")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...item,
            tools: [{ name: "inspect", description: "Inspect designs" }],
            bindings: { boundAgents: [], availableAgents: [] },
          }),
        })
      if (path === "/api/capabilities/mcp" && method === "GET")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: item ? [item] : [],
            nextCursor: null,
            revision,
            observedAt: Date.now(),
          }),
        })
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
    })

    await page.goto(applicationUrl, { waitUntil: "domcontentloaded" })
    await page.getByRole("heading", { name: "MCP", exact: true }).waitFor()
    const add = page.getByRole("button", { name: "MCP 추가" })
    await add.click()
    await page.getByRole("button", { name: "HTTP", exact: true }).click()
    const stdioFieldsHidden =
      (await page.getByLabel("실행 파일").count()) === 0 &&
      (await page.getByLabel("작업 폴더 (선택)").count()) === 0
    const minTarget = await page.evaluate(() =>
      Math.min(
        ...[...document.querySelectorAll("button[aria-pressed]")].map(
          (node) => node.getBoundingClientRect().height,
        ),
      ),
    )
    await page.getByLabel("이름").fill("Penpot HTTP")
    await page.getByLabel("HTTP endpoint").fill("https://invalid.example/mcp")
    await page.getByRole("button", { name: "연결 확인" }).click()
    await page.getByText("연결할 수 없습니다. 연결 정보를 확인해 주세요.").waitFor()
    const failureVisible = await page
      .getByText("연결할 수 없습니다. 연결 정보를 확인해 주세요.")
      .isVisible()
    await page.getByLabel("HTTP endpoint").fill("https://mcp.example.test/endpoint")
    await page.getByRole("button", { name: "연결 확인" }).click()
    await page.getByText("연결 확인 완료").waitFor()
    const drawerScreenshotPath = resolve(`.tasks/mcp-http-drawer-${profile.id}.png`)
    await page.screenshot({ path: drawerScreenshotPath, fullPage: true })
    await page.getByRole("button", { name: "저장" }).click()
    await page.getByText("Inspect designs").waitFor()
    await page.getByRole("button", { name: /Close Penpot HTTP/ }).click()
    const focusReturned = await page.evaluate(
      () => document.activeElement?.textContent?.includes("Penpot HTTP") === true,
    )
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }))
    const screenshotPath = resolve(`.tasks/mcp-http-${profile.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({
      profileId: profile.id,
      stdioFieldsHidden,
      failureVisible,
      payloadExclusive,
      focusReturned,
      layout: { ...layout, minTarget },
      drawerScreenshotPath,
      screenshotPath,
    })
    await context.close()
  }
  const status = results.every(
    (entry) =>
      entry.stdioFieldsHidden &&
      entry.failureVisible &&
      entry.payloadExclusive &&
      entry.focusReturned &&
      !entry.layout.overflow &&
      entry.layout.minTarget >= 44,
  )
    ? "passed"
    : "failed"
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ status, results }, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ status, outputPath, results }, null, 2)}\n`)
  if (status !== "passed") process.exitCode = 1
} finally {
  await browser.close()
}
