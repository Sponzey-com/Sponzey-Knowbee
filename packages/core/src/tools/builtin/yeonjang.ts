import { createHash } from "node:crypto"
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { AgentTool, ArtifactDeliveryResultDetails, ToolContext, ToolResult, ToolSideEffectObservation } from "../types.js"
import { invokeYeonjangMethod, DEFAULT_YEONJANG_EXTENSION_ID } from "../../yeonjang/mqtt-client.js"
import {
  hashYeonjangBrowserFocusExecutionTarget,
} from "../../capabilities/yeonjang-browser-focus-execution-admission-issuer.js"
import {
  buildYeonjangBrowserFocusCommandContract,
  evaluateYeonjangBrowserFocusPostCheck,
  evaluateYeonjangBrowserFocusPreflight,
  evaluateYeonjangBrowserFocusToolAdmission,
  projectYeonjangBrowserFocusTarget,
  type YeonjangBrowserFocusTargetProjection,
} from "../../capabilities/yeonjang-browser-focus-contract.js"
import {
  buildYeonjangTargetParameterProperties,
  buildYeonjangTargetResolutionDetails,
  buildYeonjangTargetSelectionFailure,
  recordYeonjangRemoteExecutionApproval,
  revalidateYeonjangTargetSelection,
  resolveYeonjangTargetSelection,
  type YeonjangTargetedToolParams,
} from "./yeonjang-target.js"
import { withYeonjangRequestMetadata } from "./yeonjang-request-metadata.js"
import { toolUserFacingErrorMessage } from "./error-redaction.js"
import { buildYeonjangEvidenceFromMapping, type YeonjangEvidenceEnvelope } from "../../yeonjang/evidence.js"
import { YEONJANG_TOOL_MAPPINGS, type YeonjangToolMapping } from "../../yeonjang/tool-mapping.js"
import { createYeonjangBrowserFocusSideEffect } from "./yeonjang-browser-focus-side-effect.js"
import { recordArtifactMetadata } from "../../artifacts/lifecycle.js"

interface YeonjangCameraDevice {
  id: string
  name: string
  position?: string
  available: boolean
}

const yeonjangToolMappingByName = new Map<string, YeonjangToolMapping>(
  YEONJANG_TOOL_MAPPINGS.map((mapping) => [mapping.toolName, mapping]),
)

function yeonjangMapping(toolName: string) {
  const mapping = yeonjangToolMappingByName.get(toolName)
  if (!mapping) throw new Error(`missing Yeonjang tool mapping: ${toolName}`)
  return mapping
}

function hashUtf8(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`
}

function yeonjangFileTargetRef(params: YeonjangTargetedToolParams & { path: string }): string {
  const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID
  const sessionRef = params.targetSessionId?.trim()
  return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:file:${params.path}`
}

function readResultPostCheck(result: ToolResult): {
  verified?: boolean
  exists?: boolean
  bytes?: number
  reason?: string
} | undefined {
  if (!result.details || typeof result.details !== "object" || Array.isArray(result.details)) {
    return undefined
  }
  const file = (result.details as Record<string, unknown>).file
  if (!file || typeof file !== "object" || Array.isArray(file)) return undefined
  const postCheck = (file as Record<string, unknown>).postCheck
  if (!postCheck || typeof postCheck !== "object" || Array.isArray(postCheck)) return undefined
  return postCheck as {
    verified?: boolean
    exists?: boolean
    bytes?: number
    reason?: string
  }
}

function observeYeonjangFilePostCheck(
  params: YeonjangTargetedToolParams & { path: string },
  expectedState: unknown,
  result: ToolResult,
): ToolSideEffectObservation {
  const postCheck = readResultPostCheck(result)
  const observedState =
    postCheck?.verified === true && hasBytesExpectation(expectedState)
      ? {
          exists: postCheck.exists === true,
          ...(typeof postCheck.bytes === "number" ? { bytes: postCheck.bytes } : {}),
        }
      : postCheck?.verified === true
        ? expectedState
        : { reason: postCheck?.reason ?? "post_check_missing" }
  return {
    available: postCheck?.verified === true,
    targetRef: yeonjangFileTargetRef(params),
    expectedState,
    observedState,
  }
}

function hasBytesExpectation(value: unknown): value is { exists: boolean; bytes: number } {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { bytes?: unknown }).bytes === "number"
  )
}

function yeonjangClipboardTargetRef(params: YeonjangTargetedToolParams): string {
  const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID
  const sessionRef = params.targetSessionId?.trim()
  return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:clipboard`
}

function yeonjangBrowserTargetRef(params: YeonjangTargetedToolParams): string {
  const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID
  const sessionRef = params.targetSessionId?.trim()
  return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:browser`
}

function browserOpenUrlExpectedState(url: string): {
  urlHash: `sha256:${string}`
  urlLength: number
  expectedAction: "open_url"
} {
  const normalized = url.trim()
  return {
    urlHash: hashUtf8(normalized),
    urlLength: normalized.length,
    expectedAction: "open_url",
  }
}

function observeYeonjangBrowserOpenUrl(
  params: YeonjangBrowserOpenUrlParams,
  result: ToolResult,
): ToolSideEffectObservation {
  const expectedState = browserOpenUrlExpectedState(params.url)
  const details = result.details && typeof result.details === "object" && !Array.isArray(result.details)
    ? result.details as Record<string, unknown>
    : {}
  const browser = details.browser && typeof details.browser === "object" && !Array.isArray(details.browser)
    ? details.browser as Record<string, unknown>
    : {}
  return {
    available: browser.postCheckReason === "llm_goal_validation_required",
    targetRef: yeonjangBrowserTargetRef(params),
    expectedState,
    observedState: {
      opened: browser.opened === true,
      urlScheme: typeof browser.urlScheme === "string" ? browser.urlScheme : "unknown",
      postCheckReason: typeof browser.postCheckReason === "string"
        ? browser.postCheckReason
        : "llm_goal_validation_required",
    },
  }
}

function clipboardWriteExpectedState(text: string): { contentHash: `sha256:${string}`; bytes: number } {
  return {
    contentHash: hashUtf8(text),
    bytes: Buffer.byteLength(text, "utf8"),
  }
}

function readClipboardWritePostCheck(result: ToolResult): {
  verified?: boolean
  byteLength?: number
  contentHash?: string
  reason?: string
} | undefined {
  if (!result.details || typeof result.details !== "object" || Array.isArray(result.details)) {
    return undefined
  }
  const clipboard = (result.details as Record<string, unknown>).clipboard
  if (!clipboard || typeof clipboard !== "object" || Array.isArray(clipboard)) return undefined
  const postCheck = (clipboard as Record<string, unknown>).postCheck
  if (!postCheck || typeof postCheck !== "object" || Array.isArray(postCheck)) return undefined
  return postCheck as {
    verified?: boolean
    byteLength?: number
    contentHash?: string
    reason?: string
  }
}

function observeYeonjangClipboardWrite(
  params: YeonjangClipboardWriteParams,
  result: ToolResult,
): ToolSideEffectObservation {
  const expectedState = clipboardWriteExpectedState(params.text)
  const postCheck = readClipboardWritePostCheck(result)
  const observedState =
    postCheck?.verified === true
      ? {
          contentHash: postCheck.contentHash ?? "",
          bytes: postCheck.byteLength ?? 0,
        }
      : { reason: postCheck?.reason ?? "post_check_missing" }
  return {
    available: postCheck?.verified === true,
    targetRef: yeonjangClipboardTargetRef(params),
    expectedState,
    observedState,
  }
}

