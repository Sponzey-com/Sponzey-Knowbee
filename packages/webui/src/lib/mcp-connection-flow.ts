import type {
  McpCatalogDetail,
  McpCatalogPageResponse,
  McpConnectionDraft,
  McpCreateRequest,
  McpMutationReceipt,
  McpProtectedUpdateRequest,
} from "../contracts/mcp"

export type McpConnectionFlowState =
  | "editing"
  | "probing"
  | "ready"
  | "saving"
  | "verifying"
  | "succeeded"
  | "failed"
export type McpConnectionMode = "create" | "edit"
export interface McpConnectionFormDraft {
  displayName: string
  transport: "stdio" | "http"
  command: string
  argsText: string
  cwd: string
  url: string
  required: boolean
  replaceConnection: boolean
}
export interface McpConnectionFlow {
  state: McpConnectionFlowState
  mode: McpConnectionMode
  mcpRef: string | null
  draft: McpConnectionFormDraft
  reasonCodes: string[]
  probeSequence: number
  mutationSequence: number
}
export type McpConnectionFlowEvent =
  | { type: "draft_changed"; patch: Partial<McpConnectionFormDraft> }
  | { type: "probe"; sequence: number }
  | { type: "probe_completed"; sequence: number; ready: boolean; reasonCode?: string }
  | { type: "save"; sequence: number }
  | { type: "save_completed"; sequence: number; active: boolean; reasonCode?: string }
  | { type: "verification_completed"; sequence: number; verified: boolean; reasonCode?: string }

export function initialMcpConnectionFlow(input?: {
  mode?: McpConnectionMode
  mcpRef?: string
  displayName?: string
  required?: boolean
  transport?: "stdio" | "http"
}): McpConnectionFlow {
  return {
    state: "editing",
    mode: input?.mode ?? "create",
    mcpRef: input?.mcpRef ?? null,
    draft: {
      displayName: input?.displayName ?? "",
      transport: input?.transport ?? "stdio",
      command: "",
      argsText: "",
      cwd: "",
      url: "",
      required: input?.required ?? false,
      replaceConnection: false,
    },
    reasonCodes: [],
    probeSequence: 0,
    mutationSequence: 0,
  }
}

export function reduceMcpConnectionFlow(
  current: McpConnectionFlow,
  event: McpConnectionFlowEvent,
): McpConnectionFlow {
  if (event.type === "draft_changed")
    return {
      ...current,
      state: "editing",
      draft: { ...current.draft, ...event.patch },
      reasonCodes: [],
    }
  if (event.type === "probe" && ["editing", "failed", "ready"].includes(current.state))
    return { ...current, state: "probing", reasonCodes: [], probeSequence: event.sequence }
  if (event.type === "probe_completed") {
    if (current.state !== "probing" || event.sequence !== current.probeSequence) return current
    return {
      ...current,
      state: event.ready ? "ready" : "failed",
      reasonCodes: event.reasonCode ? [event.reasonCode] : [],
    }
  }
  if (event.type === "save" && current.state === "ready")
    return { ...current, state: "saving", reasonCodes: [], mutationSequence: event.sequence }
  if (event.type === "save_completed") {
    if (current.state !== "saving" || event.sequence !== current.mutationSequence) return current
    return event.active
      ? { ...current, state: "verifying" }
      : { ...current, state: "failed", reasonCodes: event.reasonCode ? [event.reasonCode] : [] }
  }
  if (event.type === "verification_completed") {
    if (current.state !== "verifying" || event.sequence !== current.mutationSequence) return current
    return event.verified
      ? { ...current, state: "succeeded", reasonCodes: [] }
      : {
          ...current,
          state: "failed",
          reasonCodes: [event.reasonCode ?? "mcp_projection_not_verified"],
        }
  }
  throw new Error("mcp_connection_transition_invalid")
}

export function normalizeMcpDraft(draft: McpConnectionFormDraft): McpConnectionDraft {
  if (draft.transport === "http")
    return {
      displayName: draft.displayName.trim(),
      transport: "http",
      command: "",
      args: [],
      cwd: "",
      url: draft.url.trim(),
      required: draft.required,
    }
  return {
    displayName: draft.displayName.trim(),
    transport: "stdio",
    command: draft.command.trim(),
    args: draft.argsText
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean),
    cwd: draft.cwd.trim(),
    required: draft.required,
  }
}

