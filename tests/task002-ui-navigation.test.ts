import { describe, expect, it } from "vitest"
import {
  getUiNavigation,
  resolveLegacyAdvancedRoute,
  resolveModeSwitchRoute,
  resolveRollbackRoute,
} from "../packages/webui/src/lib/ui-mode.js"

describe("task002 UI navigation policy", () => {
  it("keeps navigation to one unified operator surface", () => {
    expect(getUiNavigation("beginner", false).map((item) => item.path)).toEqual([
      "/chat",
      "/settings",
      "/agents",
      "/capabilities/skills",
      "/work/runs",
      "/status",
    ])
    expect(getUiNavigation("advanced", false).map((item) => item.path)).toEqual([
      "/chat",
      "/settings",
      "/agents",
      "/capabilities/skills",
      "/work/runs",
      "/status",
    ])
  })

  it("exposes admin navigation only when the explicit admin flag is enabled", () => {
    expect(getUiNavigation("advanced", false).some((item) => item.path === "/admin")).toBe(false)
    expect(getUiNavigation("beginner", true).some((item) => item.path === "/admin")).toBe(true)
    expect(getUiNavigation("advanced", true).some((item) => item.path === "/admin")).toBe(true)
  })

  it("maps legacy control-plane routes to unified routes during migration", () => {
    expect(resolveLegacyAdvancedRoute("/settings")).toBeNull()
    expect(resolveLegacyAdvancedRoute("/settings/ai")).toBeNull()
    expect(resolveLegacyAdvancedRoute("/runs")).toBe("/work/runs")
    expect(resolveLegacyAdvancedRoute("/topology")).toBe("/agents")
    expect(resolveLegacyAdvancedRoute("/enterprise-topology")).toBe("/agents")
    expect(resolveLegacyAdvancedRoute("/chat")).toBeNull()
  })

  it("keeps core routes stable on compatibility mode switch", () => {
    expect(resolveModeSwitchRoute("/setup", "advanced")).toBe("/setup")
    expect(resolveModeSwitchRoute("/chat", "advanced")).toBe("/chat")
    expect(resolveModeSwitchRoute("/tasks", "advanced")).toBe("/work/runs")
    expect(resolveModeSwitchRoute("/status", "advanced")).toBe("/status")
    expect(resolveModeSwitchRoute("/agents", "advanced")).toBe("/agents")
    expect(resolveModeSwitchRoute("/advanced/topology", "beginner")).toBe("/agents")
    expect(resolveRollbackRoute("/setup")).toBe("/setup")
  })
})