function yeonjangCameraTargetRef(params: YeonjangCameraCaptureParams): string {
  const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID
  const sessionRef = params.targetSessionId?.trim()
  const deviceRef = params.deviceId?.trim() || "default"
  return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:camera:${deviceRef}`
}

function cameraExpectedState(params: YeonjangCameraCaptureParams): {
  artifact: "local_saved"
  deviceId: string
  minBytes: number
} {
  return {
    artifact: "local_saved",
    deviceId: params.deviceId?.trim() || "default",
    minBytes: 1,
  }
}

function observeYeonjangCameraCapture(
  params: YeonjangCameraCaptureParams,
  result: ToolResult,
): ToolSideEffectObservation {
  const expectedState = cameraExpectedState(params)
  const details = result.details && typeof result.details === "object" && !Array.isArray(result.details)
    ? result.details as Record<string, unknown>
    : {}
  const localFileSize = typeof details.localFileSize === "number" ? details.localFileSize : 0
  const observedState = result.success && localFileSize >= expectedState.minBytes
    ? {
        artifact: "local_saved",
        deviceId: typeof details.deviceId === "string" ? details.deviceId : expectedState.deviceId,
        minBytes: expectedState.minBytes,
      }
    : { reason: "camera_artifact_missing_or_empty" }
  return {
    available: result.success === true && localFileSize >= expectedState.minBytes,
    targetRef: yeonjangCameraTargetRef(params),
    expectedState,
    observedState,
  }
}

type RequestedCameraFacing = "front" | "rear"

interface YeonjangCameraCaptureResult {
  device_id?: string
  output_path?: string
  file_name?: string
  file_extension?: string
  mime_type?: string
  size_bytes?: number
  transfer_encoding?: string
  base64_data?: string
  message: string
}

const SUPPORTED_CAMERA_ARTIFACT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

type CameraBinaryValidation =
  | {
      ok: true
      bytes: Buffer
      mimeType: string
    }
  | {
      ok: false
      errorCode:
        | "CAMERA_ARTIFACT_BYTES_MISSING"
        | "CAMERA_ARTIFACT_ENCODING_INVALID"
        | "CAMERA_ARTIFACT_MIME_INVALID"
        | "CAMERA_ARTIFACT_EMPTY"
      reasonCode:
        | "camera_artifact_bytes_missing"
        | "camera_artifact_encoding_invalid"
        | "camera_artifact_mime_invalid"
        | "camera_artifact_empty"
      message: string
    }

function validateYeonjangBinaryCaptureResult(
  result: YeonjangCameraCaptureResult,
): CameraBinaryValidation {
  if (!result.base64_data) {
    return {
      ok: false,
      errorCode: "CAMERA_ARTIFACT_BYTES_MISSING",
      reasonCode: "camera_artifact_bytes_missing",
      message: "연장 camera.capture 응답에 이미지 데이터가 없습니다.",
    }
  }
  if (result.transfer_encoding && result.transfer_encoding !== "base64") {
    return {
      ok: false,
      errorCode: "CAMERA_ARTIFACT_ENCODING_INVALID",
      reasonCode: "camera_artifact_encoding_invalid",
      message: "연장 camera.capture 응답의 이미지 전달 형식이 올바르지 않습니다.",
    }
  }
  const mimeType = result.mime_type?.trim().toLowerCase() ?? ""
  if (!SUPPORTED_CAMERA_ARTIFACT_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      errorCode: "CAMERA_ARTIFACT_MIME_INVALID",
      reasonCode: "camera_artifact_mime_invalid",
      message: "연장 camera.capture 응답의 이미지 MIME 유형을 검증할 수 없습니다.",
    }
  }
  const bytes = Buffer.from(result.base64_data, "base64")
  if (bytes.length === 0) {
    return {
      ok: false,
      errorCode: "CAMERA_ARTIFACT_EMPTY",
      reasonCode: "camera_artifact_empty",
      message: "연장 camera.capture 응답의 이미지가 비어 있습니다.",
    }
  }
  return { ok: true, bytes, mimeType }
}

interface YeonjangCameraListParams extends YeonjangTargetedToolParams {
  timeoutSec?: number
}

interface YeonjangCameraPermissionStatusParams extends YeonjangTargetedToolParams {
  timeoutSec?: number
}

interface YeonjangCameraPermissionStatusResult {
  status: string
  reason: string
  platform: string
  canAttemptCapture: boolean
  requiresUserAction: boolean
}

interface YeonjangCameraCaptureDetails {
  via: "yeonjang"
  extensionId: string
  deviceId?: string
  deviceName?: string
  requestedFacing?: RequestedCameraFacing
  constraint?: "camera_facing_selection_unsupported"
  fileName?: string
  fileExtension?: string
  mimeType?: string
  sizeBytes?: number
  transferEncoding: "base64"
  localFileSize?: number
  artifactVerification?: {
    status: "verified"
    artifactRef: string
    mimeType: string
    sizeBytes: number
  }
  evidence?: YeonjangEvidenceEnvelope
  kind?: "artifact_delivery"
  channel?: "webui"
  filePath?: string
  size?: number
  source?: ToolContext["source"]
}

interface YeonjangCameraCaptureParams extends YeonjangTargetedToolParams {
  deviceId?: string
  outputPath?: string
  inlineBase64?: boolean
  timeoutSec?: number
}

interface YeonjangFilePathParams extends YeonjangTargetedToolParams {
  path: string
  timeoutSec?: number
}

interface YeonjangFileReadParams extends YeonjangFilePathParams {
  maxBytes?: number
}

interface YeonjangFileSearchParams extends YeonjangFilePathParams {
  query: string
  maxResults?: number
  maxPreviewChars?: number
  maxBytesPerFile?: number
}

interface YeonjangFileWriteParams extends YeonjangFilePathParams {
  text: string
  overwrite?: boolean
}

interface YeonjangFilePatchParams extends YeonjangFilePathParams {
  expectedText: string
  replacementText: string
  maxBytes?: number
}

interface YeonjangFileMetadataResult {
  path: string
  kind: string
  bytes?: number
  readonly?: boolean
  modifiedAt?: string
}

interface YeonjangFileListEntry {
  name: string
  kind: string
  bytes?: number
  readonly?: boolean
  modifiedAt?: string
}

interface YeonjangFileListResult {
  path: string
  entries: YeonjangFileListEntry[]
}

interface YeonjangFileReadResult {
  path: string
  encoding: "utf8"
  text: string
  bytesRead: number
  totalBytes: number
  truncated: boolean
}

interface YeonjangFileSearchMatch {
  path: string
  lineNumber: number
  byteOffset: number
  preview: string
  truncated: boolean
}

interface YeonjangFileSearchResult {
  path: string
  query: string
  matches: YeonjangFileSearchMatch[]
  resultCount: number
  skippedFiles: number
  truncated: boolean
}

interface YeonjangFilePostCheck {
  verified: boolean
  exists: boolean
  bytes?: number
}

interface YeonjangFileWriteResult {
  path: string
  bytesWritten: number
  overwrite: boolean
  postCheck: YeonjangFilePostCheck
}

interface YeonjangFilePatchResult {
  path: string
  changed: boolean
  reason: string
  matchCount: number
  bytesBefore: number
  bytesAfter: number
  postCheck: YeonjangFilePostCheck
}

interface YeonjangFileDeleteResult {
  path: string
  deleted: boolean
  kind: string
  postCheck: YeonjangFilePostCheck
}

interface YeonjangDiskPathParams extends YeonjangTargetedToolParams {
  path: string
  timeoutSec?: number
}

interface YeonjangDiskInfoResult {
  path: string
  exists: boolean
  kind?: string
  readonly?: boolean
  totalBytes?: number
  freeBytes?: number
  availableBytes?: number
}

interface YeonjangDiskUsageResult {
  path: string
  totalBytes: number
  freeBytes: number
  availableBytes: number
}

interface YeonjangDiskExistsResult {
  path: string
  exists: boolean
  kind?: string
  readonly?: boolean
}

interface YeonjangProcessListParams extends YeonjangTargetedToolParams {
  limit?: number
  nameContains?: string
  timeoutSec?: number
}

interface YeonjangProcessInfoParams extends YeonjangTargetedToolParams {
  pid: number
  timeoutSec?: number
}

interface YeonjangProcessEntry {
  pid: number
  name: string
  status: string
  memoryBytes?: number
  virtualMemoryBytes?: number
  cpuUsage?: number
  startedAt?: number
}

interface YeonjangProcessListResult {
  processes: YeonjangProcessEntry[]
  count: number
  totalCount: number
  truncated: boolean
  limit: number
}

interface YeonjangProcessInfoResult {
  process: YeonjangProcessEntry
}

interface YeonjangBrowserListParams extends YeonjangTargetedToolParams {
  limit?: number
  timeoutSec?: number
}

interface YeonjangBrowserActiveHintParams extends YeonjangTargetedToolParams {
  timeoutSec?: number
}

interface YeonjangBrowserOpenUrlParams extends YeonjangTargetedToolParams {
  url: string
  timeoutSec?: number
}

type YeonjangBrowserFocusPlatform = "macos" | "windows" | "linux" | "unknown"

interface YeonjangBrowserFocusPreDispatchParam {
  schemaVersion?: string
  method?: string
  toolName?: string
  platform?: YeonjangBrowserFocusPlatform
  status?: string
  reasonCode?: string
  invokeNow?: boolean
}

interface YeonjangBrowserFocusParams extends YeonjangTargetedToolParams {
  targetAlias?: string
  processName?: string
  title?: string
  url?: string
  timeoutSec?: number
}

interface YeonjangBrowserCandidate {
  pid: number
  appName: string
  browser: string
  running: boolean
  confidence: string
  detectedBy: string
  status?: string
}

interface YeonjangBrowserListResult {
  browsers: YeonjangBrowserCandidate[]
  count: number
  totalCount: number
  truncated: boolean
  limit: number
}

interface YeonjangBrowserActiveHintResult {
  activeBrowser?: YeonjangBrowserCandidate | null
  available: boolean
  reason: string
}

interface YeonjangBrowserOpenUrlResult {
  urlScheme: string
  opened: boolean
  postCheck: {
    verified: boolean
    reason: string
  }
  message: string
}

interface YeonjangBrowserFocusResult {
  status?: string
  reasonCode?: string
  invokeNow?: boolean
  commandAccepted?: boolean
  observedFocusedTarget?: unknown
  message?: string
}

interface YeonjangClipboardReadParams extends YeonjangTargetedToolParams {
  timeoutSec?: number
}

interface YeonjangClipboardReadResult {
  text: string
  charCount: number
  byteLength: number
  empty: boolean
  contentHash: string
}

interface YeonjangClipboardWriteParams extends YeonjangTargetedToolParams {
  text: string
  timeoutSec?: number
}

interface YeonjangClipboardWritePostCheck {
  verified: boolean
  charCount?: number
  byteLength?: number
  empty?: boolean
  contentHash?: string
  reason?: string
}

interface YeonjangClipboardWriteResult {
  charCount: number
  byteLength: number
  empty: boolean
  contentHash: string
  postCheck: YeonjangClipboardWritePostCheck
}

interface YeonjangNetworkStatusParams extends YeonjangTargetedToolParams {
  timeoutSec?: number
}

interface YeonjangNetworkInterfaceStatus {
  name: string
  receivedBytes: number
  transmittedBytes: number
  totalReceivedBytes: number
  totalTransmittedBytes: number
}

interface YeonjangNetworkStatusResult {
  interfaces: YeonjangNetworkInterfaceStatus[]
  interfaceCount: number
  externalProbe: boolean
}

interface YeonjangDeviceStatusParams extends YeonjangTargetedToolParams {
  timeoutSec?: number
}

interface YeonjangDeviceStatusResult {
  platform: string
  resources: Record<string, Record<string, boolean | number | string | null>>
}

const CAMERA_CAPTURE_INTENT_PATTERNS = [
  /\b(capture|photo|picture|snapshot|shot|take a photo|take photo)\b/i,
  /(?:사진|찍어|촬영|캡처|스냅샷)/u,
]

const FRONT_CAMERA_PATTERNS = [
  /\b(front camera|front-facing|selfie)\b/i,
  /(?:전면|셀카)/u,
]

const REAR_CAMERA_PATTERNS = [
  /\b(rear camera|back camera|rear-facing|back-facing)\b/i,
  /(?:후면|뒷면)/u,
]

function wantsCameraInventoryOnly(userMessage: string): boolean {
  const normalized = userMessage.trim()
  if (!normalized) return false
  if (CAMERA_CAPTURE_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false
  }
  return /\b(camera|cameras|device|devices|list|count|what cameras)\b/i.test(normalized)
    || /(?:카메라|장치|목록|몇\s*개|뭐뭐|무엇)/u.test(normalized)
}

function resolveRequestedCameraFacing(userMessage: string): RequestedCameraFacing | null {
  if (FRONT_CAMERA_PATTERNS.some((pattern) => pattern.test(userMessage))) return "front"
  if (REAR_CAMERA_PATTERNS.some((pattern) => pattern.test(userMessage))) return "rear"
  return null
}

function isContinuityCameraDevice(device: YeonjangCameraDevice): boolean {
  return /\biphone\b/i.test(device.name)
}

function findCameraDeviceById(devices: YeonjangCameraDevice[], deviceId?: string): YeonjangCameraDevice | null {
  if (!deviceId) return null
  return devices.find((device) => device.id === deviceId) ?? null
}

function buildCameraFacingUnsupportedMessage(params: {
  deviceName: string
  facing: RequestedCameraFacing
}): string {
  const facingLabel = params.facing === "front" ? "전면" : "후면"
  return [
    `선택한 카메라 "${params.deviceName}" 에서는 ${facingLabel} 카메라를 Knowbee/Yeonjang에서 강제로 선택할 수 없습니다.`,
    "iPhone 연속성 카메라는 현재 렌즈(전면/후면) 전환 제어를 노출하지 않습니다.",
    `iPhone에서 ${facingLabel} 카메라로 직접 전환한 뒤 다시 촬영하거나, 다른 카메라를 선택해 주세요.`,
  ].join("\n")
}


function resolveTimeoutMs(timeoutSec?: number): number | undefined {
  if (!Number.isFinite(timeoutSec)) return undefined
  return Math.max(1, Math.min(60, Math.floor(timeoutSec!))) * 1000
}

const DEFAULT_CAMERA_CAPTURE_TIMEOUT_MS = 70_000

function formatCameraList(extensionId: string, devices: YeonjangCameraDevice[]): string {
  if (devices.length === 0) {
    return `연장 "${extensionId}" 에서 사용 가능한 카메라를 찾지 못했습니다.`
  }

  const lines = devices.map((device) => {
    const parts = [device.name]
    if (device.position) parts.push(device.position)
    parts.push(device.available ? "사용 가능" : "사용 불가")
    return `- ${parts.join(" · ")} (${device.id})`
  })

  return `연장 "${extensionId}" 카메라 ${devices.length}개:\n${lines.join("\n")}`
}

function formatCameraPermissionStatusOutput(
  extensionId: string,
  result: YeonjangCameraPermissionStatusResult,
): string {
  return [
    `연장 "${extensionId}" 카메라 권한 상태: ${result.status}`,
    `reason=${result.reason}`,
    `platform=${result.platform}`,
    `캡처 시도 가능: ${result.canAttemptCapture ? "예" : "아니오"}`,
    `사용자 조치 필요: ${result.requiresUserAction ? "예" : "아니오"}`,
  ].join("\n")
}

function formatCaptureOutput(extensionId: string, result: YeonjangCameraCaptureResult): string {
  const lines = [`연장 "${extensionId}" 카메라 캡처 완료.`]
  if (result.device_id) lines.push(`장치: ${result.device_id}`)
  if (result.file_name) lines.push(`파일명: ${result.file_name}`)
  if (result.file_extension) lines.push(`확장자: ${result.file_extension}`)
  if (result.mime_type) lines.push(`유형: ${result.mime_type}`)
  if (typeof result.size_bytes === "number") lines.push(`크기: ${result.size_bytes} bytes`)
  if (result.transfer_encoding) lines.push(`전달 형식: ${result.transfer_encoding}`)
  if (result.base64_data) {
    lines.push(`인라인 이미지: ${Math.round(result.base64_data.length / 1024)}KB base64`)
  }
  if (result.message) lines.push(result.message)
  return lines.join("\n")
}

function formatFileMetadataOutput(extensionId: string, result: YeonjangFileMetadataResult): string {
  const lines = [`연장 "${extensionId}" 파일 정보:`]
  lines.push(`경로: ${result.path}`)
  lines.push(`유형: ${result.kind}`)
  if (typeof result.bytes === "number") lines.push(`크기: ${result.bytes} bytes`)
  if (typeof result.readonly === "boolean") lines.push(`읽기 전용: ${result.readonly ? "예" : "아니오"}`)
  if (result.modifiedAt) lines.push(`수정 시각: ${result.modifiedAt}`)
  return lines.join("\n")
}

function formatFileListOutput(extensionId: string, result: YeonjangFileListResult): string {
  if (result.entries.length === 0) {
    return `연장 "${extensionId}" 경로에 표시할 항목이 없습니다.\n경로: ${result.path}`
  }
  const lines = [`연장 "${extensionId}" 파일 목록: ${result.path}`]
  for (const entry of result.entries) {
    const parts = [entry.kind]
    if (typeof entry.bytes === "number") parts.push(`${entry.bytes} bytes`)
    if (entry.modifiedAt) parts.push(entry.modifiedAt)
    lines.push(`- ${entry.name} (${parts.join(" · ")})`)
  }
  return lines.join("\n")
}

function formatFileReadOutput(extensionId: string, result: YeonjangFileReadResult): string {
  const header = [
    `연장 "${extensionId}" 파일 읽기 완료.`,
    `경로: ${result.path}`,
    `읽은 크기: ${result.bytesRead}/${result.totalBytes} bytes${result.truncated ? " (잘림)" : ""}`,
    "내용:",
  ].join("\n")
  return `${header}\n${result.text}`
}

function formatFileSearchOutput(extensionId: string, result: YeonjangFileSearchResult): string {
  const lines = [`연장 "${extensionId}" 파일 검색: ${result.resultCount}개 일치`]
  lines.push(`경로: ${result.path}`)
  lines.push(`검색어: ${result.query}`)
  for (const match of result.matches.slice(0, 20)) {
    lines.push(`- ${match.path}:${match.lineNumber} ${match.preview}`)
  }
  if (result.skippedFiles > 0) lines.push(`건너뛴 파일: ${result.skippedFiles}개`)
  if (result.truncated || result.matches.length > 20) lines.push("검색 결과가 제한되었습니다.")
  return lines.join("\n")
}

function formatFileWriteOutput(extensionId: string, result: YeonjangFileWriteResult): string {
  return [
    `연장 "${extensionId}" 파일 쓰기 완료.`,
    `경로: ${result.path}`,
    `쓴 크기: ${result.bytesWritten} bytes`,
    `덮어쓰기: ${result.overwrite ? "예" : "아니오"}`,
    `사후검증: ${result.postCheck.verified ? "성공" : "실패"}`,
  ].join("\n")
}

function formatFilePatchOutput(extensionId: string, result: YeonjangFilePatchResult): string {
  return [
    `연장 "${extensionId}" 파일 패치 결과.`,
    `경로: ${result.path}`,
    `변경됨: ${result.changed ? "예" : "아니오"}`,
    `reason=${result.reason}`,
    `매칭 수: ${result.matchCount}`,
    `크기: ${result.bytesBefore} -> ${result.bytesAfter} bytes`,
    `사후검증: ${result.postCheck.verified ? "성공" : "실패"}`,
  ].join("\n")
}

function formatFileDeleteOutput(extensionId: string, result: YeonjangFileDeleteResult): string {
  return [
    `연장 "${extensionId}" 파일 삭제 완료.`,
    `경로: ${result.path}`,
    `유형: ${result.kind}`,
    `삭제됨: ${result.deleted ? "예" : "아니오"}`,
    `사후검증: ${result.postCheck.verified ? "성공" : "실패"}`,
  ].join("\n")
}

function formatDiskInfoOutput(extensionId: string, result: YeonjangDiskInfoResult): string {
  const lines = [`연장 "${extensionId}" 디스크 정보:`]
  lines.push(`경로: ${result.path}`)
  lines.push(`존재: ${result.exists ? "예" : "아니오"}`)
  if (result.kind) lines.push(`유형: ${result.kind}`)
  if (typeof result.readonly === "boolean") lines.push(`읽기 전용: ${result.readonly ? "예" : "아니오"}`)
  if (typeof result.totalBytes === "number") lines.push(`전체: ${result.totalBytes} bytes`)
  if (typeof result.freeBytes === "number") lines.push(`여유: ${result.freeBytes} bytes`)
  if (typeof result.availableBytes === "number") lines.push(`사용 가능: ${result.availableBytes} bytes`)
  return lines.join("\n")
}

function formatDiskUsageOutput(extensionId: string, result: YeonjangDiskUsageResult): string {
  return [
    `연장 "${extensionId}" 디스크 사용량:`,
    `경로: ${result.path}`,
    `전체: ${result.totalBytes} bytes`,
    `여유: ${result.freeBytes} bytes`,
    `사용 가능: ${result.availableBytes} bytes`,
  ].join("\n")
}

function formatDiskExistsOutput(extensionId: string, result: YeonjangDiskExistsResult): string {
  const lines = [`연장 "${extensionId}" 경로 존재 확인:`]
  lines.push(`경로: ${result.path}`)
  lines.push(`존재: ${result.exists ? "예" : "아니오"}`)
  if (result.kind) lines.push(`유형: ${result.kind}`)
  if (typeof result.readonly === "boolean") lines.push(`읽기 전용: ${result.readonly ? "예" : "아니오"}`)
  return lines.join("\n")
}

function formatProcessEntry(entry: YeonjangProcessEntry): string {
  const parts = [`pid=${entry.pid}`, entry.status]
  if (typeof entry.memoryBytes === "number") parts.push(`${entry.memoryBytes} bytes`)
  if (typeof entry.cpuUsage === "number") parts.push(`${entry.cpuUsage.toFixed(1)}% cpu`)
  return `${entry.name} (${parts.join(" · ")})`
}

function formatProcessListOutput(extensionId: string, result: YeonjangProcessListResult): string {
  const lines = [`연장 "${extensionId}" 프로세스 목록: ${result.count}/${result.totalCount}개`]
  for (const entry of result.processes) {
    lines.push(`- ${formatProcessEntry(entry)}`)
  }
  if (result.truncated) lines.push(`목록이 ${result.limit}개로 제한되었습니다.`)
  return lines.join("\n")
}

function formatProcessInfoOutput(extensionId: string, result: YeonjangProcessInfoResult): string {
  return [
    `연장 "${extensionId}" 프로세스 정보:`,
    formatProcessEntry(result.process),
    ...(typeof result.process.startedAt === "number" ? [`시작 시각: ${result.process.startedAt}`] : []),
  ].join("\n")
}

function formatBrowserCandidate(entry: YeonjangBrowserCandidate): string {
  const parts = [`pid=${entry.pid}`, entry.running ? "running" : "not running", entry.confidence]
  if (entry.status) parts.push(entry.status)
  return `${entry.browser} · ${entry.appName} (${parts.join(" · ")})`
}

function formatBrowserListOutput(extensionId: string, result: YeonjangBrowserListResult): string {
  if (result.browsers.length === 0) {
    return `연장 "${extensionId}" 에서 실행 중인 브라우저 후보를 찾지 못했습니다.`
  }
  const lines = [`연장 "${extensionId}" 브라우저 후보: ${result.count}/${result.totalCount}개`]
  for (const entry of result.browsers) {
    lines.push(`- ${formatBrowserCandidate(entry)}`)
  }
  if (result.truncated) lines.push(`목록이 ${result.limit}개로 제한되었습니다.`)
  return lines.join("\n")
}

function formatBrowserActiveHintOutput(extensionId: string, result: YeonjangBrowserActiveHintResult): string {
  if (!result.available || !result.activeBrowser) {
    return `연장 "${extensionId}" 에서 활성 브라우저 후보를 찾지 못했습니다. reason=${result.reason}`
  }
  return [
    `연장 "${extensionId}" 활성 브라우저 후보:`,
    formatBrowserCandidate(result.activeBrowser),
    `reason=${result.reason}`,
  ].join("\n")
}

function formatBrowserOpenUrlOutput(extensionId: string, result: YeonjangBrowserOpenUrlResult): string {
  return [
    `연장 "${extensionId}" 브라우저 URL 열기 요청이 전달되었습니다.`,
    `scheme=${result.urlScheme}`,
    `사후검증: ${result.postCheck.verified ? "성공" : "LLM 목표 검증 필요"}`,
    ...(result.postCheck.reason ? [`reason=${result.postCheck.reason}`] : []),
  ].join("\n")
}

function formatBrowserFocusOutput(
  extensionId: string,
  result: YeonjangBrowserFocusResult,
  postCheck?: { state: string; reasonCode: string },
): string {
  const state = postCheck?.state ?? "MANUAL_INTERVENTION"
  const reasonCode = postCheck?.reasonCode ?? result.reasonCode ?? "focused_target_observation_required"
  return [
    `연장 "${extensionId}" 브라우저 포커스 요청이 준비되었습니다.`,
    `reason=${reasonCode}`,
    `사후검증: ${state === "VERIFIED" ? "성공" : "focused target observation 필요"}`,
  ].join("\n")
}

function browserFocusTarget(params: YeonjangBrowserFocusParams): YeonjangBrowserFocusTargetProjection | null {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: params.targetAlias,
    processName: params.processName,
    title: params.title,
    url: params.url,
  })
  return projected.ok ? projected.projection : null
}

function browserFocusTargetRef(params: YeonjangBrowserFocusParams): string {
  const extensionId = params.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID
  const sessionRef = params.targetSessionId?.trim()
  const target = browserFocusTarget(params)
  return `yeonjang:${extensionId}${sessionRef ? `:${sessionRef}` : ""}:browser.focus:${target?.displayName ?? "target"}`
}

function hasExplicitBrowserFocusApproval(ctx: ToolContext): boolean {
  const decision = ctx.authorizationReceipt?.approvalDecision
  return decision === "allow_once" || decision === "allow_run"
}

function isBrowserFocusPublicTargetProjection(value: unknown): value is YeonjangBrowserFocusTargetProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as Partial<YeonjangBrowserFocusTargetProjection>
  return (
    candidate.schemaVersion === "yeonjang-browser-focus-target-v1" &&
    candidate.targetKind === "browser_window_or_tab" &&
    typeof candidate.displayName === "string" &&
    Array.isArray(candidate.publicEvidenceFields) &&
    Array.isArray(candidate.auditOnlyFields)
  )
}

function browserFocusExpectedState(params: YeonjangBrowserFocusParams, ctx: ToolContext) {
  const target = browserFocusTarget(params)
  const fallbackTarget = target ?? {
    schemaVersion: "yeonjang-browser-focus-target-v1" as const,
    targetKind: "browser_window_or_tab" as const,
    displayName: "target_required",
    publicEvidenceFields: [],
    auditOnlyFields: [],
  }
  const approvalGranted = hasExplicitBrowserFocusApproval(ctx)
  const preflight = evaluateYeonjangBrowserFocusPreflight({
    capabilitySupported: true,
    approvalGranted,
    target: fallbackTarget,
  })
  const admission = evaluateYeonjangBrowserFocusToolAdmission({
    readyTargets: target
      ? [{
          publicTargetName: target.displayName,
          platform: "unknown",
          method: "browser.focus",
          requiresApproval: true,
          permissionSetting: "allow_browser_control",
        }]
      : [],
    approvalGranted,
    preflight,
  })
  return {
    method: "browser.focus" as const,
    target: fallbackTarget,
    commandContract: buildYeonjangBrowserFocusCommandContract({
      platform: "unknown",
      desktopSession: "available",
      commandBackendAvailable: Boolean(ctx.yeonjangBrowserFocusExecutionAdmissionIssuer),
      observationBackendAvailable: true,
      admission,
      target: fallbackTarget,
    }),
  }
}

function buildBrowserFocusPublicTargetResolutionDetails(selection: {
  ok: boolean
  status: string
  explicitTarget: boolean
  uiAction: string
  reasonCodes: string[]
}): {
  selectionStatus: string
  explicitTarget: boolean
  targetResolved: boolean
  uiAction: string
  reasonCodes: string[]
} {
  return {
    selectionStatus: selection.status,
    explicitTarget: selection.explicitTarget,
    targetResolved: selection.ok,
    uiAction: selection.uiAction,
    reasonCodes: [...selection.reasonCodes],
  }
}

function formatClipboardReadOutput(extensionId: string, result: YeonjangClipboardReadResult): string {
  if (result.empty) return `연장 "${extensionId}" 클립보드가 비어 있습니다.`
  return [
    `연장 "${extensionId}" 클립보드 읽기 완료 (${result.charCount}자, ${result.byteLength} bytes).`,
    result.text,
  ].join("\n")
}

function formatClipboardWriteOutput(extensionId: string, result: YeonjangClipboardWriteResult): string {
  return [
    `연장 "${extensionId}" 클립보드 쓰기 ${result.postCheck.verified ? "완료" : "실패"}.`,
    `요청 크기: ${result.charCount}자, ${result.byteLength} bytes`,
    `사후검증: ${result.postCheck.verified ? "성공" : "실패"}`,
    ...(result.postCheck.reason ? [`이유: ${result.postCheck.reason}`] : []),
  ].join("\n")
}

function formatNetworkStatusOutput(extensionId: string, result: YeonjangNetworkStatusResult): string {
  const lines = [`연장 "${extensionId}" 네트워크 상태: ${result.interfaceCount}개 인터페이스`]
  for (const entry of result.interfaces.slice(0, 20)) {
    lines.push(`- ${entry.name}: received=${entry.totalReceivedBytes} bytes, transmitted=${entry.totalTransmittedBytes} bytes`)
  }
  lines.push(`외부 연결 검사: ${result.externalProbe ? "실행됨" : "실행 안 함"}`)
  if (result.interfaces.length > 20) lines.push("인터페이스 목록이 20개로 제한되었습니다.")
  return lines.join("\n")
}

function formatDeviceStatusOutput(extensionId: string, result: YeonjangDeviceStatusResult): string {
  const groups = Object.entries(result.resources)
    .map(([name, values]) => {
      const enabled = Object.values(values).filter((value) => value === true).length
      return `${name}: ${enabled}/${Object.keys(values).length}`
    })
  return [
    `연장 "${extensionId}" 장치 상태:`,
    `플랫폼: ${result.platform}`,
    ...groups.map((group) => `- ${group}`),
  ].join("\n")
}

function extensionFromMimeType(mimeType?: string): string {
  switch ((mimeType ?? "").toLowerCase()) {
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg"
  }
}

function saveInlineCapture(
  extensionId: string,
  bytes: Buffer,
  mimeType: string,
  artifactsRoot: string,
): string {
  const artifactsDir = join(artifactsRoot, "yeonjang")
  mkdirSync(artifactsDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filePath = join(artifactsDir, `${extensionId}-camera-${timestamp}.${extensionFromMimeType(mimeType)}`)
  writeFileSync(filePath, bytes)
  return filePath
}

export const yeonjangCameraListTool: AgentTool<YeonjangCameraListParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["camera.list"],
  name: "yeonjang_camera_list",
  description: "MQTT로 연결된 Yeonjang 연장에 카메라 목록 조회를 요청합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangCameraListParams, ctx: ToolContext): Promise<ToolResult> {
    const selection = resolveYeonjangTargetSelection({
      requestedExtensionId: params.extensionId,
      targetSelector: params.targetSelector,
      expectedTargetSessionId: params.targetSessionId,
      userMessage: ctx.userMessage,
    })
    if (!selection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(selection),
      }
    }
    const extensionId = selection.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID
    const yeonjangOptions = withYeonjangRequestMetadata(ctx, {
      extensionId,
      ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
    })
    ctx.onProgress(`연장 ${extensionId} 카메라 목록을 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const devices = await invokeYeonjangMethod<YeonjangCameraDevice[]>(
        "camera.list",
        {},
        {
          ...yeonjangOptions,
          ...(timeoutMs != null ? { timeoutMs } : {}),
        },
      )
      return {
        success: true,
        output: formatCameraList(extensionId, devices),
        details: {
          via: "yeonjang",
          extensionId,
          devices,
          ...buildYeonjangTargetResolutionDetails(selection),
          ...(wantsCameraInventoryOnly(ctx.userMessage) ? { responseOwnership: "final_text" as const } : {}),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${extensionId}" 카메라 목록 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId,
          ...buildYeonjangTargetResolutionDetails(selection),
        },
      }
    }
  },
}

