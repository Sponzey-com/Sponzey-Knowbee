import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  doesYeonjangCapabilitySupportMethod,
  doesYeonjangCapabilitySupportOutputMode,
  getYeonjangCapabilities,
  hasYeonjangCapabilityMatrix,
  invokeYeonjangMethod,
  isYeonjangUnavailableError,
  type YeonjangClientOptions,
} from "../../../yeonjang/mqtt-client.js"
import type { ToolResult } from "../../types.js"
import { buildYeonjangRequiredFailure } from "../yeonjang-required-failure.js"

export interface YeonjangScreenCaptureResult {
  output_path?: string
  file_name?: string
  file_extension?: string
  mime_type?: string
  size_bytes?: number
  transfer_encoding?: string
  base64_data?: string
  message: string
}

export interface ScreenCaptureFailureDetails {
  via: "yeonjang"
  extensionId?: string
  stopAfterFailure?: boolean
  failureKind?: "remote_failure" | "remote_rejected"
  reasonCode?: string
  terminalStage?: "response_timeout" | "handler_timeout" | "helper_timeout" | "handler_failed" | "cancelled" | "rejected"
  retrySafety?: "safe_same_command" | "change_strategy" | "unknown_effect_state" | "completed"
  failure?: {
    reasonCode: string
    retrySameStrategy: false
    terminalStage?: "response_timeout" | "handler_timeout" | "helper_timeout" | "handler_failed" | "cancelled" | "rejected"
    retrySafety?: "safe_same_command" | "change_strategy" | "unknown_effect_state" | "completed"
  }
}

export const DEFAULT_SCREEN_CAPTURE_TIMEOUT_MS = 60_000

