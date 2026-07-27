import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type WebResearchNextAction,
  admitWebResearchNextAction,
  createWebResearchMethodReceipt,
  createWebResearchSnapshot,
} from "../packages/core/src/contracts/web-research-method.js"

const RUN_ID = "run:web-research-method"
const SEARCH_FINGERPRINT = `sha256:${"a".repeat(64)}` as const
const FETCH_FINGERPRINT = `sha256:${"b".repeat(64)}` as const

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`
}

const createFingerprint = (namespace: string, value: unknown) =>
  `sha256:${createHash("sha256")
    .update(`test:${namespace}:${canonicalize(value)}`)
    .digest("hex")}` as const

function snapshot(
  overrides: {
    attemptedStrategyFingerprints?: readonly `sha256:${string}`[]
    completionAllowed?: boolean
    blockedAllowed?: boolean
    remainingChangedCandidateIds?: readonly string[]
  } = {},
) {
  return createWebResearchSnapshot(
    {
      runId: RUN_ID,
      snapshotId: "web-snapshot:1",
      candidates: [
        {
          candidateId: "candidate:search:1",
          kind: "search",
          query: "SK hynix current stock price",
          strategyFingerprint: SEARCH_FINGERPRINT,
        },
        {
          candidateId: "candidate:fetch:1",
          kind: "fetch",
          sourceUrl: "https://example.test/quote/000660",
          evidenceRef: "evidence:search-result:1",
          strategyFingerprint: FETCH_FINGERPRINT,
        },
      ],
      evidenceRefs: ["evidence:search-result:1", "evidence:document:1"],
      attemptedStrategyFingerprints: overrides.attemptedStrategyFingerprints ?? [],
      terminalAdmission: {
        completionAllowed: overrides.completionAllowed ?? false,
        blockedAllowed: overrides.blockedAllowed ?? false,
        remainingChangedCandidateIds: overrides.remainingChangedCandidateIds ?? [
          "candidate:search:1",
        ],
      },
    },
    createFingerprint,
  )
}

function admit(proposal: WebResearchNextAction, current = snapshot()) {
  const receipt = createWebResearchMethodReceipt(
    {
      receiptId: "receipt:web-method:1",
      runId: RUN_ID,
      snapshot: current,
      proposal,
    },
    createFingerprint,
  )
  return admitWebResearchNextAction(
    {
      runId: RUN_ID,
      snapshot: current,
      proposal,
      receipt,
    },
    createFingerprint,
  )
}

describe("Web research method proposal admission", () => {
  it("admits an exact search candidate proposed by the LLM", () => {
    const proposal: WebResearchNextAction = {
      kind: "execute_search",
      candidateId: "candidate:search:1",
      query: "SK hynix current stock price",
      strategyFingerprint: SEARCH_FINGERPRINT,
    }

    expect(admit(proposal)).toEqual({
      ok: true,
      action: proposal,
      receiptId: "receipt:web-method:1",
    })
  })

  it("admits an exact fetch candidate proposed by the LLM", () => {
    const proposal: WebResearchNextAction = {
      kind: "execute_fetch",
      candidateId: "candidate:fetch:1",
      sourceUrl: "https://example.test/quote/000660",
      evidenceRef: "evidence:search-result:1",
      strategyFingerprint: FETCH_FINGERPRINT,
    }

    expect(admit(proposal)).toEqual({
      ok: true,
      action: proposal,
      receiptId: "receipt:web-method:1",
    })
  })

  it("rejects an invented URL even when the candidate ID is valid", () => {
    const proposal: WebResearchNextAction = {
      kind: "execute_fetch",
      candidateId: "candidate:fetch:1",
      sourceUrl: "https://invented.example/private",
      evidenceRef: "evidence:search-result:1",
      strategyFingerprint: FETCH_FINGERPRINT,
    }

    expect(admit(proposal)).toEqual({
      ok: false,
      reasonCode: "web_research_candidate_mismatch",
    })
  })

  it("rejects a stale receipt bound to another immutable snapshot", () => {
    const first = snapshot()
    const next = createWebResearchSnapshot(
      {
        runId: RUN_ID,
        snapshotId: "web-snapshot:2",
        candidates: first.candidates,
        evidenceRefs: first.evidenceRefs,
        attemptedStrategyFingerprints: [SEARCH_FINGERPRINT],
        terminalAdmission: first.terminalAdmission,
      },
      createFingerprint,
    )
    const proposal: WebResearchNextAction = {
      kind: "execute_fetch",
      candidateId: "candidate:fetch:1",
      sourceUrl: "https://example.test/quote/000660",
      evidenceRef: "evidence:search-result:1",
      strategyFingerprint: FETCH_FINGERPRINT,
    }
    const receipt = createWebResearchMethodReceipt(
      {
        receiptId: "receipt:web-method:stale",
        runId: RUN_ID,
        snapshot: first,
        proposal,
      },
      createFingerprint,
    )

    expect(
      admitWebResearchNextAction(
        {
          runId: RUN_ID,
          snapshot: next,
          proposal,
          receipt,
        },
        createFingerprint,
      ),
    ).toEqual({
      ok: false,
      reasonCode: "web_research_receipt_snapshot_mismatch",
    })
  })

  it("rejects an unchanged strategy already attempted in the run", () => {
    const proposal: WebResearchNextAction = {
      kind: "execute_search",
      candidateId: "candidate:search:1",
      query: "SK hynix current stock price",
      strategyFingerprint: SEARCH_FINGERPRINT,
    }

    expect(
      admit(proposal, snapshot({ attemptedStrategyFingerprints: [SEARCH_FINGERPRINT] })),
    ).toEqual({
      ok: false,
      reasonCode: "web_research_strategy_unchanged",
    })
  })

  it("rejects completion until the result verifier admits the evidence", () => {
    const proposal: WebResearchNextAction = {
      kind: "propose_complete",
      evidenceRefs: ["evidence:document:1"],
    }

    expect(admit(proposal)).toEqual({
      ok: false,
      reasonCode: "web_research_completion_not_admitted",
    })
    expect(
      admit(
        proposal,
        snapshot({
          completionAllowed: true,
          remainingChangedCandidateIds: [],
        }),
      ),
    ).toEqual({
      ok: true,
      action: proposal,
      receiptId: "receipt:web-method:1",
    })
  })

  it("rejects blocked while a changed candidate remains or exhaustion is not admitted", () => {
    const proposal: WebResearchNextAction = {
      kind: "propose_blocked",
      evidenceRefs: ["evidence:search-result:1"],
      reasonCode: "source_unavailable",
    }

    expect(admit(proposal, snapshot({ blockedAllowed: true }))).toEqual({
      ok: false,
      reasonCode: "web_research_changed_candidate_remaining",
    })
    expect(admit(proposal, snapshot({ remainingChangedCandidateIds: [] }))).toEqual({
      ok: false,
      reasonCode: "web_research_blocked_not_admitted",
    })
    expect(
      admit(
        proposal,
        snapshot({
          blockedAllowed: true,
          remainingChangedCandidateIds: [],
        }),
      ),
    ).toEqual({
      ok: true,
      action: proposal,
      receiptId: "receipt:web-method:1",
    })
  })

  it("keeps the Domain contract free of runtime and I/O dependencies", () => {
    const source = readFileSync("packages/core/src/contracts/web-research-method.ts", "utf8")

    expect(source).not.toMatch(
      /from\s+["']node:|process\.env|globalThis\.fetch|await\s+fetch\(|db\/|logger\//u,
    )
  })
})