export const yeonjangCameraPermissionStatusTool: AgentTool<YeonjangCameraPermissionStatusParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["camera.permission_status"],
  name: "yeonjang_camera_permission_status",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 카메라 권한 상태를 진단합니다. 이미지는 캡처하지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangCameraPermissionStatusParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 카메라 권한 상태를 확인합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangCameraPermissionStatusResult>("camera.permission_status", {}, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatCameraPermissionStatusOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          cameraPermission: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_camera_permission_status"),
            targetRef: resolved.extensionId,
            summary: `camera permission status=${result.status} reason=${result.reason}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 카메라 권한 상태 확인 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

function resolveYeonjangFileRequest(params: YeonjangTargetedToolParams, ctx: ToolContext) {
  const selection = resolveYeonjangTargetSelection({
    requestedExtensionId: params.extensionId,
    targetSelector: params.targetSelector,
    expectedTargetSessionId: params.targetSessionId,
    userMessage: ctx.userMessage,
  })
  if (!selection.ok) return { ok: false as const, selection }
  const extensionId = selection.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID
  const yeonjangOptions = withYeonjangRequestMetadata(ctx, {
    extensionId,
    ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
  })
  return { ok: true as const, selection, extensionId, yeonjangOptions }
}

export const yeonjangFileMetadataTool: AgentTool<YeonjangFilePathParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["file.metadata"],
  name: "yeonjang_file_metadata",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 파일 또는 디렉터리 metadata를 조회합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 조회할 파일 또는 디렉터리 경로입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangFilePathParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 파일 정보를 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangFileMetadataResult>("file.metadata", {
        path: params.path,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatFileMetadataOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          file: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_file_metadata"),
            targetRef: resolved.extensionId,
            summary: `file metadata kind=${result.kind} bytes=${result.bytes ?? "unknown"}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 파일 정보 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangFileListTool: AgentTool<YeonjangFilePathParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["file.list"],
  name: "yeonjang_file_list",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 디렉터리 목록을 조회합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 목록을 조회할 디렉터리 경로입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangFilePathParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 파일 목록을 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangFileListResult>("file.list", {
        path: params.path,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatFileListOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          listing: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_file_list"),
            targetRef: resolved.extensionId,
            summary: `file list path=${result.path} entries=${result.entries.length}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 파일 목록 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangFileReadTool: AgentTool<YeonjangFileReadParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["file.read"],
  name: "yeonjang_file_read",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 UTF-8 텍스트 파일을 읽습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 읽을 파일 경로입니다.",
      },
      maxBytes: {
        type: "number",
        description: "읽을 최대 byte 수입니다. Yeonjang 설정의 max_read_bytes를 초과할 수 없습니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangFileReadParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 파일을 읽습니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const maxBytes = Number.isFinite(params.maxBytes)
        ? Math.max(1, Math.floor(params.maxBytes!))
        : undefined
      const result = await invokeYeonjangMethod<YeonjangFileReadResult>("file.read", {
        path: params.path,
        ...(maxBytes != null ? { max_bytes: maxBytes } : {}),
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatFileReadOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          file: {
            path: result.path,
            encoding: result.encoding,
            bytesRead: result.bytesRead,
            totalBytes: result.totalBytes,
            truncated: result.truncated,
          },
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_file_read"),
            targetRef: resolved.extensionId,
            summary: `file read bytes=${result.bytesRead}/${result.totalBytes} truncated=${result.truncated}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 파일 읽기 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangFileSearchTool: AgentTool<YeonjangFileSearchParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["file.search"],
  name: "yeonjang_file_search",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 허용된 UTF-8 파일에서 텍스트를 검색합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 검색할 파일 또는 디렉터리 경로입니다.",
      },
      query: {
        type: "string",
        description: "검색할 텍스트입니다. 정규식이 아닌 일반 문자열로 처리됩니다.",
      },
      maxResults: {
        type: "number",
        description: "반환할 최대 검색 결과 수입니다. 기본값은 50개입니다.",
      },
      maxPreviewChars: {
        type: "number",
        description: "각 결과에 표시할 미리보기 최대 글자 수입니다. 기본값은 160자입니다.",
      },
      maxBytesPerFile: {
        type: "number",
        description: "파일 하나에서 읽을 최대 byte 수입니다. Yeonjang 설정의 max_read_bytes를 초과할 수 없습니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path", "query"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangFileSearchParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 파일을 검색합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const maxResults = Number.isFinite(params.maxResults)
        ? Math.max(1, Math.floor(params.maxResults!))
        : undefined
      const maxPreviewChars = Number.isFinite(params.maxPreviewChars)
        ? Math.max(1, Math.floor(params.maxPreviewChars!))
        : undefined
      const maxBytesPerFile = Number.isFinite(params.maxBytesPerFile)
        ? Math.max(1, Math.floor(params.maxBytesPerFile!))
        : undefined
      const result = await invokeYeonjangMethod<YeonjangFileSearchResult>("file.search", {
        path: params.path,
        query: params.query,
        ...(maxResults != null ? { max_results: maxResults } : {}),
        ...(maxPreviewChars != null ? { max_preview_chars: maxPreviewChars } : {}),
        ...(maxBytesPerFile != null ? { max_bytes_per_file: maxBytesPerFile } : {}),
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatFileSearchOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          search: {
            path: result.path,
            query: result.query,
            resultCount: result.resultCount,
            skippedFiles: result.skippedFiles,
            truncated: result.truncated,
            matches: result.matches.map((match) => ({
              path: match.path,
              lineNumber: match.lineNumber,
              byteOffset: match.byteOffset,
              truncated: match.truncated,
            })),
          },
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_file_search"),
            targetRef: resolved.extensionId,
            summary: `file search results=${result.resultCount} skipped=${result.skippedFiles} truncated=${result.truncated}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 파일 검색 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangFileWriteTool: AgentTool<YeonjangFileWriteParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["file.write"],
  name: "yeonjang_file_write",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 UTF-8 텍스트 파일을 씁니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 쓸 파일 경로입니다.",
      },
      text: {
        type: "string",
        description: "파일에 기록할 UTF-8 텍스트입니다.",
      },
      overwrite: {
        type: "boolean",
        description: "기존 파일 덮어쓰기 여부입니다. 기본값은 false입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path", "text"],
  },
  riskLevel: "moderate",
  requiresApproval: true,
  sideEffect: {
    effectClass: "local_write",
    compensationSupport: "irreversible",
    targetRef: yeonjangFileTargetRef,
    expectedState: (params) => ({
      exists: true,
      bytes: Buffer.byteLength(params.text, "utf8"),
    }),
    observe: async (params, _ctx, result) =>
      observeYeonjangFilePostCheck(params, {
        exists: true,
        bytes: Buffer.byteLength(params.text, "utf8"),
      }, result),
  },
  async execute(params: YeonjangFileWriteParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection })
    if (!reboundSelection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(reboundSelection),
      }
    }
    recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "file.write", ctx })
    ctx.onProgress(`연장 ${resolved.extensionId} 파일 쓰기를 요청합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangFileWriteResult>("file.write", {
        path: params.path,
        text: params.text,
        overwrite: params.overwrite === true,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: result.postCheck.verified,
        output: formatFileWriteOutput(resolved.extensionId, result),
        ...(result.postCheck.verified ? {} : { error: "post_check_failed" }),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          file: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_file_write"),
            targetRef: resolved.extensionId,
            summary: `file write bytes=${result.bytesWritten} verified=${result.postCheck.verified}`,
            postCheck: {
              kind: result.postCheck.verified ? "verified" : "failed",
              verified: result.postCheck.verified,
              exists: result.postCheck.exists,
              ...(typeof result.postCheck.bytes === "number" ? { bytes: result.postCheck.bytes } : {}),
            },
          }),
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 파일 쓰기 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    }
  },
}

export const yeonjangFilePatchTool: AgentTool<YeonjangFilePatchParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["file.patch"],
  name: "yeonjang_file_patch",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 UTF-8 텍스트 파일에 exact single-match patch를 적용합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 patch할 파일 경로입니다.",
      },
      expectedText: {
        type: "string",
        description: "파일 안에 정확히 한 번 존재해야 하는 기존 텍스트입니다.",
      },
      replacementText: {
        type: "string",
        description: "기존 텍스트를 대체할 UTF-8 텍스트입니다.",
      },
      maxBytes: {
        type: "number",
        description: "patch 전에 읽을 최대 byte 수입니다. Yeonjang 설정의 max_write_bytes를 초과할 수 없습니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path", "expectedText", "replacementText"],
  },
  riskLevel: "moderate",
  requiresApproval: true,
  sideEffect: {
    effectClass: "local_write",
    compensationSupport: "irreversible",
    targetRef: yeonjangFileTargetRef,
    expectedState: (params) => ({
      exists: true,
      expectedTextHash: hashUtf8(params.expectedText),
      replacementTextHash: hashUtf8(params.replacementText),
      replacementBytes: Buffer.byteLength(params.replacementText, "utf8"),
    }),
    observe: async (params, _ctx, result) =>
      observeYeonjangFilePostCheck(params, {
        exists: true,
        expectedTextHash: hashUtf8(params.expectedText),
        replacementTextHash: hashUtf8(params.replacementText),
        replacementBytes: Buffer.byteLength(params.replacementText, "utf8"),
      }, result),
  },
  async execute(params: YeonjangFilePatchParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection })
    if (!reboundSelection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(reboundSelection),
      }
    }
    recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "file.patch", ctx })
    ctx.onProgress(`연장 ${resolved.extensionId} 파일 패치를 요청합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const maxBytes = Number.isFinite(params.maxBytes)
        ? Math.max(1, Math.floor(params.maxBytes!))
        : undefined
      const result = await invokeYeonjangMethod<YeonjangFilePatchResult>("file.patch", {
        path: params.path,
        expected_text: params.expectedText,
        replacement_text: params.replacementText,
        ...(maxBytes != null ? { max_bytes: maxBytes } : {}),
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      const verified = result.changed && result.postCheck.verified
      return {
        success: verified,
        output: formatFilePatchOutput(resolved.extensionId, result),
        ...(verified ? {} : { error: result.reason || "post_check_failed" }),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          file: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_file_patch"),
            targetRef: resolved.extensionId,
            summary: `file patch changed=${result.changed} matchCount=${result.matchCount} verified=${result.postCheck.verified}`,
            postCheck: {
              kind: result.postCheck.verified ? "verified" : "failed",
              verified: result.postCheck.verified,
              exists: result.postCheck.exists,
              ...(typeof result.postCheck.bytes === "number" ? { bytes: result.postCheck.bytes } : {}),
              ...(result.reason ? { reason: result.reason } : {}),
            },
          }),
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 파일 패치 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    }
  },
}

export const yeonjangFileDeleteTool: AgentTool<YeonjangFilePathParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["file.delete"],
  name: "yeonjang_file_delete",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 파일 또는 빈 디렉터리를 삭제합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 삭제할 파일 또는 빈 디렉터리 경로입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path"],
  },
  riskLevel: "dangerous",
  requiresApproval: true,
  sideEffect: {
    effectClass: "destructive",
    compensationSupport: "irreversible",
    targetRef: yeonjangFileTargetRef,
    expectedState: () => ({ exists: false }),
    observe: async (params, _ctx, result) =>
      observeYeonjangFilePostCheck(params, { exists: false }, result),
  },
  async execute(params: YeonjangFilePathParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection })
    if (!reboundSelection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(reboundSelection),
      }
    }
    recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "file.delete", ctx })
    ctx.onProgress(`연장 ${resolved.extensionId} 파일 삭제를 요청합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangFileDeleteResult>("file.delete", {
        path: params.path,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: result.postCheck.verified,
        output: formatFileDeleteOutput(resolved.extensionId, result),
        ...(result.postCheck.verified ? {} : { error: "post_check_failed" }),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          file: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_file_delete"),
            targetRef: resolved.extensionId,
            summary: `file delete deleted=${result.deleted} verified=${result.postCheck.verified}`,
            postCheck: {
              kind: result.postCheck.verified ? "verified" : "failed",
              verified: result.postCheck.verified,
              exists: result.postCheck.exists,
              ...(typeof result.postCheck.bytes === "number" ? { bytes: result.postCheck.bytes } : {}),
            },
          }),
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 파일 삭제 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    }
  },
}