export function extensionFromScreenCaptureMimeType(mimeType?: string): string {
  switch ((mimeType ?? "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg"
    case "image/webp":
      return "webp"
    case "image/png":
    default:
      return "png"
  }
}

export function saveInlineScreenCapture(
  base64: string,
  mimeType: string | undefined,
  rootDir: string,
): string {
  mkdirSync(rootDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filePath = join(rootDir, `screen-capture-${timestamp}.${extensionFromScreenCaptureMimeType(mimeType)}`)
  writeFileSync(filePath, Buffer.from(base64, "base64"))
  return filePath
}

export function validateYeonjangScreenCaptureBinaryResult(remote: YeonjangScreenCaptureResult): string {
  if (!remote.base64_data) {
    throw new Error("연장 screen.capture 응답에 바이너리(base64_data)가 없습니다.")
  }
  if (remote.transfer_encoding && remote.transfer_encoding !== "base64") {
    throw new Error(`연장 screen.capture 응답 전달 형식이 base64가 아닙니다: ${remote.transfer_encoding}`)
  }
  return remote.base64_data
}

export function yeonjangRequiredFailure(method: string): ToolResult {
  return buildYeonjangRequiredFailure({ method })
}

export function yeonjangCapabilityMatrixRequiredFailure(method: string): ToolResult {
  return {
    success: false,
    output: [
      `현재 연결된 Yeonjang이 \`${method}\` capability matrix를 제공하지 않는 오래된 버전입니다.`,
      "화면 캡처는 지원 여부와 결과 전달 형식(base64/file)을 확인한 뒤 실행해야 하므로, 최신 Yeonjang으로 재빌드하고 재시작해 주세요.",
    ].join("\n"),
    error: "YEONJANG_CAPABILITY_MATRIX_REQUIRED",
    details: {
      via: "yeonjang",
      // This is a pre-dispatch contract rejection. It has no device effect,
      // so a same-request capture retry cannot establish new evidence.
      stopAfterFailure: true,
      failureKind: "remote_rejected",
      reasonCode: "yeonjang_capability_matrix_required",
      terminalStage: "rejected",
      retrySafety: "change_strategy",
      failure: {
        reasonCode: "yeonjang_capability_matrix_required",
        retrySameStrategy: false,
        terminalStage: "rejected",
        retrySafety: "change_strategy",
      },
      requiredExecutor: "yeonjang",
      requiredMethod: method,
      requiredCapabilityMatrix: true,
    },
  }
}

export function yeonjangOutputModeFailure(method: string, outputMode: string): ToolResult {
  return {
    success: false,
    output: [
      `현재 연결된 Yeonjang이 \`${method}\` 결과를 \`${outputMode}\` 형식으로 반환할 수 없다고 보고했습니다.`,
      "요청한 결과물을 안전하게 전달할 수 없으므로 다른 출력 형식으로 임의 실행하지 않고 중단합니다.",
    ].join("\n"),
    error: "YEONJANG_OUTPUT_MODE_UNSUPPORTED",
    details: {
      requiredExecutor: "yeonjang",
      requiredMethod: method,
      requiredOutputMode: outputMode,
    },
  }
}

export function yeonjangOutputModeUnknownFailure(method: string, outputMode: string): ToolResult {
  return {
    success: false,
    output: [
      `현재 연결된 Yeonjang이 \`${method}\`의 \`${outputMode}\` 결과 반환 가능 여부를 보고하지 않았습니다.`,
      "결과물이 필요한 요청이므로 출력 형식이 확인될 때까지 실행하지 않습니다. 최신 Yeonjang으로 재빌드하고 재시작해 주세요.",
    ].join("\n"),
    error: "YEONJANG_OUTPUT_MODE_UNKNOWN",
    details: {
      requiredExecutor: "yeonjang",
      requiredMethod: method,
      requiredOutputMode: outputMode,
    },
  }
}

export async function preflightYeonjangScreenCapture(options: YeonjangClientOptions): Promise<ToolResult | null> {
  const method = "screen.capture"
  try {
    const capabilities = await getYeonjangCapabilities(options)
    if (!doesYeonjangCapabilitySupportMethod(capabilities, method)) {
      return yeonjangRequiredFailure(method)
    }
    if (!hasYeonjangCapabilityMatrix(capabilities)) {
      return yeonjangCapabilityMatrixRequiredFailure(method)
    }

    // MQTT v2 exposes a verified artifact transfer. mqtt-client consumes that
    // transfer, verifies its receipt and digest, then normalizes it to this
    // tool's in-memory base64 result. Legacy transports still return base64
    // directly, so their advertised capability remains the required contract.
    const requiredOutputMode = capabilities.protocolVersion === "2" ? "artifact" : "base64"
    const outputModeSupport = doesYeonjangCapabilitySupportOutputMode(
      capabilities,
      method,
      requiredOutputMode,
    )
    if (outputModeSupport === false) return yeonjangOutputModeFailure(method, requiredOutputMode)
    if (outputModeSupport === null) return yeonjangOutputModeUnknownFailure(method, requiredOutputMode)
    return null
  } catch (error) {
    if (isYeonjangUnavailableError(error)) return yeonjangRequiredFailure(method)
    throw error
  }
}

export function classifyYeonjangScreenCaptureFailure(error: unknown, message: string): {
  code: string
  output: string
  details: ScreenCaptureFailureDetails
} {
  const candidate =
    error instanceof Error
      ? error as Error & { code?: unknown; attempt?: unknown }
      : null
  const code = typeof candidate?.code === "string" ? candidate.code.trim() : ""
  const attempt =
    candidate?.attempt
    && typeof candidate.attempt === "object"
    && !Array.isArray(candidate.attempt)
      ? candidate.attempt as Record<string, unknown>
      : null
  const terminalStage = attempt?.["terminalStage"]
  const retrySafety = attempt?.["retrySafety"]
  const boundAttempt =
    code.length > 0
    && attempt?.["schemaVersion"] === 1
    && attempt["method"] === "screen.capture"
    && attempt["reasonCode"] === code
  if (boundAttempt) {
    const output = code === "screen_permission_denied"
      ? "Yeonjang 화면 캡처는 운영 체제의 화면 캡처 권한이 거부되어 시작되지 않았습니다. 시스템 설정에서 Yeonjang의 화면 캡처 권한을 허용한 뒤 다시 요청해 주세요."
      : `Yeonjang 화면 캡처 실패: ${message}`
    return {
      code,
      output,
      details: {
        via: "yeonjang",
        stopAfterFailure: true,
        failureKind: terminalStage === "rejected" ? "remote_rejected" : "remote_failure",
        reasonCode: code,
        ...(terminalStage === "response_timeout"
          || terminalStage === "handler_timeout"
          || terminalStage === "helper_timeout"
          || terminalStage === "handler_failed"
          || terminalStage === "cancelled"
          || terminalStage === "rejected"
          ? { terminalStage }
          : {}),
        ...(retrySafety === "safe_same_command"
          || retrySafety === "change_strategy"
          || retrySafety === "unknown_effect_state"
          || retrySafety === "completed"
          ? { retrySafety }
          : {}),
        failure: {
          reasonCode: code,
          retrySameStrategy: false,
          ...(terminalStage === "response_timeout"
            || terminalStage === "handler_timeout"
            || terminalStage === "helper_timeout"
            || terminalStage === "handler_failed"
            || terminalStage === "cancelled"
            || terminalStage === "rejected"
            ? { terminalStage }
            : {}),
          ...(retrySafety === "safe_same_command"
            || retrySafety === "change_strategy"
            || retrySafety === "unknown_effect_state"
            || retrySafety === "completed"
            ? { retrySafety }
            : {}),
        },
      },
    }
  }

  return {
    code: "YEONJANG_SCREEN_CAPTURE_REMOTE_FAILURE",
    output: `Yeonjang 화면 캡처 실패: ${message}`,
    details: {
      via: "yeonjang",
      stopAfterFailure: true,
      failureKind: "remote_failure",
      reasonCode: "yeonjang_screen_capture_remote_failure",
      terminalStage: "handler_failed",
      retrySafety: "unknown_effect_state",
      failure: {
        reasonCode: "yeonjang_screen_capture_remote_failure",
        retrySameStrategy: false,
        terminalStage: "handler_failed",
        retrySafety: "unknown_effect_state",
      },
    },
  }
}

export async function captureScreenViaYeonjang(params: {
  options: YeonjangClientOptions
  display?: number
}): Promise<{
  base64: string
  remote: YeonjangScreenCaptureResult
}> {
  const remote = await invokeYeonjangMethod<YeonjangScreenCaptureResult>(
    "screen.capture",
    {
      inline_base64: true,
      ...(params.display !== undefined ? { display: params.display } : {}),
    },
    { ...params.options, timeoutMs: DEFAULT_SCREEN_CAPTURE_TIMEOUT_MS },
  )
  return {
    base64: validateYeonjangScreenCaptureBinaryResult(remote),
    remote,
  }
}

export function statArtifactSize(filePath: string): number {
  return statSync(filePath).size
}
