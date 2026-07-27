import type { AIAuthMode, AIBackendCredentials, AIProviderType } from "../../contracts/ai"
import type { FeatureCapability } from "../../contracts/capabilities"
import type {
  McpBindingReceipt,
  McpBindingRequest,
  McpCatalogDetail,
  McpCatalogPageResponse,
  McpCatalogQueryInput,
  McpConnectionDraft,
  McpCreateRequest,
  McpDeleteRequest,
  McpLifecycleReceipt,
  McpMutationReceipt,
  McpProbeReceipt,
  McpProtectedUpdateRequest,
  McpRecoveryReceipt,
  McpRecoveryRequest,
  McpServersResponse,
  McpStatusRequest,
} from "../../contracts/mcp"
import type { SetupDraft, SetupMcpServerDraft, SetupState } from "../../contracts/setup"
import type {
  SkillBindingReceipt,
  SkillBindingRequest,
  SkillCatalogPageResponse,
  SkillCatalogQueryInput,
  SkillCreateReceipt,
  SkillCreateRequest,
  SkillDeleteReceipt,
  SkillDeleteRequest,
  SkillDetailResponse,
  SkillSourceValidationRequest,
  SkillSourceValidationResponse,
  SkillUpdateReceipt,
  SkillUpdateRequest,
} from "../../contracts/skills"
import type {
  YeonjangBindingReceipt,
  YeonjangBindingRequest,
  YeonjangBrowserActiveTabInfoPreDispatchPreview,
  YeonjangBrowserActiveTabInfoPublicReadinessSummary,
  YeonjangCapabilityDetail,
  YeonjangCapabilityItem,
  YeonjangCapabilityPage,
  YeonjangCapabilityQueryInput,
  YeonjangRecoveryReceipt,
  YeonjangRecoveryRequest,
} from "../../contracts/yeonjang"
import {
  parseYeonjangBrowserActiveTabInfoPreDispatchPreview,
  parseYeonjangBrowserActiveTabInfoPublicReadinessSummary,
} from "../../contracts/yeonjang"
import { buildUiRequestFailure, normalizeFetchFailure } from "../request-failure"
import type {
  ControlPlaneAdapter,
  MqttRuntimeResponse,
  ResetSetupResponse,
  SetupChecksResponse,
  SetupDraftSaveResponse,
  StatusResponse,
  TestBackendResponse,
  TestMcpServerResponse,
  TestSkillPathResponse,
  TestSlackResponse,
  TestTelegramResponse,
  YeonjangFleetResponse,
} from "./types"

const BASE = ""

function authHeaders(): Record<string, string> {
  const token =
    localStorage.getItem("knowbee_token") ??
    localStorage.getItem("wizby_token") ??
    localStorage.getItem("howie_token") ??
    ""
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(
  path: string,
  init?: RequestInit,
  acceptedErrorStatuses: readonly number[] = [],
): Promise<T> {
  const hasBody = init?.body !== undefined
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: {
        ...authHeaders(),
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      ...init,
    })
  } catch (cause) {
    throw normalizeFetchFailure(cause)
  }

  if (!response.ok && !acceptedErrorStatuses.includes(response.status)) {
    const bodyText = await response.text().catch(() => "")
    throw buildUiRequestFailure({
      status: response.status,
      statusText: response.statusText,
      bodyText,
    })
  }

  return response.json() as Promise<T>
}

