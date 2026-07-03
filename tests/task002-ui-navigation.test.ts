import { describe, expect, it } from "vitest"
import { getUiNavigation, resolveLegacyAdvancedRoute, resolveModeSwitchRoute, resolveRollbackRoute } from "../packages/webui/src/lib/ui-mode.js"

describe("task002 UI navigation policy", () => {
  it("keeps navigation to one unified operator surface", () => {
    expect(getUiNavigation("beginner", false).map((item) => item.path)).toEqual([
      "/chat",
      "/setup",
      "/sub-agents",
      "/tasks",
      "/status",
    ])
    expect(getUiNavigation("advanced", false).map((item) => item.path)).toEqual([
      "/chat",
      "/setup",
      "/sub-agents",
      "/tasks",
      "/status",
    ])
  })

  it("exposes admin navigation only when the explicit admin flag is enabled", () => {
    expect(getUiNavigation("advanced", false).some((item) => item.path === "/admin")).toBe(false)
    expect(getUiNavigation("beginner", true).some((item) => item.path === "/admin")).toBe(true)
    expect(getUiNavigation("advanced", true).some((item) => item.path === "/admin")).toBe(true)
  })

  it("maps legacy control-plane routes to unified routes during migration", () => {
    expect(resolveLegacyAdvancedRoute("/settings")).toBe("/setup")
    expect(resolveLegacyAdvancedRoute("/settings/ai")).toBe("/setup")
    expect(resolveLegacyAdvancedRoute("/runs")).toBe("/tasks")
    expect(resolveLegacyAdvancedRoute("/topology")).toBe("/sub-agents")
    expect(resolveLegacyAdvancedRoute("/enterprise-topology")).toBe("/sub-agents")
    expect(resolveLegacyAdvancedRoute("/chat")).toBeNull()
  })

  it("keeps core routes stable on compatibility mode switch", () => {
    expect(resolveModeSwitchRoute("/setup", "advanced")).toBe("/setup")
    expect(resolveModeSwitchRoute("/chat", "advanced")).toBe("/chat")
    expect(resolveModeSwitchRoute("/tasks", "advanced")).toBe("/tasks")
    expect(resolveModeSwitchRoute("/status", "advanced")).toBe("/status")
    expect(resolveModeSwitchRoute("/sub-agents", "advanced")).toBe("/sub-agents")
    expect(resolveModeSwitchRoute("/advanced/topology", "beginner")).toBe("/sub-agents")
    expect(resolveRollbackRoute("/setup")).toBe("/setup")
  })
})
