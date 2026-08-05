import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  resolveCanonicalCompatibilityTarget,
  resolveCanonicalNavigationOwner,
} from "../packages/webui/src/lib/canonical-compatibility-shell.js"

describe("task008 canonical compatibility shell", () => {
  it("resolves only canonical families that still use compatibility bridges", () => {
    expect(resolveCanonicalCompatibilityTarget({ pathname: "/work", query: "" })).toBeNull()
    expect(
      resolveCanonicalCompatibilityTarget({
        pathname: "/work/runs",
        query: "?status=failed&page=2",
      }),
    ).toBeNull()
    expect(
      resolveCanonicalCompatibilityTarget({ pathname: "/agents/member", query: "?selected=a1" }),
    ).toBeNull()
    expect(
      resolveCanonicalCompatibilityTarget({
        pathname: "/capabilities/skills",
        query: "?selected=ui-ux",
      })?.to,
    ).toBe("/advanced/plugins?selected=ui-ux")
    expect(
      resolveCanonicalCompatibilityTarget({
        pathname: "/capabilities/mcp",
        query: "?selected=penpot",
      })?.to,
    ).toBe("/setup?selected=penpot")
    expect(
      resolveCanonicalCompatibilityTarget({
        pathname: "/settings/language",
        query: "?section=language",
      }),
    ).toBeNull()
  })

  it("uses a safe root fallback for unknown children and discards unsafe query values", () => {
    expect(
      resolveCanonicalCompatibilityTarget({
        pathname: "/capabilities/unknown",
        query: "?tab=mcp&token=secret&internal_id=42&unknown=value",
      }),
    ).toEqual({
      from: "/capabilities/unknown",
      to: "/setup?tab=mcp",
      discardedQueryKeys: ["token", "internal_id", "unknown"],
      reasonCode: "canonical_child_fallback",
    })
  })

  it("maps each canonical location to exactly one current navigation owner", () => {
    expect(resolveCanonicalNavigationOwner("/work/runs")).toBeNull()
    expect(resolveCanonicalNavigationOwner("/agents/a1")).toBeNull()
    expect(resolveCanonicalNavigationOwner("/capabilities/mcp")).toBe("/setup")
    expect(resolveCanonicalNavigationOwner("/settings/language")).toBeNull()
  })

  it("registers canonical routes and exposes authoritative destinations in primary navigation", () => {
    const app = readFileSync("packages/webui/src/App.tsx", "utf8")
    for (const path of ["/work/*", "/agents/*", "/capabilities/*", "/settings/*"]) {
      expect(app).toContain(`path=\"${path}\"`)
    }
    expect(app).toContain("<CanonicalCompatibilityRedirect setupCompleted={setupCompleted} />")

    const navigation = readFileSync("packages/webui/src/lib/ui-mode.ts", "utf8")
    expect(navigation).toContain('path: "/agents"')
    expect(navigation).toContain('path: "/settings"')
  })

  it("keeps the resolver free of environment, I/O, network, and logging side effects", () => {
    const source = readFileSync("packages/webui/src/lib/canonical-compatibility-shell.ts", "utf8")
    expect(source).not.toMatch(
      /process\.env|fetch\(|readFile|writeFile|localStorage|sessionStorage/,
    )
    expect(source).not.toMatch(/console\.|logger\./)
  })
})
