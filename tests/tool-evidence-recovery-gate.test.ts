import { describe, expect, it } from "vitest"
import {
  buildEmptyResultRecoveryPrompt,
  evaluateSuccessfulToolEvidenceTrust,
} from "../packages/core/src/runs/recovery.ts"

const validEvidence = {
  toolName: "mcp_finance_quote",
  output: "quote=123",
  evidenceSource: {
    sourceKind: "mcp" as const,
    sourceRef: `tool-result:mcp:${"a".repeat(64)}`,
    trustClass: "untrusted_external" as const,
    instructionIsolation: "data_only" as const,
  },
}

describe("tool evidence recovery trust gate", () => {
  it("rejects missing or malformed source receipts without exposing output", () => {
    expect(
      evaluateSuccessfulToolEvidenceTrust({
        toolName: "unknown_tool",
        output: "secret result",
      }),
    ).toEqual({
      allowed: false,
      reasonCode: "tool_evidence_source_missing",
      sourceRef: "unavailable",
    })
    const malformed = evaluateSuccessfulToolEvidenceTrust({
      ...validEvidence,
      evidenceSource: { ...validEvidence.evidenceSource, sourceRef: "mcp:raw-server-name" },
    })
    expect(malformed).toEqual({
      allowed: false,
      reasonCode: "tool_evidence_source_ref_invalid",
      sourceRef: "unavailable",
    })
    expect(JSON.stringify(malformed)).not.toContain("secret result")
  })

  it("accepts a canonical data-only source receipt without proving sufficiency", () => {
    expect(evaluateSuccessfulToolEvidenceTrust(validEvidence)).toEqual({
      allowed: true,
      reasonCode: "tool_evidence_data_only",
      sourceRef: validEvidence.evidenceSource.sourceRef,
    })
  })

  it("accepts canonical web evidence and rejects a mismatched source kind", () => {
    const webEvidence = {
      toolName: "web_fetch",
      output: "current quote",
      evidenceSource: {
        sourceKind: "web" as const,
        sourceRef: `tool-result:web:${"b".repeat(64)}`,
        trustClass: "untrusted_external" as const,
        instructionIsolation: "data_only" as const,
      },
    }

    expect(evaluateSuccessfulToolEvidenceTrust(webEvidence)).toEqual({
      allowed: true,
      reasonCode: "tool_evidence_data_only",
      sourceRef: webEvidence.evidenceSource.sourceRef,
    })
    expect(
      evaluateSuccessfulToolEvidenceTrust({
        ...webEvidence,
        evidenceSource: { ...webEvidence.evidenceSource, sourceKind: "file" as const },
      }),
    ).toEqual({
      allowed: false,
      reasonCode: "tool_evidence_source_ref_invalid",
      sourceRef: "unavailable",
    })
  })

  it("excludes untrusted successes from recovery context and keeps valid source evidence", () => {
    const prompt = buildEmptyResultRecoveryPrompt({
      originalRequest: "Get both quotes",
      previousResult: "",
      successfulTools: [
        { toolName: "missing_receipt_tool", output: "not trustworthy" },
        validEvidence,
      ],
      sawRealFilesystemMutation: false,
    })

    expect(prompt).toContain("mcp_finance_quote")
    expect(prompt).not.toContain("missing_receipt_tool")
    expect(prompt).not.toContain("not trustworthy")
    expect(prompt).not.toContain("quote=123")
  })
})
