import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  createWebResearchSnapshot,
  type WebResearchFingerprintPort,
} from "../packages/core/src/contracts/web-research-method.ts"
import { projectWebResearchLinkCandidates } from "../packages/core/src/contracts/web-research-link-candidate.js"

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

const createFingerprint: WebResearchFingerprintPort = (namespace, value) =>
  `sha256:${createHash("sha256")
    .update(`test:${namespace}:${canonicalize(value)}`)
    .digest("hex")}`

describe("web research fetched-document link candidate projection", () => {
  it("projects only exact admitted observations with parent provenance", () => {
    const result = projectWebResearchLinkCandidates(
      {
        runId: "run:links",
        parentEvidenceRef: "evidence:document:1",
        parentProvenanceRef: "provenance:document:1",
        documentFinalUrl: "https://example.com/final/page",
        observations: [
          { ordinal: 1, url: "https://example.com/guide?id=1" },
          { ordinal: 2, url: "https://private.test/admin" },
        ],
        targetAdmissions: [
          {
            observedUrl: "https://example.com/guide?id=1",
            status: "allowed",
            canonicalUrl: "https://example.com/guide?id=1",
          },
          {
            observedUrl: "https://private.test/admin",
            status: "denied",
            reasonCode: "address_not_public",
          },
          {
            observedUrl: "https://invented.example/not-in-document",
            status: "allowed",
            canonicalUrl: "https://invented.example/not-in-document",
          },
        ],
        maxCandidates: 8,
      },
      createFingerprint,
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      kind: "fetch",
      sourceUrl: "https://example.com/guide?id=1",
      evidenceRef: "evidence:document:1",
      discovery: {
        origin: "fetched_document_link",
        parentEvidenceRef: "evidence:document:1",
        parentProvenanceRef: "provenance:document:1",
        documentFinalUrl: "https://example.com/final/page",
      },
    })
    expect(result.candidates[0]?.candidateId).toMatch(/^web-link:sha256:[a-f0-9]{64}$/u)
    expect(result.candidates[0]?.strategyFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(result.candidates[0]?.discovery.discoveryFingerprint).toMatch(
      /^sha256:[a-f0-9]{64}$/u,
    )
    const snapshot = createWebResearchSnapshot(
      {
        runId: "run:links",
        snapshotId: "snapshot:links",
        candidates: result.candidates,
        evidenceRefs: ["evidence:document:1"],
        attemptedStrategyFingerprints: [],
        terminalAdmission: {
          completionAllowed: false,
          blockedAllowed: false,
          remainingChangedCandidateIds: [result.candidates[0]?.candidateId ?? ""],
        },
      },
      createFingerprint,
    )
    expect(snapshot.candidates[0]).toEqual(result.candidates[0])
    expect(result.exclusions).toEqual([
      { ordinal: 2, reasonCode: "address_not_public" },
    ])
    expect(JSON.stringify(result)).not.toContain("invented.example")
  })

  it("deduplicates canonical targets and enforces the candidate bound", () => {
    const result = projectWebResearchLinkCandidates(
      {
        runId: "run:links",
        parentEvidenceRef: "evidence:document:1",
        parentProvenanceRef: "provenance:document:1",
        documentFinalUrl: "https://example.com/final/page",
        observations: [
          { ordinal: 1, url: "https://example.com/a" },
          { ordinal: 2, url: "https://example.com/b" },
          { ordinal: 3, url: "https://example.com/c" },
        ],
        targetAdmissions: [
          {
            observedUrl: "https://example.com/a",
            status: "allowed",
            canonicalUrl: "https://example.com/same",
          },
          {
            observedUrl: "https://example.com/b",
            status: "allowed",
            canonicalUrl: "https://example.com/same",
          },
          {
            observedUrl: "https://example.com/c",
            status: "allowed",
            canonicalUrl: "https://example.com/c",
          },
        ],
        maxCandidates: 1,
      },
      createFingerprint,
    )

    expect(result.candidates.map((candidate) => candidate.sourceUrl)).toEqual([
      "https://example.com/same",
    ])
    expect(result.exclusions).toEqual([
      { ordinal: 2, reasonCode: "duplicate_canonical_url" },
      { ordinal: 3, reasonCode: "candidate_limit_reached" },
    ])
  })

  it("keeps link text and document bodies outside the projection contract", () => {
    const source = readFileSync(
      "packages/core/src/contracts/web-research-link-candidate.ts",
      "utf8",
    )

    expect(source).not.toMatch(
      /linkText|anchorText|markdown|rawHtml|instruction|process\.env|from\s+["']node:/u,
    )
  })
})
