import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  classifyWebResearchLiveSmoke,
  sanitizeWebResearchLiveSmokeReceipt,
} from "../scripts/run-web-research-live-smoke.mjs"

describe("task032 controlled web research live smoke", () => {
  it("passes only after both real search and public fetch observations succeed", () => {
    expect(
      classifyWebResearchLiveSmoke({
        search: { success: true, resultCount: 3 },
        fetchAttempts: [
          { success: false, reasonCode: "web_fetch_http_status" },
          { success: true, markdownLength: 512 },
        ],
      }),
    ).toEqual({ status: "passed", reasonCode: "search_and_fetch_observed" })
  })

  it("records typed provider limitations as warnings without claiming success", () => {
    expect(
      classifyWebResearchLiveSmoke({
        search: {
          success: false,
          resultCount: 0,
          reasonCode: "duckduckgo_http_status",
        },
        fetchAttempts: [],
      }),
    ).toEqual({ status: "warning", reasonCode: "duckduckgo_http_status" })
  })

  it("removes query, URL and raw provider payload from the persisted receipt", () => {
    const receipt = sanitizeWebResearchLiveSmokeReceipt({
      status: "warning",
      reasonCode: "duckduckgo_http_status",
      observedAt: "2026-07-24T00:00:00.000Z",
      query: "private search query",
      sourceUrl: "https://example.com/private",
      rawPayload: "<html>private</html>",
      searchResultCount: 0,
      fetchAttemptCount: 0,
    })

    expect(receipt).toEqual({
      schemaVersion: 1,
      policyVersion: "web-research-provider-smoke-v1",
      status: "warning",
      reasonCode: "duckduckgo_http_status",
      observedAt: "2026-07-24T00:00:00.000Z",
      searchResultCount: 0,
      fetchAttemptCount: 0,
    })
    expect(JSON.stringify(receipt)).not.toMatch(/private|https?:|html|query|payload/iu)
  })

  it("wires the release pipeline to the live command instead of a dry-run test file", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>
    }
    const releaseSource = readFileSync("packages/core/src/release/package.ts", "utf8")

    expect(manifest.scripts?.["smoke:web:live"]).toBe(
      "node scripts/run-web-research-live-smoke.mjs",
    )
    expect(releaseSource).toContain('"pnpm", "run", "smoke:web:live"')
    expect(releaseSource).not.toMatch(
      /web-retrieval-live-smoke[\s\S]{0,500}task008-live-web-smoke-dry-run/u,
    )
  })
})