export const yeonjangDiskInfoTool: AgentTool<YeonjangDiskPathParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["disk.info"],
  name: "yeonjang_disk_info",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 디스크 metadata와 용량 정보를 조회합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 디스크 정보를 조회할 경로입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangDiskPathParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 디스크 정보를 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangDiskInfoResult>("disk.info", {
        path: params.path,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatDiskInfoOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          disk: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_disk_info"),
            targetRef: resolved.extensionId,
            summary: `disk info exists=${result.exists} total=${result.totalBytes ?? "unknown"} free=${result.freeBytes ?? "unknown"}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 디스크 정보 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangDiskUsageTool: AgentTool<YeonjangDiskPathParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["disk.usage"],
  name: "yeonjang_disk_usage",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 디스크 사용량을 조회합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 디스크 사용량을 조회할 경로입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangDiskPathParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 디스크 사용량을 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangDiskUsageResult>("disk.usage", {
        path: params.path,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatDiskUsageOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          disk: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_disk_usage"),
            targetRef: resolved.extensionId,
            summary: `disk usage total=${result.totalBytes} free=${result.freeBytes} available=${result.availableBytes}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 디스크 사용량 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangDiskExistsTool: AgentTool<YeonjangDiskPathParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["disk.exists"],
  name: "yeonjang_disk_exists",
  description: "MQTT로 연결된 Yeonjang 연장 장치에서 경로 존재 여부를 확인합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      path: {
        type: "string",
        description: "연장 장치에서 존재 여부를 확인할 경로입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["path"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangDiskPathParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 경로 존재 여부를 확인합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangDiskExistsResult>("disk.exists", {
        path: params.path,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatDiskExistsOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          disk: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_disk_exists"),
            targetRef: resolved.extensionId,
            summary: `disk exists exists=${result.exists} kind=${result.kind ?? "unknown"}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 경로 존재 확인 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangProcessListTool: AgentTool<YeonjangProcessListParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["process.list"],
  name: "yeonjang_process_list",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 프로세스 목록을 조회합니다. command line, cwd, env는 반환하지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      limit: {
        type: "number",
        description: "반환할 최대 프로세스 수입니다. 기본값은 50, 최대값은 Yeonjang 런타임 계약을 따릅니다.",
      },
      nameContains: {
        type: "string",
        description: "프로세스 이름에 포함될 문자열입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangProcessListParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 프로세스 목록을 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const limit = Number.isFinite(params.limit) ? Math.max(1, Math.floor(params.limit!)) : undefined
      const result = await invokeYeonjangMethod<YeonjangProcessListResult>("process.list", {
        ...(limit != null ? { limit } : {}),
        ...(params.nameContains?.trim() ? { name_contains: params.nameContains.trim() } : {}),
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatProcessListOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          processes: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_process_list"),
            targetRef: resolved.extensionId,
            summary: `process list count=${result.count}/${result.totalCount} truncated=${result.truncated}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 프로세스 목록 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangProcessInfoTool: AgentTool<YeonjangProcessInfoParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["process.info"],
  name: "yeonjang_process_info",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 단일 프로세스 정보를 조회합니다. command line, cwd, env는 반환하지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      pid: {
        type: "number",
        description: "조회할 프로세스 ID입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["pid"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangProcessInfoParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 프로세스 정보를 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangProcessInfoResult>("process.info", {
        pid: Math.max(0, Math.floor(params.pid)),
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatProcessInfoOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          process: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_process_info"),
            targetRef: resolved.extensionId,
            summary: `process info pid=${result.process.pid} status=${result.process.status}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 프로세스 정보 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangBrowserListTool: AgentTool<YeonjangBrowserListParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["browser.list"],
  name: "yeonjang_browser_list",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 실행 중인 브라우저 후보를 조회합니다. URL, 탭 제목, command line, cwd, profile path, env는 반환하지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      limit: {
        type: "number",
        description: "반환할 최대 브라우저 후보 수입니다. 기본값은 50입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangBrowserListParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 브라우저 후보를 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const limit = Number.isFinite(params.limit) ? Math.max(1, Math.floor(params.limit!)) : undefined
      const result = await invokeYeonjangMethod<YeonjangBrowserListResult>("browser.list", {
        ...(limit != null ? { limit } : {}),
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatBrowserListOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          browsers: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_browser_list"),
            targetRef: resolved.extensionId,
            summary: `browser list count=${result.count}/${result.totalCount} truncated=${result.truncated}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 브라우저 후보 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangBrowserActiveHintTool: AgentTool<YeonjangBrowserActiveHintParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["browser.active_hint"],
  name: "yeonjang_browser_active_hint",
  description: "MQTT로 연결된 Yeonjang 연장 장치에서 활성 브라우저 후보를 추정합니다. 탭, URL, 프로필 정보는 읽지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangBrowserActiveHintParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 활성 브라우저 후보를 확인합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangBrowserActiveHintResult>("browser.active_hint", {}, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatBrowserActiveHintOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          browser: result,
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_browser_active_hint"),
            targetRef: resolved.extensionId,
            summary: `browser active hint available=${result.available} reason=${result.reason}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 활성 브라우저 후보 확인 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangBrowserOpenUrlTool: AgentTool<YeonjangBrowserOpenUrlParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["browser.open_url"],
  name: "yeonjang_browser_open_url",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 기본 브라우저로 http 또는 https URL을 엽니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      url: {
        type: "string",
        description: "연장 장치의 기본 브라우저로 열 http 또는 https URL입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["url"],
  },
  riskLevel: "moderate",
  requiresApproval: true,
  sideEffect: {
    effectClass: "external_write",
    compensationSupport: "irreversible",
    targetRef: yeonjangBrowserTargetRef,
    expectedState: (params) => browserOpenUrlExpectedState(params.url),
    observe: async (params, _ctx, result) => observeYeonjangBrowserOpenUrl(params, result),
  },
  async execute(params: YeonjangBrowserOpenUrlParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection })
    if (!reboundSelection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(reboundSelection),
      }
    }
    recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "browser.open_url", ctx })
    ctx.onProgress(`연장 ${resolved.extensionId} 브라우저 URL 열기를 요청합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangBrowserOpenUrlResult>("browser.open_url", {
        url: params.url,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: result.opened === true,
        output: formatBrowserOpenUrlOutput(resolved.extensionId, result),
        ...(result.opened ? {} : { error: "browser_open_url_failed" }),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          browser: {
            opened: result.opened,
            urlScheme: result.urlScheme,
            urlHash: hashUtf8(params.url.trim()),
            urlLength: params.url.trim().length,
            postCheckReason: result.postCheck.reason,
          },
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_browser_open_url"),
            targetRef: resolved.extensionId,
            summary: `browser open url opened=${result.opened} scheme=${result.urlScheme} urlHash=${hashUtf8(params.url.trim())}`,
            postCheck: {
              kind: "unverifiable",
              verified: false,
              reason: result.postCheck.reason || "llm_goal_validation_required",
            },
          }),
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 브라우저 URL 열기 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    }
  },
}