function envelope(input: {
  revision: number
  now: number
  randomId: () => string
  purpose: "mcp_create" | "mcp_update"
}) {
  return {
    scope: "capability:write" as const,
    mutationId: input.randomId(),
    targetRevision: input.revision + 1,
    purpose: input.purpose,
    issuedAt: input.now,
    nonce: input.randomId(),
  }
}

export function createMcpMutationRequest(input: {
  draft: McpConnectionFormDraft
  revision: number
  now: number
  randomId: () => string
}): McpCreateRequest {
  return {
    envelope: envelope({ ...input, purpose: "mcp_create" }),
    draft: normalizeMcpDraft(input.draft),
  }
}

export function createMcpProtectedUpdateRequest(input: {
  draft: McpConnectionFormDraft
  revision: number
  now: number
  randomId: () => string
}): McpProtectedUpdateRequest {
  const normalized = normalizeMcpDraft(input.draft)
  return {
    envelope: envelope({ ...input, purpose: "mcp_update" }),
    change: {
      displayName: normalized.displayName,
      required: normalized.required,
      ...(input.draft.replaceConnection
        ? {
            replacement: {
              transport: normalized.transport,
              command: normalized.command,
              args: normalized.args,
              cwd: normalized.cwd,
              ...(normalized.url !== undefined ? { url: normalized.url } : {}),
            },
          }
        : {}),
    },
  }
}

export function verifyMcpMutationProjection(input: {
  receipt: McpMutationReceipt
  catalog: McpCatalogPageResponse
  detail: McpCatalogDetail
}): boolean {
  if (input.receipt.state !== "active" || !input.receipt.mcpRef) return false
  const row = input.catalog.items.find((item) => item.mcpRef === input.receipt.mcpRef)
  return Boolean(
    row &&
      input.catalog.revision === input.receipt.revision &&
      row.revision === input.receipt.revision &&
      input.detail.mcpRef === input.receipt.mcpRef &&
      input.detail.revision === input.receipt.revision &&
      input.detail.runtimeStatus === "ready",
  )
}

const REASONS: Readonly<Record<string, readonly [string, string]>> = {
  mcp_display_name_missing: ["이름을 입력해 주세요.", "Enter a name."],
  mcp_command_missing: ["실행 파일을 입력해 주세요.", "Enter an executable."],
  mcp_url_missing: ["HTTP endpoint를 입력해 주세요.", "Enter an HTTP endpoint."],
  mcp_url_invalid: ["올바른 HTTP endpoint를 입력해 주세요.", "Enter a valid HTTP endpoint."],
  mcp_url_protocol_invalid: [
    "HTTP 또는 HTTPS 주소만 사용할 수 있습니다.",
    "Only HTTP or HTTPS endpoints are allowed.",
  ],
  mcp_url_credentials_forbidden: [
    "주소에 계정 정보를 넣을 수 없습니다.",
    "Credentials cannot be embedded in the endpoint.",
  ],
  mcp_url_fragment_forbidden: ["주소의 fragment는 제거해 주세요.", "Remove the endpoint fragment."],
  mcp_transport_fields_mixed: [
    "전송 방식에 맞는 입력만 사용할 수 있습니다.",
    "Use only fields for the selected transport.",
  ],
  mcp_connection_probe_failed: [
    "연결할 수 없습니다. 연결 정보를 확인해 주세요.",
    "Could not connect. Check the connection details.",
  ],
  mcp_name_duplicated: ["이미 사용 중인 이름입니다.", "This name is already in use."],
  mutation_revision_conflict: [
    "목록이 변경되었습니다. 다시 연결을 확인해 주세요.",
    "The catalog changed. Check the connection again.",
  ],
  mutation_nonce_replayed: [
    "저장 요청이 만료되었습니다. 다시 연결을 확인해 주세요.",
    "The save request expired. Check the connection again.",
  ],
  mutation_expired: [
    "저장 준비 시간이 지났습니다. 다시 연결을 확인해 주세요.",
    "The save request expired. Check the connection again.",
  ],
  mcp_projection_not_verified: [
    "최신 목록에서 저장 결과를 확인하지 못했습니다.",
    "The saved result was not visible in the latest catalog.",
  ],
}

export function mcpConnectionReasonText(reasonCode: string, language: "ko" | "en") {
  const value = REASONS[reasonCode]
  return (
    value?.[language === "ko" ? 0 : 1] ??
    (language === "ko" ? "요청을 완료하지 못했습니다." : "The request could not be completed.")
  )
}
