type TextFn = (ko: string, en: string) => string

const SENSITIVE_KEY_PATTERN = /(token|secret|password|api[-_]?key|authorization|cookie|credential|fingerprint|hash|session|client|private|workspace|scope|path|file|url|uri|id)$/i
const SENSITIVE_VALUE_PATTERN = /(Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9._-]+|xox[baprs]-[A-Za-z0-9._-]+|\/Users\/[^\s"']+|[A-Za-z]:\\[^\s"']+)/i

export function describeApprovalToolName(toolName: string, text: TextFn): string {
  switch (toolName) {
    case "yeonjang_camera_capture":
      return text("카메라 촬영", "Camera capture")
    case "telegram_send_file":
      return text("Telegram 파일 전달", "Telegram file delivery")
    case "screen_capture":
    case "screencapture":
      return text("화면 캡처", "Screen capture")
    case "shell_exec":
    case "local_shell":
    case "system.exec":
      return text("터미널 명령 실행", "Terminal command execution")
    case "file_write":
    case "write_file":
      return text("파일 쓰기", "File write")
    case "file_read":
    case "read_file":
      return text("파일 읽기", "File read")
    case "app_launch":
      return text("앱 실행", "App launch")
    case "mouse_click":
      return text("마우스 클릭", "Mouse click")
    case "keyboard_type":
      return text("키보드 입력", "Keyboard input")
    case "web_fetch":
      return text("웹 페이지 조회", "Web page lookup")
    default:
      return text("외부 도구 실행", "External tool execution")
  }
}

export function approvalRemainingSeconds(
  expiresAt: number | null | undefined,
  now = Date.now(),
): number | null {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null
  return Math.max(0, Math.ceil((expiresAt - now) / 1_000))
}

export function buildApprovalScopeSummary(input: {
  toolName: string
  params: unknown
  expiresAt?: number | null | undefined
  now?: number | undefined
}, text: TextFn): string[] {
  const operation = input.toolName === "yeonjang_camera_capture"
    ? text("작업 범위: 카메라 촬영", "Operation scope: camera capture")
    : input.toolName === "telegram_send_file"
      ? text(
          "작업 범위: Telegram 외부 파일 전달",
          "Operation scope: Telegram external file delivery",
        )
      : text("작업 범위: 외부 도구 실행", "Operation scope: external tool execution")
  const lines = [operation]
  if (hasAnyKey(input.params, /^(extensionId|targetId|clientId)$/i)) {
    lines.push(
      text(
        "정확한 외부 대상에 결속됨(대상 식별값 숨김)",
        "Bound to one exact external target (target identifier hidden)",
      ),
    )
  }
  const remainingSeconds = approvalRemainingSeconds(input.expiresAt, input.now)
  if (remainingSeconds !== null) {
    lines.push(
      text(
        `승인 만료까지 ${remainingSeconds}초`,
        `${remainingSeconds}s until approval expires`,
      ),
    )
  }
  return lines
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function countParamLeaves(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + countParamLeaves(item), 0)
  }
  if (isPlainObject(value)) {
    return Object.values(value).reduce((count, item) => count + countParamLeaves(item), 0)
  }
  return value == null ? 0 : 1
}

function countSensitiveValues(value: unknown, keyHint = ""): number {
  const keySensitive = SENSITIVE_KEY_PATTERN.test(keyHint)
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + countSensitiveValues(item, keyHint), 0)
  }
  if (isPlainObject(value)) {
    return Object.entries(value).reduce(
      (count, [key, item]) => count + countSensitiveValues(item, key),
      0,
    )
  }
  if (value == null) return 0
  if (keySensitive) return 1
  if (typeof value === "string" && (value.length > 80 || SENSITIVE_VALUE_PATTERN.test(value))) {
    return 1
  }
  return 0
}

function hasAnyKey(value: unknown, pattern: RegExp): boolean {
  if (Array.isArray(value)) return value.some((item) => hasAnyKey(item, pattern))
  if (!isPlainObject(value)) return false
  return Object.entries(value).some(([key, item]) => pattern.test(key) || hasAnyKey(item, pattern))
}

export function buildApprovalParamSummary(params: unknown, text: TextFn): string[] {
  const inputCount = countParamLeaves(params)
  const sensitiveCount = countSensitiveValues(params)
  const lines = [
    inputCount > 0
      ? text(`입력 항목 ${inputCount}개`, `${inputCount} input items`)
      : text("추가 입력값 없음", "No extra input values"),
  ]

  if (hasAnyKey(params, /(command|cmd|shell|script)/i)) {
    lines.push(text("명령 실행 세부값은 숨김", "Command execution details hidden"))
  }
  if (hasAnyKey(params, /(path|file|directory|workspace)/i)) {
    lines.push(text("파일 또는 폴더 위치는 숨김", "File or folder locations hidden"))
  }
  if (hasAnyKey(params, /(url|uri|endpoint|host)/i)) {
    lines.push(text("외부 주소 세부값은 숨김", "External address details hidden"))
  }
  if (sensitiveCount > 0) {
    lines.push(text(`민감하거나 긴 값 ${sensitiveCount}개 숨김`, `${sensitiveCount} sensitive or long values hidden`))
  }

  return lines
}

export function buildToolResultSummary(
  result: unknown,
  success: boolean | undefined,
  text: TextFn,
): string[] {
  if (result == null || result === "") {
    return [text("결과 기록 없음", "No result recorded")]
  }

  const sensitiveCount = countSensitiveValues(result)
  const resultText = typeof result === "string" ? result : ""
  const lines = [
    success === false
      ? text("오류 기록 있음", "Error recorded")
      : text("결과 기록 있음", "Result recorded"),
  ]

  if (typeof result !== "string") {
    lines.push(text(`결과 항목 ${countParamLeaves(result)}개`, `${countParamLeaves(result)} result items`))
  }
  if (resultText.length > 160) {
    lines.push(text("긴 결과 내용은 숨김", "Long result content hidden"))
  }
  if (sensitiveCount > 0) {
    lines.push(text(`민감하거나 긴 값 ${sensitiveCount}개 숨김`, `${sensitiveCount} sensitive or long values hidden`))
  }

  return lines
}
