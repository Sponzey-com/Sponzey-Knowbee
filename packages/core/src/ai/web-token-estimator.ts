import type { TokenEstimatorPort } from "../contracts/web-research-context-budget.js"

export function createDeterministicTokenEstimator(): TokenEstimatorPort {
  const encoder = new TextEncoder()
  return Object.freeze({
    version: "utf8-byte4-v1",
    estimateTokens(text: string): number {
      if (!text) return 0
      return Math.ceil(encoder.encode(text).byteLength / 4)
    },
  })
}
