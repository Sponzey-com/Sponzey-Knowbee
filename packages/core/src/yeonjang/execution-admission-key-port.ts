import { createHmac } from "node:crypto"

export type YeonjangExecutionAdmissionKeyHandle = {
  readonly keyId: string
  readonly extensionId: string
  readonly sessionId?: string
  sign(input: { readonly canonicalPayload: string }): string
}

export interface YeonjangExecutionAdmissionKeyPort {
  resolve(input: {
    readonly extensionId: string
    readonly sessionId?: string
  }): YeonjangExecutionAdmissionKeyHandle | undefined
}

export function createYeonjangExecutionAdmissionPasswordHandle(input: {
  readonly extensionId: string
  readonly sessionId?: string
  readonly keyId: string
  readonly connectionPassword: string
}): YeonjangExecutionAdmissionKeyHandle | undefined {
  const extensionId = input.extensionId.trim()
  const sessionId = normalizeOptional(input.sessionId)
  const keyId = input.keyId.trim()
  const connectionPassword = input.connectionPassword.trim()
  if (!extensionId || !keyId || !connectionPassword) return undefined
  return Object.freeze({
    keyId,
    extensionId,
    ...(sessionId ? { sessionId } : {}),
    sign: ({ canonicalPayload }: { readonly canonicalPayload: string }) =>
      `hmac-sha256:${createHmac("sha256", connectionPassword)
        .update(canonicalPayload, "utf8")
        .digest("hex")}`,
  })
}

/**
 * Runtime key state changes only through an approved pairing transaction.
 * Request handling receives the read-only keyPort and cannot mutate this registry.
 */
export interface YeonjangExecutionAdmissionKeyRegistry {
  readonly keyPort: YeonjangExecutionAdmissionKeyPort
  register(handle: YeonjangExecutionAdmissionKeyHandle):
    | { readonly ok: true }
    | { readonly ok: false; readonly reasonCode: "execution_admission_key_bootstrap_invalid" }
  remove(input: { readonly extensionId: string; readonly sessionId?: string }): void
}

export type BootstrapYeonjangExecutionAdmissionKeyPortResult =
  | {
      readonly ok: true
      readonly keyPort: YeonjangExecutionAdmissionKeyPort
    }
  | {
      readonly ok: false
      readonly reasonCode:
        | "execution_admission_key_bootstrap_invalid"
        | "execution_admission_key_binding_duplicate"
    }

export function createBootstrapYeonjangExecutionAdmissionKeyPort(input: {
  readonly handles: readonly YeonjangExecutionAdmissionKeyHandle[]
}): BootstrapYeonjangExecutionAdmissionKeyPortResult {
  const handles = new Map<string, YeonjangExecutionAdmissionKeyHandle>()
  for (const handle of input.handles) {
    const extensionId = handle.extensionId.trim()
    const sessionId = normalizeOptional(handle.sessionId)
    const keyId = handle.keyId.trim()
    if (!extensionId || !keyId || typeof handle.sign !== "function") {
      return { ok: false, reasonCode: "execution_admission_key_bootstrap_invalid" }
    }
    const binding = keyBinding(extensionId, sessionId)
    if (handles.has(binding)) {
      return { ok: false, reasonCode: "execution_admission_key_binding_duplicate" }
    }
    handles.set(binding, handle)
  }
  return {
    ok: true,
    keyPort: Object.freeze({
      resolve: ({ extensionId, sessionId }: { readonly extensionId: string; readonly sessionId?: string }) => {
        const normalizedExtensionId = extensionId.trim()
        const normalizedSessionId = normalizeOptional(sessionId)
        return (
          handles.get(keyBinding(normalizedExtensionId, normalizedSessionId)) ??
          (normalizedSessionId ? handles.get(keyBinding(normalizedExtensionId, "")) : undefined)
        )
      },
    }),
  }
}

