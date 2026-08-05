export interface MutationEnvelope { actorRef: string; scope: string; mutationId: string; targetRevision: number; purpose: string; issuedAt: number; nonce: string }
export type MutationEnvelopeDiagnostic = { reasonCode: "mutation_field_missing" | "mutation_scope_denied" | "mutation_nonce_replayed" | "mutation_expired" | "mutation_revision_conflict" }

export function validateMutationEnvelope(input: { envelope: MutationEnvelope; requiredScope: string; currentRevision: number; now: number; maxAgeMs: number; usedNonces: ReadonlySet<string> }) {
  const diagnostics: MutationEnvelopeDiagnostic[] = []
  const requiredText = [input.envelope.actorRef, input.envelope.scope, input.envelope.mutationId, input.envelope.purpose, input.envelope.nonce]
  if (requiredText.some((value) => !value.trim())) diagnostics.push({ reasonCode: "mutation_field_missing" })
  if (input.envelope.scope !== input.requiredScope) diagnostics.push({ reasonCode: "mutation_scope_denied" })
  if (input.usedNonces.has(input.envelope.nonce)) diagnostics.push({ reasonCode: "mutation_nonce_replayed" })
  if (input.now - input.envelope.issuedAt > input.maxAgeMs || input.envelope.issuedAt > input.now) diagnostics.push({ reasonCode: "mutation_expired" })
  if (input.envelope.targetRevision !== input.currentRevision + 1) diagnostics.push({ reasonCode: "mutation_revision_conflict" })
  return { ok: diagnostics.length === 0, diagnostics }
}

export type ProjectionAudience = "user" | "field_debug" | "audit"
const USER_FIELDS = new Set(["name", "kind", "status", "reasonCode", "allowedActions", "revision", "observedAt"])
const FIELD_DEBUG_FIELDS = new Set([...USER_FIELDS, "internalId", "mutationId", "targetRevision"])

export function projectCapabilityAudience(input: { audience: ProjectionAudience; authorized: boolean; source: Readonly<Record<string, unknown>> }): Record<string, unknown> {
  if (input.audience === "audit") {
    if (!input.authorized) throw new Error("Audit authorization required")
    return { ...input.source }
  }
  const allowed = input.audience === "field_debug" ? FIELD_DEBUG_FIELDS : USER_FIELDS
  return Object.fromEntries(Object.entries(input.source).filter(([key]) => allowed.has(key)))
}

export function createRuntimeConfigSnapshot(externalConstants: Readonly<Record<string, string | undefined>>, allowlist: readonly string[]): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {}
  for (const key of allowlist) if (externalConstants[key] !== undefined) snapshot[key] = externalConstants[key] as string
  return Object.freeze(snapshot)
}

export function rejectRuntimeEnvironmentMutation(key: string): never { throw new Error(`Runtime environment mutation is prohibited: ${key}`) }
