export type CapabilityKind = "skill" | "mcp" | "yeonjang"
export type CapabilityAvailability = "available" | "permission_required" | "unsupported" | "unavailable"

export interface CapabilitySummary {
  capabilityId: string
  name: string
  kind: CapabilityKind
  status: CapabilityAvailability
  reasonCode: string
  allowedActions: readonly string[]
  revision: number
  observedAt: string
}

export type CapabilitySummaryDiagnostic = {
  reasonCode: "capability_reason_missing" | "capability_revision_invalid" | "restricted_projection_field"
  field?: string
}

const RESTRICTED_FIELDS = new Set([
  "secret", "token", "password", "absolutePath", "rawCommand", "environment", "internalId",
])

export function validateCapabilitySummary(input: CapabilitySummary & Record<string, unknown>): {
  ok: boolean
  diagnostics: CapabilitySummaryDiagnostic[]
} {
  const diagnostics: CapabilitySummaryDiagnostic[] = []
  if (input.status !== "available" && !input.reasonCode.trim()) {
    diagnostics.push({ reasonCode: "capability_reason_missing" })
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    diagnostics.push({ reasonCode: "capability_revision_invalid" })
  }
  for (const field of Object.keys(input)) {
    if (RESTRICTED_FIELDS.has(field)) {
      diagnostics.push({ reasonCode: "restricted_projection_field", field })
    }
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

export interface RevisionedProjection {
  revision: number
}

type QueryAdapter<T extends RevisionedProjection> = (queryKey: string, signal: AbortSignal) => Promise<T>

export class CapabilityQueryCoordinator<T extends RevisionedProjection> {
  private readonly adapter: QueryAdapter<T>
  private readonly current = new Map<string, T>()
  private readonly inFlight = new Map<string, {
    controller: AbortController
    owners: Set<string>
    promise: Promise<{ accepted: true; projection: T } | { accepted: false; reasonCode: "stale_revision_rejected"; currentRevision: number }>
  }>()

  constructor(adapter: QueryAdapter<T>) {
    this.adapter = adapter
  }

  query(queryKey: string, owner = "anonymous"): Promise<
    { accepted: true; projection: T }
    | { accepted: false; reasonCode: "stale_revision_rejected"; currentRevision: number }
  > {
    const existing = this.inFlight.get(queryKey)
    if (existing) {
      existing.owners.add(owner)
      return existing.promise
    }
    const controller = new AbortController()
    const owners = new Set([owner])
    const promise = this.adapter(queryKey, controller.signal)
      .then((projection) => this.accept(queryKey, projection))
      .finally(() => this.inFlight.delete(queryKey))
    this.inFlight.set(queryKey, { controller, owners, promise })
    return promise
  }

  accept(queryKey: string, projection: T):
    { accepted: true; projection: T }
    | { accepted: false; reasonCode: "stale_revision_rejected"; currentRevision: number } {
    const current = this.current.get(queryKey)
    if (current && projection.revision < current.revision) {
      return { accepted: false, reasonCode: "stale_revision_rejected", currentRevision: current.revision }
    }
    this.current.set(queryKey, projection)
    return { accepted: true, projection }
  }

  releaseOwner(owner: string): void {
    for (const request of this.inFlight.values()) {
      if (!request.owners.delete(owner)) continue
      if (request.owners.size === 0) request.controller.abort()
    }
  }
}
