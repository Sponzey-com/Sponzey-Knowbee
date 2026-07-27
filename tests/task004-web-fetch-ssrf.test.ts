import { describe, expect, it, vi } from "vitest"

import {
  type NetworkAddressResolver,
  applyPublicTargetRouteGuard,
  createWebFetchTool,
  fetchPublicHttp,
} from "../packages/core/src/tools/builtin/web-fetch.ts"

const PUBLIC_ADDRESS = "93.184.216.34"

function resolver(records: Record<string, readonly string[]>): NetworkAddressResolver {
  return async (hostname) => records[hostname] ?? []
}

describe("task004 SSRF-safe web fetch adapter", () => {
  it("revalidates every redirect and returns the final effective URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/final" } }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }))

    const result = await fetchPublicHttp({
      rawUrl: "https://start.test/quote",
      resolver: resolver({ "start.test": [PUBLIC_ADDRESS] }),
      fetcher,
      maxRedirects: 3,
    })

    expect(result.effectiveUrl).toBe("https://start.test/final")
    expect(await result.response.text()).toBe("ready")
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true)
  })

  it("rejects a redirect to a private target before the second request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
      )

    await expect(
      fetchPublicHttp({
        rawUrl: "https://start.test",
        resolver: resolver({
          "start.test": [PUBLIC_ADDRESS],
          "169.254.169.254": ["169.254.169.254"],
        }),
        fetcher,
        maxRedirects: 3,
      }),
    ).rejects.toMatchObject({ code: "address_not_public" })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("stops redirect cycles and explicit hop-limit overflow", async () => {
    const cycleFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "https://start.test/a" } }),
      )
    await expect(
      fetchPublicHttp({
        rawUrl: "https://start.test/a",
        resolver: resolver({ "start.test": [PUBLIC_ADDRESS] }),
        fetcher: cycleFetcher,
        maxRedirects: 3,
      }),
    ).rejects.toMatchObject({ code: "redirect_cycle" })

    const limitFetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const current = new URL(String(input))
      const next = Number(current.pathname.slice(1) || "0") + 1
      return new Response(null, { status: 302, headers: { location: `/${next}` } })
    })
    await expect(
      fetchPublicHttp({
        rawUrl: "https://start.test/0",
        resolver: resolver({ "start.test": [PUBLIC_ADDRESS] }),
        fetcher: limitFetcher,
        maxRedirects: 1,
      }),
    ).rejects.toMatchObject({ code: "redirect_limit_exceeded" })
  })

  it("continues public browser requests and aborts private subresources", async () => {
    const continueRequest = vi.fn(async () => undefined)
    const abortRequest = vi.fn(async () => undefined)

    await applyPublicTargetRouteGuard({
      rawUrl: "https://assets.test/app.js",
      resolver: resolver({ "assets.test": [PUBLIC_ADDRESS] }),
      continueRequest,
      abortRequest,
    })
    await applyPublicTargetRouteGuard({
      rawUrl: "http://127.0.0.1/admin",
      resolver: resolver({ "127.0.0.1": ["127.0.0.1"] }),
      continueRequest,
      abortRequest,
    })

    expect(continueRequest).toHaveBeenCalledTimes(1)
    expect(abortRequest).toHaveBeenCalledTimes(1)
  })

  it("returns only a typed rejection code without reflecting a private URL", async () => {
    const privateUrl = "http://user:secret@127.0.0.1/admin"
    const result = await createWebFetchTool({
      resolver: resolver({ "127.0.0.1": ["127.0.0.1"] }),
      fetcher: vi.fn<typeof fetch>(),
    }).execute(
      { url: privateUrl },
      {
        sessionId: "session-ssrf",
        runId: "run-ssrf",
        workDir: "/tmp",
        userMessage: "fetch the page",
        source: "test",
        allowWebAccess: true,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )

    expect(result).toMatchObject({
      success: false,
      details: { rejectionCode: "credentials_not_allowed" },
    })
    expect(JSON.stringify(result)).not.toContain(privateUrl)
    expect(JSON.stringify(result)).not.toContain("secret")
  })
})
