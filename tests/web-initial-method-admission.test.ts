import { describe, expect, it } from "vitest"

import {
  admitInitialWebResearchMethod,
} from "../packages/core/src/contracts/web-initial-method-admission.ts"

const scope = {
  schemaVersion: 1 as const,
  runId: "run-1",
  ownerAgentId: "agent:main",
  receiptId: "receipt:capability:1",
  capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}` as const,
  selectedCapabilityId: "skill:web-research",
  toolNames: ["web_search", "web_fetch"],
}

describe("initial web research method admission", () => {
  it("admits an LLM-generated search query in an admitted web-tool scope", () => {
    const result = admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "SK hynix current price",
      toolName: "web_search",
      params: {
        query: "SK hynix stock price current KRX 000660",
        freshnessPolicy: "strict_timestamp",
      },
    })

    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "execute_search",
        query: "SK hynix stock price current KRX 000660",
        freshnessPolicy: "strict_timestamp",
      },
      receipt: {
        schemaVersion: 1,
        diagnosedBy: "llm_tool_call",
        runId: "run-1",
        capabilityReceiptId: "receipt:capability:1",
      },
    })
  })

  it("admits web research from the explicit tool scope without a capability-name dependency", () => {
    const result = admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope: {
        ...scope,
        selectedCapabilityId: "skill:general-research",
      },
      userRequest: "Find the current value.",
      toolName: "web_search",
      params: { query: "current value official source" },
    })

    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "execute_search",
        query: "current value official source",
      },
    })
  })

  it("admits only an exact public URL structurally present in the user request", () => {
    const result = admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Summarize https://example.com/report?year=2026.",
      toolName: "web_fetch",
      params: { url: "https://example.com/report?year=2026" },
    })

    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "execute_fetch",
        sourceUrl: "https://example.com/report?year=2026",
        candidateOrigin: "user_url",
      },
    })

    expect(admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Summarize https://example.com/report?year=2026.",
      toolName: "web_fetch",
      params: { url: "https://invented.example/report" },
    })).toEqual({
      ok: false,
      reasonCode: "web_initial_method_fetch_candidate_missing",
    })
  })

  it("admits an exact observed document-link candidate with provenance", () => {
    const discoveryFingerprint = `sha256:${"b".repeat(64)}` as const
    const result = admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Follow the relevant source.",
      observedFetchCandidates: [{
        candidateId: `web-link:${discoveryFingerprint}`,
        kind: "fetch",
        sourceUrl: "https://example.com/detail",
        evidenceRef: "document:parent",
        strategyFingerprint: `sha256:${"c".repeat(64)}`,
        discovery: {
          origin: "fetched_document_link",
          parentEvidenceRef: "document:parent",
          parentProvenanceRef: "provenance:parent",
          documentFinalUrl: "https://example.com/root",
          observationOrdinal: 1,
          discoveryFingerprint,
        },
      }],
      toolName: "web_fetch",
      params: { url: "https://example.com/detail" },
    })

    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "execute_fetch",
        sourceUrl: "https://example.com/detail",
        candidateOrigin: "fetched_document_link",
        candidateId: `web-link:${discoveryFingerprint}`,
        parentEvidenceRef: "document:parent",
        discoveryFingerprint,
      },
    })
  })

  it("admits an exact URL observed in the validated discovery-search result", () => {
    const result = admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Find the current value.",
      observedSearchResults: [{
        sourceUrl: "https://example.com/current",
        evidenceRef: "search:current",
      }],
      toolName: "web_fetch",
      params: { url: "https://example.com/current" },
    })

    expect(result).toMatchObject({
      ok: true,
      action: {
        kind: "execute_fetch",
        sourceUrl: "https://example.com/current",
        candidateOrigin: "search_result",
        parentEvidenceRef: "search:current",
      },
    })
  })

  it("rejects wrong scope, malformed query, credentials and non-public schemes", () => {
    expect(admitInitialWebResearchMethod({
      runId: "other-run",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Research this.",
      toolName: "web_search",
      params: { query: "research" },
    })).toEqual({
      ok: false,
      reasonCode: "web_initial_method_scope_mismatch",
    })
    expect(admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Research this.",
      toolName: "web_search",
      params: { query: "" },
    })).toEqual({
      ok: false,
      reasonCode: "web_initial_method_proposal_invalid",
    })
    expect(admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Read https://user:secret@example.com/report",
      toolName: "web_fetch",
      params: { url: "https://user:secret@example.com/report" },
    })).toEqual({
      ok: false,
      reasonCode: "web_initial_method_fetch_candidate_invalid",
    })
    expect(admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Read file:///etc/passwd",
      toolName: "web_fetch",
      params: { url: "file:///etc/passwd" },
    })).toEqual({
      ok: false,
      reasonCode: "web_initial_method_fetch_candidate_invalid",
    })
    expect(admitInitialWebResearchMethod({
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Read http://127.0.0.1/private",
      toolName: "web_fetch",
      params: { url: "http://127.0.0.1/private" },
    })).toEqual({
      ok: false,
      reasonCode: "web_initial_method_fetch_candidate_invalid",
    })
  })

  it("returns a deterministic receipt without copying the request or query", () => {
    const input = {
      runId: "run-1",
      ownerAgentId: "agent:main",
      scope,
      userRequest: "Research sensitive words.",
      toolName: "web_search",
      params: { query: "sensitive words sources" },
    } as const
    const left = admitInitialWebResearchMethod(input)
    const right = admitInitialWebResearchMethod(input)

    expect(left).toEqual(right)
    expect(left.ok).toBe(true)
    if (left.ok) {
      expect(JSON.stringify(left.receipt)).not.toContain("sensitive words")
    }
  })
})
