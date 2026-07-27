import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  REQUIRED_WEBUI_LIVE_PROFILE_IDS,
  buildWebUiLivePerformanceEvidence,
  compareLiveRequestsToStaticBaseline,
  sanitizeBrowserRequest,
} from "../scripts/lib/webui-live-performance-evidence.mjs"

function collectedSample(profileId: string) {
  return {
    kind: "collected" as const,
    profileId,
    route: "/chat",
    viewport: profileId.startsWith("mobile")
      ? { width: 375, height: 812 }
      : { width: 1440, height: 900 },
    cacheMode: profileId.endsWith("cold") ? "cold" as const : "warm" as const,
    metrics: { domContentLoadedMs: 120, firstContentfulPaintMs: 180, lcpMs: 240, cls: 0.01 },
    requests: [
      { method: "GET", safePath: "/api/status", queryKey: "GET /api/status", startMs: 5 },
      { method: "GET", safePath: "/api/ui/shell", queryKey: "GET /api/ui/shell", startMs: 12 },
    ],
  }
}

describe("task004 WebUI live performance evidence", () => {
  it("sanitizes browser requests without preserving origin, credential, or arbitrary values", () => {
    expect(
      sanitizeBrowserRequest({
        method: "post",
        requestUrl: "http://user:password@127.0.0.1:18888/api/items?token=secret&limit=20&search=private",
        applicationOrigin: "http://127.0.0.1:18888",
        startMs: 12.3456,
      }),
    ).toEqual({
      method: "POST",
      safePath: "/api/items?limit=20&search=%3Cpresent%3E&token=%3Credacted%3E",
      queryKey: "POST /api/items?limit=20&search=<present>&token=<redacted>",
      startMs: 12.346,
    })
  })

  it("requires every mobile/desktop cold/warm profile and valid metrics", () => {
    const incomplete = buildWebUiLivePerformanceEvidence({
      buildIdentity: "webui-build:test",
      samples: [collectedSample("mobile_cold")],
    })
    expect(incomplete.status).toBe("invalid")
    expect(incomplete.diagnostics).toEqual([
      { profileId: "desktop_cold", reasonCode: "required_profile_missing" },
      { profileId: "desktop_warm", reasonCode: "required_profile_missing" },
      { profileId: "mobile_warm", reasonCode: "required_profile_missing" },
    ])

    const complete = buildWebUiLivePerformanceEvidence({
      buildIdentity: "webui-build:test",
      samples: REQUIRED_WEBUI_LIVE_PROFILE_IDS.map(collectedSample),
    })
    expect(complete.status).toBe("collected")
    expect(complete.diagnostics).toEqual([])
    expect(JSON.stringify(complete)).not.toMatch(/127\.0\.0\.1|password|secret/)
  })

  it("records explicit unavailable profiles without inventing performance values", () => {
    const samples = REQUIRED_WEBUI_LIVE_PROFILE_IDS.map((profileId) =>
      profileId === "desktop_warm"
        ? { kind: "unavailable" as const, profileId, reasonCode: "browser_navigation_failed" }
        : collectedSample(profileId),
    )
    const evidence = buildWebUiLivePerformanceEvidence({
      buildIdentity: "webui-build:test",
      samples,
    })

    expect(evidence.status).toBe("partial")
    expect(evidence.samples.find((item) => item.profileId === "desktop_warm")).toEqual({
      kind: "unavailable",
      profileId: "desktop_warm",
      reasonCode: "browser_navigation_failed",
    })
  })

  it("reports observed-only, expected-only, and duplicate request keys", () => {
    expect(
      compareLiveRequestsToStaticBaseline({
        expectedQueryKeys: ["GET /api/status", "GET /api/ui/shell", "GET /api/tasks"],
        observedRequests: [
          { method: "GET", safePath: "/api/status", queryKey: "GET /api/status", startMs: 1 },
          { method: "GET", safePath: "/api/status", queryKey: "GET /api/status", startMs: 2 },
          { method: "GET", safePath: "/api/extra", queryKey: "GET /api/extra", startMs: 3 },
          { method: "GET", safePath: "/api/ui/shell", queryKey: "GET /api/ui/shell", startMs: 4 },
        ],
      }),
    ).toEqual({
      ok: false,
      diagnostics: [
        { queryKey: "GET /api/status", reasonCode: "live_query_duplicated" },
        { queryKey: "GET /api/extra", reasonCode: "live_query_observed_only" },
        { queryKey: "GET /api/tasks", reasonCode: "static_query_expected_only" },
      ],
    })
  })

  it("keeps the evidence contract free of environment, network, filesystem, and logging side effects", () => {
    const source = readFileSync("scripts/lib/webui-live-performance-evidence.mjs", "utf8")
    expect(source).not.toMatch(/process\.env|fetch\(|readFile|writeFile/)
    expect(source).not.toMatch(/console\.|logger\./)
  })
})
