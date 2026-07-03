import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { getUiNavigation, resolveModeSwitchRoute, resolveUnifiedRoute } from "../packages/webui/src/lib/ui-mode.ts"

describe("task004 unified route and navigation policy", () => {
  it("uses one user-facing navigation shape regardless of beginner or advanced compatibility mode", () => {
    const expectedPaths = ["/chat", "/setup", "/sub-agents", "/tasks", "/status"]
    const beginner = getUiNavigation("beginner", false)
    const advanced = getUiNavigation("advanced", false)

    expect(beginner.map((item) => item.path)).toEqual(expectedPaths)
    expect(advanced.map((item) => item.path)).toEqual(expectedPaths)
    expect(advanced.map((item) => item.labelKo)).toEqual([
      "대화",
      "연결",
      "서브 에이전트 설정",
      "실행 기록",
      "관리",
    ])
    expect(JSON.stringify([...beginner, ...advanced])).not.toMatch(/초보|고급|Beginner|Advanced/)
    expect(advanced.some((item) => item.path.startsWith("/advanced"))).toBe(false)
  })

  it("keeps admin navigation explicit without changing the unified default shape", () => {
    const withoutAdmin = getUiNavigation("admin", false)
    const withAdmin = getUiNavigation("admin", true)

    expect(withoutAdmin.some((item) => item.path === "/admin")).toBe(false)
    expect(withAdmin.map((item) => item.path)).toEqual([
      "/chat",
      "/setup",
      "/sub-agents",
      "/tasks",
      "/status",
      "/admin",
    ])
  })

  it("resolves legacy advanced settings deep links to new user-facing routes with reason codes", () => {
    expect(resolveUnifiedRoute("/advanced/topology?mode=advanced#graph")).toEqual({
      from: "/advanced/topology",
      to: "/sub-agents",
      reason: "legacy_sub_agent_settings_route",
    })
    expect(resolveUnifiedRoute("/advanced/orchestration/runtime")).toEqual({
      from: "/advanced/orchestration/runtime",
      to: "/sub-agents",
      reason: "legacy_sub_agent_orchestration_route",
    })
    expect(resolveUnifiedRoute("/advanced/settings/ai?mode=simple")).toEqual({
      from: "/advanced/settings/ai",
      to: "/setup",
      reason: "legacy_connection_settings_route",
    })
    expect(resolveUnifiedRoute("/chat")).toBeNull()
    expect(resolveUnifiedRoute("/unknown/advanced")).toBeNull()
  })

  it("does not resurrect advanced routes during compatibility mode switches", () => {
    expect(resolveModeSwitchRoute("/setup", "advanced")).toBe("/setup")
    expect(resolveModeSwitchRoute("/chat", "advanced")).toBe("/chat")
    expect(resolveModeSwitchRoute("/sub-agents", "advanced")).toBe("/sub-agents")
    expect(resolveModeSwitchRoute("/advanced/topology?mode=advanced", "beginner")).toBe("/sub-agents")
    expect(resolveModeSwitchRoute("/advanced/settings/ai?mode=simple", "advanced")).toBe("/setup")
  })

  it("keeps route and navigation policy free of hidden runtime environment access", () => {
    const routeMigrationSource = readFileSync("packages/webui/src/lib/route-migration.ts", "utf8")
    const uiModeSource = readFileSync("packages/webui/src/lib/ui-mode.ts", "utf8")
    const source = `${routeMigrationSource}\n${uiModeSource}`

    expect(source).not.toMatch(/process\.env/)
    expect(source).not.toMatch(/localStorage/)
    expect(source).not.toMatch(/fetch\(/)
    expect(source).not.toMatch(/window\.location|document\./)
  })
})
