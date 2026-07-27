import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1103 admin runtime manifest config", () => {
  it("threads request config snapshots through admin runtime manifest helpers", () => {
    const adminRouteSource = readFileSync("packages/core/src/api/routes/admin.ts", "utf-8")

    expect(adminRouteSource).toContain("getApiRuntimeConfig, getApiRuntimePaths")
    expect(adminRouteSource).toContain("function buildAdminRuntimeManifestOptions(options: AdminRouteOptions, config: KnowbeeConfig, paths: RuntimePaths): RuntimeManifestOptions")
    expect(adminRouteSource).toContain("const base: RuntimeManifestOptions = { includeEnvironment: false, includeReleasePackage: false, config, paths }")
    expect(adminRouteSource).toContain("function buildStreamStatus(options: AdminRouteOptions, config: KnowbeeConfig, paths: RuntimePaths)")
    expect(adminRouteSource).toContain("function buildAdminLive(query: AdminLiveQuerystring, options: AdminRouteOptions, config: KnowbeeConfig, paths: RuntimePaths)")
    expect(adminRouteSource).toContain("function buildAdminShell(options: AdminRouteOptions, config: KnowbeeConfig, paths: RuntimePaths)")
    expect(adminRouteSource).toContain("shell: buildAdminShell(options, config, paths)")
    expect(adminRouteSource).toContain("return buildAdminLive(req.query, options, config, paths)")
    expect(adminRouteSource).not.toContain("buildRuntimeManifest(buildAdminRuntimeManifestOptions(options))")
    expect(adminRouteSource).not.toContain("buildAdminShell(options),")
    expect(adminRouteSource).not.toContain("return buildAdminLive(req.query, options)")
  })
})
