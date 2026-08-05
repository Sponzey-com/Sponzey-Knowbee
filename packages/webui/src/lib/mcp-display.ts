type TextFn = (ko: string, en: string) => string

export function describeMcpConnectionTarget(transport: string, text: TextFn): string {
  if (transport === "http") {
    return text("네트워크 연결", "Network connection")
  }
  return text("로컬 실행 연결", "Local process connection")
}

export function formatExternalToolDisplayName(rawName: string, fallbackIndex: number, text: TextFn): string {
  const cleaned = rawName
    .trim()
    .replace(/^mcp__[A-Za-z0-9_-]+__/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) {
    return text(`외부 도구 ${fallbackIndex}`, `External tool ${fallbackIndex}`)
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}
