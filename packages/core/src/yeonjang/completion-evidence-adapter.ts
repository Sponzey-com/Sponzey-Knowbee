import { createHash } from "node:crypto"
import type { SuccessfulToolEvidence } from "../runs/recovery.js"
import type { YeonjangEvidenceEnvelope } from "./evidence.js"

export function buildSuccessfulToolEvidenceFromYeonjangGoalValidation(input: {
  evidence: YeonjangEvidenceEnvelope
  output: string
}): SuccessfulToolEvidence {
  const output = input.output.trim() || input.evidence.summary
  return {
    toolName: input.evidence.toolName,
    output,
    details: {
      via: "yeonjang",
      evidence: input.evidence,
    },
    evidenceSource: {
      sourceKind: "yeonjang",
      sourceRef: `tool-result:yeonjang:${fingerprint(input.evidence)}`,
      trustClass: "untrusted_external",
      instructionIsolation: "data_only",
    },
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex")
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
