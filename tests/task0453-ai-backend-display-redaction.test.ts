import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { getBackendDisplayLabel } from "../packages/webui/src/lib/ai-display.ts"

const dashboardSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"),
  "utf-8",
)
const routingPrioritySource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "RoutingPriorityEditor.tsx"),
  "utf-8",
)

describe("task0453 AI backend display redaction", () => {
  it("keeps known provider labels user-facing", () => {
    expect(getBackendDisplayLabel("provider:openai", undefined, "ko")).toBe("OpenAI")
    expect(getBackendDisplayLabel("provider:gemini", undefined, "en")).toBe("Gemini")
  })

  it("uses explicit user labels before generic fallback", () => {
    expect(getBackendDisplayLabel("provider:private-local", "내 로컬 AI", "ko")).toBe("내 로컬 AI")
    expect(getBackendDisplayLabel("provider:private-local", "My local AI", "en")).toBe("My local AI")
  })

  it("does not return unknown backend ids as display labels", () => {
    expect(getBackendDisplayLabel("provider:private-local", undefined, "ko")).toBe("AI 연결")
    expect(getBackendDisplayLabel("provider:private-local", "provider:private-local", "en")).toBe("AI connection")
  })

  it("does not misclassify an unknown internal agent id as an AI connection", () => {
    expect(getBackendDisplayLabel("agent:internal-target", undefined, "ko")).toBe("")
    expect(getBackendDisplayLabel("agent:internal-target", "agent:internal-target", "en")).toBe("")
  })

  it("does not pass raw target ids as fallback labels in dashboard or routing priority UI", () => {
    expect(dashboardSource).not.toContain("backend?.label ?? target")
    expect(routingPrioritySource).not.toContain("backend?.label ?? target")
    expect(dashboardSource).toContain("getBackendDisplayLabel(backend?.id ?? target, backend?.label, language)")
    expect(routingPrioritySource).toContain("getBackendDisplayLabel(backend?.id ?? target, backend?.label, language)")
  })
})