export const localAdapter: ControlPlaneAdapter = {
  name: "local",
  getStatus: () => request<StatusResponse>("/api/status"),
  getCapabilities: () =>
    request<{ items: FeatureCapability[]; generatedAt: number }>("/api/capabilities"),
  getCapability: (key) => request<FeatureCapability>(`/api/capabilities/${key}`),
  getSkillCatalog: (query: SkillCatalogQueryInput, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (query.limit !== undefined) params.set("limit", String(query.limit))
    if (query.cursor) params.set("cursor", query.cursor)
    if (query.search) params.set("search", query.search)
    if (query.sourceKind) params.set("source", query.sourceKind)
    if (query.runtimeStatus) params.set("status", query.runtimeStatus)
    if (query.boundOnly) params.set("bound", "true")
    return request<SkillCatalogPageResponse>(
      `/api/capabilities/skills${params.size ? `?${params}` : ""}`,
      { signal },
    )
  },
  getSkillDetail: (skillRef: string, signal?: AbortSignal) =>
    request<SkillDetailResponse>(`/api/capabilities/skills/${encodeURIComponent(skillRef)}`, {
      signal,
    }),
  validateSkillSource: (input: SkillSourceValidationRequest, signal?: AbortSignal) =>
    request<SkillSourceValidationResponse>("/api/capabilities/skills/validate", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    }),
  createSkill: (input: SkillCreateRequest, signal?: AbortSignal) =>
    request<SkillCreateReceipt>(
      "/api/capabilities/skills",
      {
        method: "POST",
        body: JSON.stringify(input),
        signal,
      },
      [409, 422],
    ),
  updateSkill: (skillRef: string, input: SkillUpdateRequest, signal?: AbortSignal) =>
    request<SkillUpdateReceipt>(
      `/api/capabilities/skills/${encodeURIComponent(skillRef)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        signal,
      },
      [409, 422],
    ),
  updateSkillBinding: (
    skillRef: string,
    agentRef: string,
    input: SkillBindingRequest,
    signal?: AbortSignal,
  ) =>
    request<SkillBindingReceipt>(
      `/api/capabilities/skills/${encodeURIComponent(skillRef)}/bindings/${encodeURIComponent(agentRef)}`,
      { method: "PATCH", body: JSON.stringify(input), signal },
      [409, 422],
    ),
  deleteSkill: (skillRef: string, input: SkillDeleteRequest, signal?: AbortSignal) =>
    request<SkillDeleteReceipt>(
      `/api/capabilities/skills/${encodeURIComponent(skillRef)}`,
      { method: "DELETE", body: JSON.stringify(input), signal },
      [409, 422],
    ),
  getMcpCatalog: (query: McpCatalogQueryInput, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (query.limit !== undefined) params.set("limit", String(query.limit))
    if (query.cursor) params.set("cursor", query.cursor)
    if (query.search) params.set("search", query.search)
    if (query.transport) params.set("transport", query.transport)
    if (query.runtimeStatus) params.set("status", query.runtimeStatus)
    if (query.boundOnly) params.set("bound", "true")
    return request<McpCatalogPageResponse>(
      `/api/capabilities/mcp${params.size ? `?${params}` : ""}`,
      { signal },
    )
  },
  getMcpCatalogDetail: (mcpRef: string, signal?: AbortSignal) =>
    request<McpCatalogDetail>(`/api/capabilities/mcp/${encodeURIComponent(mcpRef)}`, { signal }),
  probeMcpDraft: (draft: McpConnectionDraft, signal?: AbortSignal) =>
    request<McpProbeReceipt>(
      "/api/capabilities/mcp/probe",
      { method: "POST", body: JSON.stringify({ draft }), signal },
      [408, 422],
    ),
  probeExistingMcp: (mcpRef: string, signal?: AbortSignal) =>
    request<McpProbeReceipt>(
      `/api/capabilities/mcp/${encodeURIComponent(mcpRef)}/probe`,
      { method: "POST", body: JSON.stringify({}), signal },
      [404, 408, 422],
    ),
  createMcp: (input: McpCreateRequest, signal?: AbortSignal) =>
    request<McpMutationReceipt>(
      "/api/capabilities/mcp",
      { method: "POST", body: JSON.stringify(input), signal },
      [403, 409, 422],
    ),
  updateMcp: (mcpRef: string, input: McpProtectedUpdateRequest, signal?: AbortSignal) =>
    request<McpMutationReceipt>(
      `/api/capabilities/mcp/${encodeURIComponent(mcpRef)}`,
      { method: "PATCH", body: JSON.stringify(input), signal },
      [403, 404, 409, 422],
    ),
  updateMcpBinding: (
    mcpRef: string,
    agentRef: string,
    input: McpBindingRequest,
    signal?: AbortSignal,
  ) =>
    request<McpBindingReceipt>(
      `/api/capabilities/mcp/${encodeURIComponent(mcpRef)}/bindings/${encodeURIComponent(agentRef)}`,
      { method: "PATCH", body: JSON.stringify(input), signal },
      [403, 404, 409, 422],
    ),
  updateMcpStatus: (mcpRef: string, input: McpStatusRequest, signal?: AbortSignal) =>
    request<McpLifecycleReceipt>(
      `/api/capabilities/mcp/${encodeURIComponent(mcpRef)}/status`,
      { method: "PATCH", body: JSON.stringify(input), signal },
      [403, 404, 409, 422],
    ),
  deleteMcp: (mcpRef: string, input: McpDeleteRequest, signal?: AbortSignal) =>
    request<McpLifecycleReceipt>(
      `/api/capabilities/mcp/${encodeURIComponent(mcpRef)}`,
      { method: "DELETE", body: JSON.stringify(input), signal },
      [403, 404, 409, 422],
    ),
  recoverMcp: (mcpRef: string, input: McpRecoveryRequest, signal?: AbortSignal) =>
    request<McpRecoveryReceipt>(
      `/api/capabilities/mcp/${encodeURIComponent(mcpRef)}/recover`,
      { method: "POST", body: JSON.stringify(input), signal },
      [403, 404, 409, 422],
    ),
  getSetupStatus: () => request<SetupState>("/api/setup/status"),
  getSetupChecks: () => request<SetupChecksResponse>("/api/setup/checks"),
  getSetupDraft: () => request<SetupDraft>("/api/setup/draft"),
  saveSetupDraft: (payload) =>
    request<SetupDraftSaveResponse>("/api/setup/draft", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  resetSetup: () => request<ResetSetupResponse>("/api/setup/reset", { method: "POST" }),
  completeSetup: () => request<SetupState>("/api/setup/complete", { method: "POST" }),
  testBackend: (
    endpoint: string,
    providerType: AIProviderType,
    credentials: AIBackendCredentials,
    authMode?: AIAuthMode,
  ) =>
    request<TestBackendResponse>("/api/setup/test-backend", {
      method: "POST",
      body: JSON.stringify({ endpoint, providerType, credentials, authMode }),
    }),
  testTelegram: (botToken) =>
    request<TestTelegramResponse>("/api/setup/test-telegram", {
      method: "POST",
      body: JSON.stringify({ botToken }),
    }),
  testSlack: (botToken, appToken) =>
    request<TestSlackResponse>("/api/setup/test-slack", {
      method: "POST",
      body: JSON.stringify({ botToken, appToken }),
    }),
  testMcpServer: (server: SetupMcpServerDraft) =>
    request<TestMcpServerResponse>("/api/setup/test-mcp-server", {
      method: "POST",
      body: JSON.stringify({ server }),
    }),
  testSkillPath: (path: string) =>
    request<TestSkillPathResponse>("/api/setup/test-skill-path", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  generateAuthToken: () =>
    request<{ token: string }>("/api/setup/generate-auth-token", { method: "POST" }),
  getMcpServers: () => request<McpServersResponse>("/api/mcp/servers"),
  reloadMcpServers: () => request<McpServersResponse>("/api/mcp/reload", { method: "POST" }),
  getMqttRuntime: () => request<MqttRuntimeResponse>("/api/settings/mqtt/runtime"),
  getYeonjangFleet: () => request<YeonjangFleetResponse>("/api/yeonjang/instances"),
  getYeonjangBrowserActiveTabInfoReadiness: async (signal?: AbortSignal) =>
    parseYeonjangBrowserActiveTabInfoPublicReadinessSummary(
      await request<unknown>("/api/yeonjang/browser-active-tab-info/readiness", { signal }),
      "general",
    ) as YeonjangBrowserActiveTabInfoPublicReadinessSummary,
  getYeonjangBrowserActiveTabInfoDiagnostics: async (signal?: AbortSignal) =>
    parseYeonjangBrowserActiveTabInfoPublicReadinessSummary(
      await request<unknown>("/api/yeonjang/browser-active-tab-info/readiness/diagnostics", {
        signal,
      }),
      "advanced",
    ) as YeonjangBrowserActiveTabInfoPublicReadinessSummary,
  previewYeonjangBrowserActiveTabInfoPreDispatch: async (input: unknown, signal?: AbortSignal) =>
    parseYeonjangBrowserActiveTabInfoPreDispatchPreview(
      await request<unknown>("/api/yeonjang/browser-active-tab-info/pre-dispatch/preview", {
        method: "POST",
        body: JSON.stringify(input),
        signal,
      }),
    ) as YeonjangBrowserActiveTabInfoPreDispatchPreview,
  getYeonjangCapabilities: (query: YeonjangCapabilityQueryInput, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (query.limit !== undefined) params.set("limit", String(query.limit))
    if (query.cursor) params.set("cursor", query.cursor)
    if (query.search) params.set("search", query.search)
    if (query.location) params.set("location", query.location)
    if (query.platform) params.set("platform", query.platform)
    if (query.status) params.set("status", query.status)
    return request<YeonjangCapabilityPage>(
      `/api/capabilities/yeonjang${params.size ? `?${params}` : ""}`,
      { signal },
    )
  },
  getYeonjangCapabilityDetail: (yeonjangRef: string, signal?: AbortSignal) =>
    request<YeonjangCapabilityDetail>(
      `/api/capabilities/yeonjang/${encodeURIComponent(yeonjangRef)}`,
      { signal },
    ),
  recoverYeonjang: (yeonjangRef: string, input: YeonjangRecoveryRequest, signal?: AbortSignal) =>
    request<YeonjangRecoveryReceipt>(
      `/api/capabilities/yeonjang/${encodeURIComponent(yeonjangRef)}/recovery`,
      { method: "POST", body: JSON.stringify(input), signal },
      [409, 422],
    ),
  updateYeonjangBinding: (
    yeonjangRef: string,
    agentRef: string,
    input: YeonjangBindingRequest,
    signal?: AbortSignal,
  ) =>
    request<YeonjangBindingReceipt>(
      `/api/capabilities/yeonjang/${encodeURIComponent(yeonjangRef)}/bindings/${encodeURIComponent(agentRef)}`,
      { method: "PATCH", body: JSON.stringify(input), signal },
      [409, 422],
    ),
  approveYeonjangPairing: (instanceId, payload) =>
    request<YeonjangFleetResponse>(
      `/api/yeonjang/instances/${encodeURIComponent(instanceId)}/pairing/approve`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  updateYeonjangTrust: (instanceId, payload) =>
    request<YeonjangFleetResponse>(
      `/api/yeonjang/instances/${encodeURIComponent(instanceId)}/trust`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  renameYeonjangInstance: (instanceId, payload) =>
    request<YeonjangFleetResponse>(
      `/api/yeonjang/instances/${encodeURIComponent(instanceId)}/rename`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  assignYeonjangLocalMarker: (instanceId, payload) =>
    request<YeonjangFleetResponse>(
      `/api/yeonjang/instances/${encodeURIComponent(instanceId)}/local-marker`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  disconnectMqttExtension: (extensionId: string) =>
    request<{ ok: boolean; message: string }>(
      `/api/settings/mqtt/extensions/${encodeURIComponent(extensionId)}/disconnect`,
      { method: "POST" },
    ),
}