export const yeonjangBrowserFocusTool: AgentTool<YeonjangBrowserFocusParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["browser.focus"],
  name: "yeonjang_browser_focus",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 브라우저 또는 브라우저 창 포커스를 준비합니다. 실행 후 focused target observation으로 별도 검증해야 합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      targetAlias: {
        type: "string",
        description: "사용자가 부르는 브라우저 또는 창의 공개 대상 이름입니다.",
      },
      processName: {
        type: "string",
        description: "대상 브라우저 프로세스 또는 앱 이름입니다.",
      },
      title: {
        type: "string",
        description: "대상 창 제목입니다. public result에는 원문을 저장하지 않습니다.",
      },
      url: {
        type: "string",
        description: "대상 탭 URL입니다. http 또는 https만 허용하고 public result에는 원문을 저장하지 않습니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "moderate",
  requiresApproval: true,
  sideEffect: createYeonjangBrowserFocusSideEffect<YeonjangBrowserFocusParams>({
    target: (params) => browserFocusTarget(params) ?? browserFocusExpectedState(params, {} as ToolContext).target,
    targetRef: (params) => browserFocusTargetRef(params),
    expectedState: (params, ctx) => browserFocusExpectedState(params, ctx),
  }),
  async execute(params: YeonjangBrowserFocusParams, ctx: ToolContext): Promise<ToolResult> {
    const target = browserFocusTarget(params)
    if (!target) {
      return {
        success: false,
        output: "브라우저 포커스 대상 이름, 프로세스명, 제목, URL 중 하나가 필요합니다.",
        error: "target_identity_required",
        details: {
          kind: "browser_focus_pre_dispatch_blocked",
          reasonCode: "target_identity_required",
        },
      }
    }
    if (!hasExplicitBrowserFocusApproval(ctx)) {
      return {
        success: false,
        output: "브라우저 포커스 변경은 명시적인 사용자 승인이 필요합니다.",
        error: "side_effect_authorization_required",
        details: {
          kind: "browser_focus_pre_dispatch_blocked",
          reasonCode: "side_effect_authorization_required",
          method: "browser.focus",
          target,
        },
      }
    }
    const authorizationReceipt = ctx.authorizationReceipt
    if (!authorizationReceipt?.approvalDecision) {
      return {
        success: false,
        output: "브라우저 포커스 변경 승인 receipt를 확인하지 못해 실행을 시작하지 않았습니다.",
        error: "side_effect_authorization_required",
        details: {
          kind: "browser_focus_pre_dispatch_blocked",
          reasonCode: "side_effect_authorization_required",
          method: "browser.focus",
          target,
        },
      }
    }
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection })
    if (!reboundSelection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(reboundSelection),
      }
    }
    const admissionIssue = ctx.yeonjangBrowserFocusExecutionAdmissionIssuer?.issue({
      extensionId: resolved.extensionId,
      ...(reboundSelection.targetSessionId ? { sessionId: reboundSelection.targetSessionId } : {}),
      targetHash: hashYeonjangBrowserFocusExecutionTarget(target),
      approvalScopeId: authorizationReceipt.permissionScope,
    })
    if (admissionIssue && !admissionIssue.ok) {
      return {
        success: false,
        output: "브라우저 포커스 실행 승인을 준비하지 못해 요청을 전송하지 않았습니다.",
        error: admissionIssue.reasonCode,
        details: {
          kind: "browser_focus_pre_dispatch_blocked",
          reasonCode: admissionIssue.reasonCode,
          method: "browser.focus",
          target,
          ...buildBrowserFocusPublicTargetResolutionDetails(reboundSelection),
        },
      }
    }
    // The runtime creates this receipt. Caller input is never accepted as an
    // execution precondition; only a runtime-issued signed admission can enable
    // the remote side effect.
    const executionPreDispatch: YeonjangBrowserFocusPreDispatchParam = {
      schemaVersion: "knowbee.yeonjang-browser-focus-pre-dispatch.v1",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      status: "dispatch_prepared",
      reasonCode: admissionIssue?.ok
        ? "browser_focus_execution_admission_issued"
        : "browser_focus_execution_admission_key_unavailable",
      invokeNow: admissionIssue?.ok === true,
    }
    recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "browser.focus", ctx })
    ctx.onProgress(`연장 ${resolved.extensionId} 브라우저 포커스 요청을 준비합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangBrowserFocusResult>("browser.focus", {
        target,
        approvalReceipt: {
          method: "browser.focus",
          decision: authorizationReceipt.approvalDecision,
          scopeId: authorizationReceipt.permissionScope,
          approved: true,
        },
        preDispatch: executionPreDispatch,
        ...(admissionIssue?.ok ? { executionAdmission: admissionIssue.admission } : {}),
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        return {
          success: false,
          output: `연장 "${resolved.extensionId}"이 browser.focus 실행 결과를 반환하지 않았습니다.`,
          error: "browser_focus_runtime_response_invalid",
          details: {
            via: "yeonjang",
            extensionId: resolved.extensionId,
            method: "browser.focus",
            target,
            ...buildBrowserFocusPublicTargetResolutionDetails(reboundSelection),
          },
        }
      }
      const observedFocusedTarget = isBrowserFocusPublicTargetProjection(result.observedFocusedTarget)
        ? result.observedFocusedTarget
        : undefined
      const postCheck = evaluateYeonjangBrowserFocusPostCheck({
        commandAccepted: result.commandAccepted === true,
        expectedTarget: target,
        ...(observedFocusedTarget ? { observedFocusedTarget } : {}),
      })
      const evidencePostCheck: YeonjangEvidenceEnvelope["postCheck"] =
        postCheck.state === "VERIFIED"
          ? {
              kind: "verified",
              verified: true,
              reason: postCheck.reasonCode,
            }
          : {
              kind: postCheck.state === "FAILED" ? "failed" : "unverifiable",
              verified: false,
              reason: postCheck.reasonCode,
            }
      return {
        success: postCheck.state === "VERIFIED",
        output: formatBrowserFocusOutput(resolved.extensionId, result, postCheck),
        ...(result.commandAccepted === true ? {} : { error: "browser_focus_command_not_accepted" }),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          method: "browser.focus",
          commandAccepted: result.commandAccepted === true,
          target,
          ...(observedFocusedTarget ? { observedFocusedTarget } : {}),
          postCheck: {
            state: postCheck.state,
            reasonCode: postCheck.reasonCode,
          },
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_browser_focus"),
            targetRef: resolved.extensionId,
            summary: `browser focus post-check state=${postCheck.state} target=${target.displayName}`,
            postCheck: evidencePostCheck,
          }),
          ...buildBrowserFocusPublicTargetResolutionDetails(reboundSelection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 브라우저 포커스 요청 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          method: "browser.focus",
          target,
          ...buildBrowserFocusPublicTargetResolutionDetails(reboundSelection),
        },
      }
    }
  },
}

export const yeonjangClipboardReadTool: AgentTool<YeonjangClipboardReadParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["clipboard.read"],
  name: "yeonjang_clipboard_read",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 클립보드 텍스트를 읽습니다. 원문은 응답 본문에만 포함하고 evidence에는 저장하지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangClipboardReadParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 클립보드를 읽습니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangClipboardReadResult>("clipboard.read", {}, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatClipboardReadOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          clipboard: {
            charCount: result.charCount,
            byteLength: result.byteLength,
            empty: result.empty,
            contentHash: result.contentHash,
          },
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_clipboard_read"),
            targetRef: resolved.extensionId,
            summary: `clipboard read chars=${result.charCount} bytes=${result.byteLength} empty=${result.empty} hash=${result.contentHash}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 클립보드 읽기 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangClipboardWriteTool: AgentTool<YeonjangClipboardWriteParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["clipboard.write"],
  name: "yeonjang_clipboard_write",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 클립보드에 UTF-8 텍스트를 씁니다. 결과와 evidence에는 원문을 저장하지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      text: {
        type: "string",
        description: "연장 장치의 클립보드에 쓸 UTF-8 텍스트입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: ["text"],
  },
  riskLevel: "moderate",
  requiresApproval: true,
  sideEffect: {
    effectClass: "local_write",
    compensationSupport: "irreversible",
    targetRef: yeonjangClipboardTargetRef,
    expectedState: (params) => clipboardWriteExpectedState(params.text),
    observe: async (params, _ctx, result) => observeYeonjangClipboardWrite(params, result),
  },
  async execute(params: YeonjangClipboardWriteParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    const reboundSelection = revalidateYeonjangTargetSelection({ selection: resolved.selection })
    if (!reboundSelection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(reboundSelection),
      }
    }
    recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "clipboard.write", ctx })
    ctx.onProgress(`연장 ${resolved.extensionId} 클립보드 쓰기를 요청합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangClipboardWriteResult>("clipboard.write", {
        text: params.text,
      }, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: result.postCheck.verified,
        output: formatClipboardWriteOutput(resolved.extensionId, result),
        ...(result.postCheck.verified ? {} : { error: "post_check_failed" }),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          clipboard: {
            charCount: result.charCount,
            byteLength: result.byteLength,
            empty: result.empty,
            contentHash: result.contentHash,
            postCheck: result.postCheck,
          },
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_clipboard_write"),
            targetRef: resolved.extensionId,
            summary: `clipboard write chars=${result.charCount} bytes=${result.byteLength} verified=${result.postCheck.verified} hash=${result.contentHash}`,
            postCheck: {
              kind: result.postCheck.verified ? "verified" : "failed",
              verified: result.postCheck.verified,
              bytes: result.postCheck.byteLength ?? result.byteLength,
              ...(result.postCheck.reason ? { reason: result.postCheck.reason } : {}),
            },
          }),
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 클립보드 쓰기 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(reboundSelection),
        },
      }
    }
  },
}

export const yeonjangNetworkStatusTool: AgentTool<YeonjangNetworkStatusParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["network.status"],
  name: "yeonjang_network_status",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 로컬 네트워크 인터페이스 카운터를 조회합니다. 외부 연결 검사는 하지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangNetworkStatusParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 네트워크 상태를 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangNetworkStatusResult>("network.status", {}, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatNetworkStatusOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          network: {
            interfaceCount: result.interfaceCount,
            externalProbe: result.externalProbe,
          },
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_network_status"),
            targetRef: resolved.extensionId,
            summary: `network status interfaces=${result.interfaceCount} externalProbe=${result.externalProbe}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 네트워크 상태 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangDeviceStatusTool: AgentTool<YeonjangDeviceStatusParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["device.status"],
  name: "yeonjang_device_status",
  description: "MQTT로 연결된 Yeonjang 연장 장치의 리소스 지원 상태와 권한 요약을 조회합니다. 내부 ID와 원본 경로는 반환하지 않습니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 15초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "safe",
  requiresApproval: false,
  async execute(params: YeonjangDeviceStatusParams, ctx: ToolContext): Promise<ToolResult> {
    const resolved = resolveYeonjangFileRequest(params, ctx)
    if (!resolved.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(resolved.selection),
      }
    }
    ctx.onProgress(`연장 ${resolved.extensionId} 장치 상태를 조회합니다.`)
    try {
      const timeoutMs = resolveTimeoutMs(params.timeoutSec)
      const result = await invokeYeonjangMethod<YeonjangDeviceStatusResult>("device.status", {}, {
        ...resolved.yeonjangOptions,
        ...(timeoutMs != null ? { timeoutMs } : {}),
      })
      return {
        success: true,
        output: formatDeviceStatusOutput(resolved.extensionId, result),
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          device: {
            platform: result.platform,
            resourceGroups: Object.keys(result.resources),
          },
          evidence: buildYeonjangEvidenceFromMapping({
            mapping: yeonjangMapping("yeonjang_device_status"),
            targetRef: resolved.extensionId,
            summary: `device status platform=${result.platform} groups=${Object.keys(result.resources).length}`,
            postCheck: { kind: "not_required" },
          }),
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${resolved.extensionId}" 장치 상태 조회 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId: resolved.extensionId,
          ...buildYeonjangTargetResolutionDetails(resolved.selection),
        },
      }
    }
  },
}

