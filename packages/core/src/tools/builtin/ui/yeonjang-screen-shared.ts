import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { PATHS } from "../../../config/index.js"
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
  failureKind?: "path_bug" | "timeout" | "remote_failure"
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

export function saveInlineScreenCapture(base64: string, mimeType?: string, rootDir = join(PATHS.stateDir, "artifacts", "screens")): string {
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
  return {
    success: false,
    output: `이 작업은 Yeonjang 연장을 통해서만 실행할 수 있습니다. 현재 연결된 연장이 \`${method}\` 메서드를 지원하지 않거나 연결되어 있지 않습니다.`,
    error: "YEONJANG_REQUIRED",
    details: {
      requiredExecutor: "yeonjang",
      requiredMethod: method,
    },
  }
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

    const base64Support = doesYeonjangCapabilitySupportOutputMode(capabilities, method, "base64")
    if (base64Support === false) return yeonjangOutputModeFailure(method, "base64")
    if (base64Support === null) return yeonjangOutputModeUnknownFailure(method, "base64")
    return null
  } catch (error) {
    if (isYeonjangUnavailableError(error)) return yeonjangRequiredFailure(method)
    throw error
  }
}

export function classifyYeonjangScreenCaptureFailure(message: string): {
  code: string
  output: string
  details: ScreenCaptureFailureDetails
} {
  if (/(getdirectoryname|output path is empty|argumentexception|directory name is invalid)/i.test(message)
    || /디렉터리 이름이 올바르지|경로 처리/.test(message)) {
    return {
      code: "YEONJANG_SCREEN_CAPTURE_PATH_BUG",
      output: [
        "Windows 연장의 `screen.capture` 내부 경로 처리 오류 때문에 화면 캡처가 실패했습니다.",
        "이 문제는 다른 도구 조합으로 우회하기보다 Windows Yeonjang을 최신 버전으로 다시 빌드하고 재시작해야 해결됩니다.",
        "Windows에서 `build-yeonjang-windows.bat`로 재빌드하고 `start-yeonjang-windows.bat --restart` 후 다시 시도해 주세요.",
      ].join("\n"),
      details: {
        via: "yeonjang",
        stopAfterFailure: true,
        failureKind: "path_bug",
      },
    }
  }

  if (/(응답 시간이 초과되었습니다|연결 시간이 초과되었습니다|timed out|timeout)/i.test(message)) {
    return {
      code: "YEONJANG_SCREEN_CAPTURE_TIMEOUT",
      output: [
        "연장의 화면 캡처가 제한 시간 안에 끝나지 않았습니다.",
        "Windows Yeonjang을 다시 시작한 뒤 다시 시도해 주세요.",
      ].join("\n"),
      details: {
        via: "yeonjang",
        stopAfterFailure: true,
        failureKind: "timeout",
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