export function createYeonjangExecutionAdmissionKeyRegistry(input: {
  readonly fallbackPorts?: readonly YeonjangExecutionAdmissionKeyPort[]
} = {}): YeonjangExecutionAdmissionKeyRegistry {
  const handles = new Map<string, YeonjangExecutionAdmissionKeyHandle>()
  const fallbackPorts = Object.freeze([...(input.fallbackPorts ?? [])])
  const keyPort: YeonjangExecutionAdmissionKeyPort = Object.freeze({
    resolve: ({
      extensionId,
      sessionId,
    }: {
      readonly extensionId: string
      readonly sessionId?: string
    }) => {
      const normalizedExtensionId = extensionId.trim()
      const normalizedSessionId = normalizeOptional(sessionId)
      const exact = handles.get(keyBinding(normalizedExtensionId, normalizedSessionId))
      if (exact) return exact
      const extensionWide = normalizedSessionId
        ? handles.get(keyBinding(normalizedExtensionId, ""))
        : undefined
      if (extensionWide) return extensionWide
      for (const fallback of fallbackPorts) {
        const resolved = fallback.resolve({
          extensionId: normalizedExtensionId,
          ...(normalizedSessionId ? { sessionId: normalizedSessionId } : {}),
        })
        if (resolved) return resolved
      }
      return undefined
    },
  })
  return Object.freeze({
    keyPort,
    register: (handle: YeonjangExecutionAdmissionKeyHandle) => {
      const normalized = normalizeHandle(handle)
      if (!normalized) {
        return { ok: false as const, reasonCode: "execution_admission_key_bootstrap_invalid" as const }
      }
      handles.set(keyBinding(normalized.extensionId, normalizeOptional(normalized.sessionId)), normalized)
      return { ok: true as const }
    },
    remove: ({ extensionId, sessionId }: { readonly extensionId: string; readonly sessionId?: string }) => {
      handles.delete(keyBinding(extensionId.trim(), normalizeOptional(sessionId)))
    },
  })
}

export type YeonjangExecutionAdmissionKeyBinding = {
  readonly schemaVersion: "knowbee.yeonjang-execution-admission-key-binding.v1"
  readonly status: "ready" | "blocked"
  readonly reasonCode:
    | "execution_admission_key_ready"
    | "execution_admission_key_unavailable"
    | "execution_admission_key_binding_mismatch"
  readonly keyRef?: string
}

export function bindYeonjangExecutionAdmissionKey(input: {
  readonly extensionId: string
  readonly sessionId?: string
  readonly keyPort: YeonjangExecutionAdmissionKeyPort
}): YeonjangExecutionAdmissionKeyBinding {
  const extensionId = input.extensionId.trim()
  const sessionId = normalizeOptional(input.sessionId)
  const handle = input.keyPort.resolve({
    extensionId,
    ...(sessionId ? { sessionId } : {}),
  })
  if (!handle) {
    return blocked("execution_admission_key_unavailable")
  }
  if (
    handle.extensionId.trim() !== extensionId ||
    (normalizeOptional(handle.sessionId) && normalizeOptional(handle.sessionId) !== sessionId) ||
    handle.keyId.trim().length === 0
  ) {
    return blocked("execution_admission_key_binding_mismatch")
  }
  return {
    schemaVersion: "knowbee.yeonjang-execution-admission-key-binding.v1",
    status: "ready",
    reasonCode: "execution_admission_key_ready",
    keyRef: `yeonjang-execution-admission-key:${handle.keyId.trim()}`,
  }
}

function blocked(
  reasonCode: Exclude<
    YeonjangExecutionAdmissionKeyBinding["reasonCode"],
    "execution_admission_key_ready"
  >,
): YeonjangExecutionAdmissionKeyBinding {
  return {
    schemaVersion: "knowbee.yeonjang-execution-admission-key-binding.v1",
    status: "blocked",
    reasonCode,
  }
}

function normalizeOptional(value: string | undefined): string {
  return value?.trim() ?? ""
}

function normalizeHandle(
  handle: YeonjangExecutionAdmissionKeyHandle,
): YeonjangExecutionAdmissionKeyHandle | undefined {
  const extensionId = handle.extensionId.trim()
  const keyId = handle.keyId.trim()
  const sessionId = normalizeOptional(handle.sessionId)
  if (!extensionId || !keyId || typeof handle.sign !== "function") return undefined
  return Object.freeze({
    keyId,
    extensionId,
    ...(sessionId ? { sessionId } : {}),
    sign: handle.sign,
  })
}

function keyBinding(extensionId: string, sessionId: string): string {
  return `${extensionId}\u0000${sessionId}`
}
