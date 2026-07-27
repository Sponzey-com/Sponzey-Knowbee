import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { getUiRouteInventory, resolveUnifiedRoute } from "../packages/webui/src/lib/route-migration.ts"
import { UNIFIED_SETTINGS_ROUTE_OWNERSHIP } from "../packages/webui/src/lib/unified-settings-ownership.ts"

const SETTINGS_PATH = /^\/(?:advanced\/)?(?:settings|ai|channels|extensions|memory|tools|release)(?:\/|$)/

describe("task041 settings route convergence", () => {
  it("does not mount the legacy settings component from App routes", () => {
    const app = readFileSync("packages/webui/src/App.tsx", "utf8")

    expect(app).not.toContain("<SettingsPage />")
    expect(app).toContain('path="/advanced/ai"')
    expect(app).toContain('<UnifiedRouteRedirect fallback="/settings/ai" />')
  })

  it("maps legacy settings links to the authoritative settings sections", () => {
    const inventory = getUiRouteInventory().filter((item) => SETTINGS_PATH.test(item.path))

    expect(inventory.length).toBeGreaterThan(0)
    expect(inventory.find((item) => item.path === "/settings")).toMatchObject({ status: "kept" })
    expect(
      inventory
        .filter((item) => item.path !== "/settings")
        .every((item) => item.status === "redirect" && item.replacementPath?.startsWith("/settings")),
    ).toBe(true)
    expect(inventory.every((item) => item.component !== "SettingsPage")).toBe(true)
    expect(resolveUnifiedRoute("/advanced/ai/provider")).toEqual(expect.objectContaining({ to: "/settings/ai" }))
    expect(resolveUnifiedRoute("/channels/telegram")).toEqual(expect.objectContaining({ to: "/settings/connections" }))
  })

  it("synchronizes compatibility ownership with redirect-only runtime behavior", () => {
    const routes = UNIFIED_SETTINGS_ROUTE_OWNERSHIP.filter(
      (item) => item.path !== null && SETTINGS_PATH.test(item.path),
    )

    expect(routes.length).toBeGreaterThan(0)
    expect(routes.find((item) => item.path === "/settings")).toMatchObject({
      classification: "active_owner",
      lifecycle: "active",
    })
    expect(
      routes
        .filter((item) => item.path !== "/settings")
        .every(
          (item) =>
            item.classification === "compatibility_redirect" &&
            item.lifecycle === "redirect_only" &&
            item.replacementPath === "/settings",
        ),
    ).toBe(true)
  })

  it("keeps sub-agent and admin authoritative routes outside settings convergence", () => {
    expect(resolveUnifiedRoute("/advanced/topology/build")).toEqual(expect.objectContaining({ to: "/agents" }))
    expect(resolveUnifiedRoute("/admin")).toBeNull()
  })
})
