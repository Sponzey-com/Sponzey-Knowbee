import { describe, expect, it, vi } from "vitest"

import { collectWebUiBrowserProfile } from "../scripts/self/collect-webui-live-performance.mjs"

function fakeBrowser() {
  const requestHandlers: Array<(request: unknown) => void> = []
  const page = {
    addInitScript: vi.fn(async () => undefined),
    on: vi.fn((event: string, handler: (request: unknown) => void) => {
      if (event === "request") requestHandlers.push(handler)
    }),
    goto: vi.fn(async () => {
      for (const handler of requestHandlers) {
        handler({
          resourceType: () => "fetch",
          method: () => "GET",
          url: () => "http://127.0.0.1:18888/api/status?token=private",
        })
      }
    }),
    reload: vi.fn(async () => {
      for (const handler of requestHandlers) {
        handler({
          resourceType: () => "fetch",
          method: () => "GET",
          url: () => "http://127.0.0.1:18888/api/ui/shell",
        })
      }
    }),
    waitForTimeout: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => ({
      domContentLoadedMs: 100,
      firstContentfulPaintMs: 140,
      lcpMs: 180,
      cls: 0.02,
    })),
  }
  const context = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
  }
  return {
    browser: { newContext: vi.fn(async () => context) },
    page,
    context,
  }
}

describe("task004 WebUI live browser adapter", () => {
  it("collects a cold profile and redacts its request receipt", async () => {
    const fake = fakeBrowser()
    const result = await collectWebUiBrowserProfile({
      browser: fake.browser,
      applicationUrl: "http://127.0.0.1:18888/chat",
      profile: {
        profileId: "mobile_cold",
        viewport: { width: 375, height: 812 },
        cacheMode: "cold",
      },
      settleMs: 0,
      now: (() => {
        let value = 1_000
        return () => (value += 5)
      })(),
    })

    expect(result).toMatchObject({
      kind: "collected",
      profileId: "mobile_cold",
      route: "/chat",
      viewport: { width: 375, height: 812 },
      cacheMode: "cold",
      metrics: { lcpMs: 180, cls: 0.02 },
      requests: [
        {
          method: "GET",
          safePath: "/api/status?token=%3Credacted%3E",
          queryKey: "GET /api/status?token=<redacted>",
          startMs: 5,
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain("private")
    expect(fake.page.reload).not.toHaveBeenCalled()
    expect(fake.context.close).toHaveBeenCalledOnce()
  })

  it("warms the same context before recording the warm profile", async () => {
    const fake = fakeBrowser()
    const result = await collectWebUiBrowserProfile({
      browser: fake.browser,
      applicationUrl: "http://127.0.0.1:18888/chat",
      profile: {
        profileId: "desktop_warm",
        viewport: { width: 1440, height: 900 },
        cacheMode: "warm",
      },
      settleMs: 0,
      now: (() => {
        let value = 2_000
        return () => (value += 5)
      })(),
    })

    expect(result.kind).toBe("collected")
    if (result.kind !== "collected") return
    expect(result.requests.map((item) => item.safePath)).toEqual(["/api/ui/shell"])
    expect(fake.page.goto).toHaveBeenCalledOnce()
    expect(fake.page.reload).toHaveBeenCalledOnce()
  })

  it("returns an unavailable receipt instead of invented metrics on navigation failure", async () => {
    const fake = fakeBrowser()
    fake.page.goto.mockRejectedValueOnce(new Error("connection refused with token=secret"))
    const result = await collectWebUiBrowserProfile({
      browser: fake.browser,
      applicationUrl: "http://127.0.0.1:18888/chat",
      profile: {
        profileId: "desktop_cold",
        viewport: { width: 1440, height: 900 },
        cacheMode: "cold",
      },
      settleMs: 0,
    })

    expect(result).toEqual({
      kind: "unavailable",
      profileId: "desktop_cold",
      reasonCode: "browser_navigation_failed",
    })
    expect(fake.context.close).toHaveBeenCalledOnce()
  })
})
