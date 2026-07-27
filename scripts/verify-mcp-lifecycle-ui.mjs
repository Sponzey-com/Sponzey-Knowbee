import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const applicationUrl = process.argv[2] ?? "http://127.0.0.1:4220/capabilities/mcp"
const executablePath = process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/mcp-lifecycle-ui-evidence.json")
const mcpRef = `mcp_v1_${"a".repeat(24)}`
const agentRef = `agent_v1_${"b".repeat(24)}`

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const results = []
  for (const profile of [
    { id: "desktop", viewport: { width: 1440, height: 900 } },
    { id: "mobile", viewport: { width: 390, height: 844 } },
  ]) {
    let revision = 7
    let configuredStatus = "enabled"
    let runtimeStatus = "ready"
    let bound = true
    let deleted = false
    const item = () => ({ mcpRef, displayName: "Penpot", transport: "stdio", configuredStatus, runtimeStatus, required: false, toolCount: configuredStatus === "enabled" ? 1 : 0, bindingCount: bound ? 1 : 0, issueCode: configuredStatus === "enabled" ? null : "mcp_inactive", revision })
    const receipt = (overrides = {}) => ({ mutationId: `m${revision}`, state: "active", reasonCode: null, allowedActions: [], revision, mcpRef, status: configuredStatus, deleted, impact: { bindingCount: bound ? 1 : 0, agentNames: bound ? ["Writer"] : [] }, ...overrides })
    const context = await browser.newContext({ viewport: profile.viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    await page.route("**/api/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ setupCompleted: true }) }))
    await page.route("**/api/setup/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: true, currentStep: "done", setupCompleted: true }) }))
    await page.route("**/api/ui/shell", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }))
    await page.route("**/api/capabilities", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], generatedAt: Date.now() }) }))
    await page.route("**/api/capabilities/mcp**", async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      if (path === `/api/capabilities/mcp/${mcpRef}/bindings/${agentRef}` && method === "PATCH") {
        const body = request.postDataJSON()
        bound = body.bound
        revision = body.envelope.targetRevision
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...receipt(), agentRef, bound }) })
      }
      if (path === `/api/capabilities/mcp/${mcpRef}/status` && method === "PATCH") {
        const body = request.postDataJSON()
        configuredStatus = body.enabled ? "enabled" : "disabled"
        runtimeStatus = body.enabled ? "ready" : "inactive"
        revision = body.envelope.targetRevision
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(receipt()) })
      }
      if (path === `/api/capabilities/mcp/${mcpRef}` && method === "DELETE") {
        if (bound) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify(receipt({ state: "rejected", reasonCode: "mcp_delete_in_use" })) })
        const body = request.postDataJSON()
        revision = body.envelope.targetRevision
        deleted = true
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(receipt({ status: "deleted" })) })
      }
      if (path === `/api/capabilities/mcp/${mcpRef}` && method === "GET") {
        return route.fulfill({ status: deleted ? 404 : 200, contentType: "application/json", body: JSON.stringify(deleted ? { error: "mcp_ref_not_found" } : { ...item(), tools: configuredStatus === "enabled" ? [{ name: "inspect", description: "Inspect designs" }] : [], bindings: { boundAgents: bound ? [{ agentRef, name: "Writer" }] : [], availableAgents: bound ? [] : [{ agentRef, name: "Writer" }] } }) })
      }
      if (path === "/api/capabilities/mcp" && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: deleted ? [] : [item()], nextCursor: null, revision, observedAt: Date.now() }) })
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
    })

    await page.goto(applicationUrl, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: /Penpot/ }).click()
    await page.getByText("Writer", { exact: true }).waitFor()
    const deleteButton = page.getByRole("button", { name: "삭제", exact: true })
    const inUseDeleteBlocked = await deleteButton.isDisabled()
    const impactNamed = await page.getByText(/Writer.*해제/).isVisible()
    await page.getByRole("button", { name: "연결 편집" }).click()
    await page.getByLabel("Writer").uncheck()
    await page.getByRole("button", { name: "연결 저장" }).click()
    await page.getByText("연결된 에이전트가 없습니다.").waitFor()
    await page.getByRole("button", { name: "비활성화", exact: true }).click()
    await page.getByRole("button", { name: "확인", exact: true }).click()
    await page.getByRole("button", { name: "활성화", exact: true }).waitFor()
    await page.getByRole("button", { name: "활성화", exact: true }).click()
    await page.getByRole("button", { name: "확인", exact: true }).click()
    await page.getByRole("button", { name: "비활성화", exact: true }).waitFor()
    await page.getByRole("button", { name: "삭제", exact: true }).click()
    await page.getByRole("button", { name: "확인", exact: true }).click()
    await page.getByText("표시할 MCP 연결이 없습니다").waitFor()
    const layout = await page.evaluate(() => ({ viewportWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > window.innerWidth, dialogCount: document.querySelectorAll('[role="dialog"]').length }))
    const screenshotPath = resolve(`.tasks/mcp-lifecycle-${profile.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({ profileId: profile.id, inUseDeleteBlocked, impactNamed, finalRevision: revision, deleted, layout, screenshotPath })
    await context.close()
  }
  const status = results.every((entry) => entry.inUseDeleteBlocked && entry.impactNamed && entry.deleted && entry.finalRevision === 11 && !entry.layout.overflow && entry.layout.dialogCount === 0) ? "passed" : "failed"
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ status, results }, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ status, outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}
