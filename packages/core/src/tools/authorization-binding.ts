import type { ToolDispatchAuthorizationScope } from "./types.js"

const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u

export function buildToolAuthorizationBinding(
  toolParams: Record<string, unknown>,
  scope?: ToolDispatchAuthorizationScope,
): Record<string, unknown> | null {
  const fingerprint = scope?.executionTargetFingerprint
  if (fingerprint === undefined) return toolParams
  if (!SHA256_FINGERPRINT_PATTERN.test(fingerprint)) return null
  return {
    toolParams,
    executionTargetFingerprint: fingerprint,
  }
}