export const yeonjangCameraCaptureTool: AgentTool<YeonjangCameraCaptureParams> = {
  evidenceSourceKind: "yeonjang",
  runtimeHealthMode: "required",
  runtimeMethodIds: ["camera.capture"],
  name: "yeonjang_camera_capture",
  description: "MQTT로 연결된 Yeonjang 연장에 카메라 캡처를 요청합니다.",
  parameters: {
    type: "object",
    properties: {
      ...buildYeonjangTargetParameterProperties(DEFAULT_YEONJANG_EXTENSION_ID),
      deviceId: {
        type: "string",
        description: "캡처할 카메라 장치 ID. 비우면 기본 카메라를 사용합니다.",
      },
      outputPath: {
        type: "string",
        description: "연장 장치 쪽에 저장할 출력 경로입니다.",
      },
      inlineBase64: {
        type: "boolean",
        description: "이미지 base64 데이터를 응답에 포함합니다. 기본값은 true 입니다.",
      },
      timeoutSec: {
        type: "number",
        description: "응답 대기 시간(초). 기본값은 60초입니다.",
      },
    },
    required: [],
  },
  riskLevel: "moderate",
  requiresApproval: true,
  sideEffect: {
    effectClass: "local_write",
    compensationSupport: "irreversible",
    targetRef: yeonjangCameraTargetRef,
    expectedState: cameraExpectedState,
    observe: async (params, _ctx, result) => observeYeonjangCameraCapture(params, result),
  },
  async execute(params: YeonjangCameraCaptureParams, ctx: ToolContext): Promise<ToolResult> {
    const selection = resolveYeonjangTargetSelection({
      requestedExtensionId: params.extensionId,
      targetSelector: params.targetSelector,
      expectedTargetSessionId: params.targetSessionId,
      userMessage: ctx.userMessage,
    })
    if (!selection.ok) {
      return {
        success: false,
        ...buildYeonjangTargetSelectionFailure(selection),
      }
    }
    const extensionId = selection.extensionId ?? DEFAULT_YEONJANG_EXTENSION_ID
    const yeonjangOptions = withYeonjangRequestMetadata(ctx, {
      extensionId,
      ...(selection.targetSessionId ? { metadata: { targetSessionId: selection.targetSessionId } } : {}),
    })
    const inlineBase64 = true
    ctx.onProgress(`연장 ${extensionId} 카메라 캡처를 요청합니다.`)
    try {
      const requestedFacing = resolveRequestedCameraFacing(ctx.userMessage)
      if (requestedFacing && params.deviceId) {
        const reboundSelection = revalidateYeonjangTargetSelection({ selection })
        if (!reboundSelection.ok) {
          return {
            success: false,
            ...buildYeonjangTargetSelectionFailure(reboundSelection),
          }
        }
        recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "camera.list", ctx })
        const listTimeoutMs = resolveTimeoutMs(15)
        const listedDevices = await invokeYeonjangMethod<YeonjangCameraDevice[]>(
          "camera.list",
          {},
          {
            ...yeonjangOptions,
            ...(listTimeoutMs != null ? { timeoutMs: listTimeoutMs } : {}),
          },
        )
        const selectedDevice = findCameraDeviceById(listedDevices, params.deviceId)
        if (selectedDevice && isContinuityCameraDevice(selectedDevice)) {
          return {
            success: false,
            output: buildCameraFacingUnsupportedMessage({
              deviceName: selectedDevice.name,
              facing: requestedFacing,
            }),
            error: "CAMERA_FACING_SELECTION_UNSUPPORTED",
            details: {
              via: "yeonjang",
              extensionId,
              deviceId: params.deviceId,
              deviceName: selectedDevice.name,
              requestedFacing,
              constraint: "camera_facing_selection_unsupported",
              ...buildYeonjangTargetResolutionDetails(reboundSelection),
            },
          }
        }
      }

      const reboundSelection = revalidateYeonjangTargetSelection({ selection })
      if (!reboundSelection.ok) {
        return {
          success: false,
          ...buildYeonjangTargetSelectionFailure(reboundSelection),
        }
      }
      recordYeonjangRemoteExecutionApproval({ selection: reboundSelection, toolName: "camera.capture", ctx })
      const result = await invokeYeonjangMethod<YeonjangCameraCaptureResult>(
        "camera.capture",
        {
          ...(params.deviceId ? { device_id: params.deviceId } : {}),
          inline_base64: inlineBase64,
        },
        {
          ...yeonjangOptions,
          timeoutMs: resolveTimeoutMs(params.timeoutSec) ?? DEFAULT_CAMERA_CAPTURE_TIMEOUT_MS,
        },
      )

      const details: YeonjangCameraCaptureDetails = {
        via: "yeonjang",
        extensionId,
        ...(result.device_id ? { deviceId: result.device_id } : {}),
        ...(requestedFacing ? { requestedFacing } : {}),
        ...(result.file_name ? { fileName: result.file_name } : {}),
        ...(result.file_extension ? { fileExtension: result.file_extension } : {}),
        ...(result.mime_type ? { mimeType: result.mime_type } : {}),
        ...(typeof result.size_bytes === "number" ? { sizeBytes: result.size_bytes } : {}),
        transferEncoding: "base64",
        ...buildYeonjangTargetResolutionDetails(reboundSelection),
      }

      const binaryValidation = validateYeonjangBinaryCaptureResult(result)
      if (!binaryValidation.ok) {
        return {
          success: false,
          output: binaryValidation.message,
          error: binaryValidation.errorCode,
          details: {
            via: "yeonjang",
            extensionId,
            artifactVerification: {
              status: "failed",
              reasonCode: binaryValidation.reasonCode,
            },
            ...buildYeonjangTargetResolutionDetails(reboundSelection),
          },
        }
      }
      const localSavedPath = saveInlineCapture(
        extensionId,
        binaryValidation.bytes,
        binaryValidation.mimeType,
        ctx.artifactStorage.rootDir,
      )
      let artifactDetails: ArtifactDeliveryResultDetails | undefined
      const localFileSize = statSync(localSavedPath).size
      if (localFileSize < 1) {
        ctx.artifactStorage.fileSystem.remove(localSavedPath)
        return {
          success: false,
          output: "카메라 이미지를 저장했지만 파일이 비어 있어 캡처를 완료하지 않았습니다.",
          error: "CAMERA_ARTIFACT_EMPTY",
          details: {
            via: "yeonjang",
            extensionId,
            artifactVerification: {
              status: "failed",
              reasonCode: "camera_artifact_empty",
            },
            ...buildYeonjangTargetResolutionDetails(reboundSelection),
          },
        }
      }
      const artifactRef = `artifact:${recordArtifactMetadata({
        artifactPath: localSavedPath,
        ownerChannel: ctx.source,
        sourceRunId: ctx.runId,
        requestGroupId: ctx.requestGroupId ?? ctx.runId,
        mimeType: binaryValidation.mimeType,
        sizeBytes: localFileSize,
        retentionPolicy: "standard",
        dataClassification: "user",
        metadata: {
          sourceKind: "yeonjang_camera_capture",
          artifactRefVisibility: "bounded",
        },
      }, ctx.artifactStorage)}`
      details.localFileSize = localFileSize
      details.artifactVerification = {
        status: "verified",
        artifactRef,
        mimeType: binaryValidation.mimeType,
        sizeBytes: localFileSize,
      }
      if (ctx.source === "webui") {
        artifactDetails = {
          kind: "artifact_delivery",
          channel: "webui",
          artifactRef,
          size: localFileSize,
          source: ctx.source,
          mimeType: binaryValidation.mimeType,
        }
      }
      details.evidence = buildYeonjangEvidenceFromMapping({
        mapping: yeonjangMapping("yeonjang_camera_capture"),
        targetRef: extensionId,
        summary: `camera capture device=${result.device_id ?? "default"} bytes=${localFileSize} artifact=verified`,
        postCheck: {
          kind: "verified",
          verified: true,
          exists: true,
          bytes: localFileSize,
          artifactRef,
          mimeType: binaryValidation.mimeType,
        },
      })

      return {
        success: true,
        output: formatCaptureOutput(extensionId, result),
        details: {
          ...details,
          ...(artifactDetails ?? {}),
        },
      }
    } catch (error) {
      const message = toolUserFacingErrorMessage(error)
      return {
        success: false,
        output: `연장 "${extensionId}" 카메라 캡처 실패: ${message}`,
        error: message,
        details: {
          via: "yeonjang",
          extensionId,
          ...buildYeonjangTargetResolutionDetails(selection),
        },
      }
    }
  },
}
