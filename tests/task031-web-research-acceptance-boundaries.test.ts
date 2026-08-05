import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  loadWebRetrievalFixturesFromDir,
  runWebRetrievalFixtureRegression,
  WEB_RETRIEVAL_FIXTURE_SCHEMA_VERSION,
} from "../packages/core/src/runs/web-retrieval-smoke.ts"

const repoRoot = process.cwd()
const source = (path: string): string => readFileSync(join(repoRoot, path), "utf8")

describe("task031 web research acceptance boundaries", () => {
  it("keeps supported v2 fixtures readable and rejects a future schema explicitly", () => {
    const fixtures = loadWebRetrievalFixturesFromDir(
      join(repoRoot, "tests", "fixtures", "web-retrieval"),
    )
    expect(WEB_RETRIEVAL_FIXTURE_SCHEMA_VERSION).toBe(2)
    expect(runWebRetrievalFixtureRegression(fixtures).status).toBe("passed")

    const future = {
      ...fixtures[0]!,
      id: "future-schema",
      schemaVersion: WEB_RETRIEVAL_FIXTURE_SCHEMA_VERSION + 1,
    }
    const summary = runWebRetrievalFixtureRegression([future])
    expect(summary).toMatchObject({
      status: "failed",
      results: [{
        fixtureId: "future-schema",
        status: "failed",
        failures: ["fixture_schema_version_mismatch"],
      }],
    })
  })

  it("keeps web Domain and Application use cases free of runtime I/O", () => {
    const domainAndApplicationSources = [
      "packages/core/src/contracts/web-research-ledger.ts",
      "packages/core/src/contracts/web-research-method.ts",
      "packages/core/src/contracts/web-research-context-budget.ts",
      "packages/core/src/contracts/web-source-selection.ts",
      "packages/core/src/contracts/web-chunk-selection.ts",
      "packages/core/src/contracts/web-evidence-compression.ts",
      "packages/core/src/contracts/web-evidence-pack.ts",
      "packages/core/src/runs/web-source-selection.ts",
      "packages/core/src/runs/web-evidence-pipeline.ts",
      "packages/core/src/runs/web-evidence-pack.ts",
      "packages/core/src/runs/web-evidence-verifier.ts",
      "packages/core/src/runs/web-research-method-use-case.ts",
      "packages/core/src/runs/web-research-terminal-use-case.ts",
    ]
    const forbidden =
      /process\.env|node:fs|node:path|globalThis\.fetch|await\s+fetch\(|\/db\/|logger\/|from\s+["'](?:fastify|react)/u

    for (const path of domainAndApplicationSources) {
      expect(source(path), path).not.toMatch(forbidden)
    }
  })

  it("uses all three log purposes without passing raw web inputs to them", () => {
    const webTools = [
      source("packages/core/src/tools/builtin/web-search.ts"),
      source("packages/core/src/tools/builtin/web-fetch.ts"),
    ].join("\n")

    expect(webTools).toContain(".product(")
    expect(webTools).toContain(".fieldDebug(")
    expect(webTools).toContain(".development(")
    expect(webTools).not.toMatch(
      /\.(?:product|fieldDebug|development)\([^)]*(?:params\.(?:query|url)|document\.markdown|rawHtml|rawBody)/su,
    )
  })

  it("persists the structured web trace only through the Audit writer", () => {
    const agent = source("packages/core/src/agent/index.ts")
    const traceWriter = agent.slice(
      agent.indexOf("if (webResearchRunRecorder &&"),
      agent.indexOf("const durationMs =", agent.indexOf("if (webResearchRunRecorder &&")),
    )

    expect(traceWriter).toContain("insertAuditLog({")
    expect(traceWriter).toContain('tool_name: "web_research_run_trace"')
    expect(traceWriter).toContain("policyVersion: trace.policyVersion")
    expect(traceWriter).not.toContain("yield {")
    expect(traceWriter).not.toMatch(/log\.(?:product|info|debug|development)\([^)]*trace/su)
  })
})
