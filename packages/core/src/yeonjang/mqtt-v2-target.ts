export interface YeonjangMqttV2TargetSnapshot {
  readonly extensionId: string
  readonly nodeId?: string | null
  readonly instanceId?: string | null
  readonly sessionId?: string | null
  readonly protocolVersion?: string | null
  readonly state?: string | null
  readonly targetFingerprint?: string | null
}

export type YeonjangMqttV2TargetResolution =
  | { readonly ok: true; readonly target: { readonly instanceId: string; readonly sessionId: string; readonly targetFingerprint: string } }
  | { readonly ok: false; readonly reasonCode:
      | "yeonjang_v2_target_not_found"
      | "yeonjang_v2_target_ambiguous"
      | "yeonjang_v2_target_offline"
      | "yeonjang_v2_target_session_mismatch"
      | "yeonjang_v2_target_projection_incomplete" }

/** Resolves one exact signed v2 projection without inventing a default target. */
export function resolveYeonjangMqttV2Target(input: {
  readonly snapshots: readonly YeonjangMqttV2TargetSnapshot[]
  readonly requestedExtensionId: string
  readonly expectedSessionId?: string
}): YeonjangMqttV2TargetResolution {
  const requested = input.requestedExtensionId.trim()
  const matches = input.snapshots.filter((snapshot) =>
    snapshot.protocolVersion === "2"
    && (snapshot.extensionId === requested || snapshot.nodeId === requested || snapshot.instanceId === requested),
  )
  if (matches.length === 0) return { ok: false, reasonCode: "yeonjang_v2_target_not_found" }
  if (matches.length !== 1) return { ok: false, reasonCode: "yeonjang_v2_target_ambiguous" }
  const target = matches[0]!
  if (target.state !== "online") return { ok: false, reasonCode: "yeonjang_v2_target_offline" }
  if (input.expectedSessionId && target.sessionId !== input.expectedSessionId) {
    return { ok: false, reasonCode: "yeonjang_v2_target_session_mismatch" }
  }
  if (!target.instanceId || !target.sessionId || !/^sha256:[0-9a-f]{64}$/u.test(target.targetFingerprint ?? "")) {
    return { ok: false, reasonCode: "yeonjang_v2_target_projection_incomplete" }
  }
  return {
    ok: true,
    target: {
      instanceId: target.instanceId,
      sessionId: target.sessionId,
      targetFingerprint: target.targetFingerprint!,
    },
  }
}
