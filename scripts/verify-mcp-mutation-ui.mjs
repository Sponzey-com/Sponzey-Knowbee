import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const applicationUrl = process.argv[2] ?? "http://127.0.0.1:4220/capabilities/mcp"
const executablePath =
  process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/mcp-mutation-ui-evidence.json")
const mcpRef = `mcp_v1_${"a".repeat(24)}`

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const results = []
  for (const profile of [
    { id: "desktop", viewport: { width: 1440, height: 900 } },
    { id: "mobile", viewport: { width: 390, height: 844 } },
  ]) {
    let revision = 0
    let item = null
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
      const url = new URL(request.url())
      const method = request.method()
      if (url.pathname === "/api/capabilities/mcp/probe" && method === "POST")
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
      if (url.pathname === `/api/capabilities/mcp/${mcpRef}/probe` && method === "POST")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            state: "ready",
            ready: true,
            reasonCode: null,
            observedAt: Date.now(),
          }),
        })
      if (url.pathname === "/api/capabilities/mcp" && method === "POST") {
        revision = 1
        item = {
          mcpRef,
          displayName: "Penpot",
          transport: "stdio",
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
            mutationId: "m1",
            state: "active",
            reasonCode: null,
            allowedActions: [],
            revision,
            mcpRef,
          }),
        })
      }
      if (url.pathname === `/api/capabilities/mcp/${mcpRef}` && method === "PATCH") {
        revision += 1
        const body = request.postDataJSON()
        item = {
          ...item,
          displayName: body.change.displayName,
          required: body.change.required,
          revision,
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            mutationId: "m2",
            state: "active",
            reasonCode: null,
            allowedActions: [],
            revision,
            mcpRef,
          }),
        })
      }
      if (url.pathname === `/api/capabilities/mcp/${mcpRef}` && method === "GET")
        return route.fulfill({
          status: item ? 200 : 404,
          contentType: "application/json",
          body: JSON.stringify(
            item
              ? { ...item, tools: [{ name: "inspect", description: "Inspect designs" }] }
              : { error: "mcp_ref_not_found" },
          ),
        })
      if (url.pathname === "/api/capabilities/mcp" && method === "GET")
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
    const addButton = page.getByRole("button", { name: "MCP 추가" })
    await addButton.click()
    await page.getByLabel("이름").fill("Penpot")
    await page.getByLabel("실행 파일").fill("node")
    await page.getByLabel("인자").fill("server.mjs\n--stdio")
    const drawerOverflow = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }))
    if (profile.id === "desktop") {
      await page.getByRole("button", { name: "연결 확인" }).click()
      await page.getByText("연결 확인 완료").waitFor()
      await page.getByRole("button", { name: "저장" }).click()
      await page.getByText("Inspect designs").waitFor()
      await page.getByRole("button", { name: /Close Penpot/ }).click()
      await page.getByRole("button", { name: /Penpot/ }).click()
      await page.getByRole("button", { name: "수정" }).click()
      if (await page.getByLabel("실행 파일").count())
        throw new Error("saved executable leaked into metadata edit")
      await page.getByLabel("이름").fill("Penpot Design")
      await page.getByRole("button", { name: "연결 확인" }).click()
      await page.getByText("연결 확인 완료").waitFor()
      await page.getByRole("button", { name: "저장" }).click()
      await page.getByText("Inspect designs").waitFor()
    }
    const screenshotPath = resolve(`.tasks/mcp-mutation-${profile.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({
      profileId: profile.id,
      drawerOverflow,
      screenshotPath,
      createVerified: profile.id === "desktop" ? revision >= 1 : true,
      metadataEditVerified: profile.id === "desktop" ? revision === 2 : true,
    })
    await context.close()
  }
  const status = results.every(
    (entry) => !entry.drawerOverflow.overflow && entry.createVerified && entry.metadataEditVerified,
  )
    ? "passed"
    : "failed"
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ status, results }, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ status, outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}
