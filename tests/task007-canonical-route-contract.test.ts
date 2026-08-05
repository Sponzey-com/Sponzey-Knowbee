import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  CANONICAL_ROUTE_REGISTRY,
  CANONICAL_ROUTE_REGISTRY_VERSION,
  type CanonicalRouteDefinition,
  LEGACY_CANONICAL_REDIRECTS,
  evaluateCanonicalRouteActivation,
  resolveCanonicalRedirect,
  validateCanonicalRouteRegistry,
  validateLegacyCanonicalRedirects,
} from "../packages/webui/src/lib/canonical-route-contract.js"

describe("task007 canonical route contract", () => {
  it("defines one valid owner for each canonical user route", () => {
    expect(CANONICAL_ROUTE_REGISTRY_VERSION).toBe("canonical-ui-routes:v1")
    expect(CANONICAL_ROUTE_REGISTRY.map((item) => item.path)).toEqual([
      "/chat",
      "/work",
      "/agents",
      "/capabilities",
      "/settings",
    ])
    expect(validateCanonicalRouteRegistry(CANONICAL_ROUTE_REGISTRY)).toEqual({
      ok: true,
      diagnostics: [],
    })
  })

  it("rejects duplicate ownership, missing labels, restricted exposure, and domain leakage", () => {
    const duplicate: CanonicalRouteDefinition[] = [
      ...CANONICAL_ROUTE_REGISTRY,
      { ...CANONICAL_ROUTE_REGISTRY[0], routeId: "work", labelKey: "", access: "restricted" },
      { ...CANONICAL_ROUTE_REGISTRY[4], ownedDomains: ["environment", "skills"] },
    ]
    const reasons = validateCanonicalRouteRegistry(duplicate).diagnostics.map(
      (item) => item.reasonCode,
    )
    expect(reasons).toEqual(
      expect.arrayContaining([
        "canonical_route_id_duplicated",
        "canonical_route_path_duplicated",
        "canonical_page_owner_duplicated",
        "canonical_label_missing",
        "canonical_route_not_user_visible",
        "canonical_domain_owner_invalid",
      ]),
    )
  })

  it("maps legacy routes to exact canonical children and preserves only allowlisted query intent", () => {
    expect(
      validateLegacyCanonicalRedirects({
        registry: CANONICAL_ROUTE_REGISTRY,
        redirects: LEGACY_CANONICAL_REDIRECTS,
      }),
    ).toEqual({ ok: true, diagnostics: [] })

    expect(
      resolveCanonicalRedirect({
        pathname: "/advanced/runs",
        query: "?status=failed&page=2&token=secret&unknown=value",
        redirects: LEGACY_CANONICAL_REDIRECTS,
      }),
    ).toEqual({
      from: "/advanced/runs",
      to: "/work/runs?status=failed&page=2",
      discardedQueryKeys: ["token", "unknown"],
    })
    expect(
      resolveCanonicalRedirect({
        pathname: "/advanced/tools",
        query: "?tab=mcp&selected=penpot",
        redirects: LEGACY_CANONICAL_REDIRECTS,
      })?.to,
    ).toBe("/capabilities?tab=mcp&selected=penpot")
  })

  it("does not activate mutation routes before parity and navigation evidence are verified", () => {
    const capabilities = CANONICAL_ROUTE_REGISTRY.find((item) => item.routeId === "capabilities")
    const work = CANONICAL_ROUTE_REGISTRY.find((item) => item.routeId === "work")
    expect(capabilities).toBeDefined()
    expect(work).toBeDefined()
    if (!capabilities || !work) throw new Error("canonical_route_fixture_missing")
    const blocked = evaluateCanonicalRouteActivation({
      route: capabilities,
      evidence: {
        contract: "verified",
        readProjection: "verified",
        mutationParity: "unverified",
        deepLink: "verified",
        backRefresh: "unverified",
      },
    })
    expect(blocked).toEqual({
      active: false,
      reasonCodes: ["mutation_parity_missing", "back_refresh_verification_missing"],
    })

    expect(
      evaluateCanonicalRouteActivation({
        route: work,
        evidence: {
          contract: "verified",
          readProjection: "verified",
          mutationParity: "not_required",
          deepLink: "verified",
          backRefresh: "verified",
        },
      }),
    ).toEqual({ active: true, reasonCodes: [] })
  })

  it("does not read environment, network, storage, or logger state", () => {
    const source = readFileSync("packages/webui/src/lib/canonical-route-contract.ts", "utf8")
    expect(source).not.toMatch(
      /process\.env|fetch\(|localStorage|sessionStorage|readFile|writeFile/,
    )
    expect(source).not.toMatch(/console\.|logger\./)
  })
})
