export interface McpConnectionDraft {
  displayName: string
  transport: "stdio" | "http"
  command: string
  args: readonly string[]
  cwd: string
  url?: string
  required: boolean
}

export interface McpConnectionValidationResult {
  valid: boolean
  reasonCodes: string[]
  draft?: McpConnectionDraft
}

const ALLOWED_FIELDS = new Set([
  "displayName",
  "transport",
  "command",
  "args",
  "cwd",
  "url",
  "required",
])

function validateHttpUrl(value: string): string[] {
  if (!value) return ["mcp_url_missing"]
  if (value.length > 4096 || value.includes("\0") || /[\r\n]/u.test(value))
    return ["mcp_url_invalid"]
  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    return ["mcp_url_invalid"]
  }
  const reasons: string[] = []
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:")
    reasons.push("mcp_url_protocol_invalid")
  if (endpoint.username || endpoint.password) reasons.push("mcp_url_credentials_forbidden")
  if (endpoint.hash) reasons.push("mcp_url_fragment_forbidden")
  return reasons
}

export function validateMcpConnectionDraft(input: unknown): McpConnectionValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { valid: false, reasonCodes: ["mcp_draft_invalid"] }
  const record = input as Record<string, unknown>
  const reasons: string[] = []
  if (Object.keys(record).some((key) => !ALLOWED_FIELDS.has(key)))
    reasons.push("mcp_draft_field_unknown")
  const displayName = typeof record.displayName === "string" ? record.displayName.trim() : ""
  if (!displayName) reasons.push("mcp_display_name_missing")
  else if (displayName.length > 80) reasons.push("mcp_display_name_too_long")
  const transport = record.transport
  if (transport !== "stdio" && transport !== "http") reasons.push("mcp_transport_invalid")
  const command = typeof record.command === "string" ? record.command.trim() : ""
  if (transport === "stdio" && !command) reasons.push("mcp_command_missing")
  else if (command.includes("\0") || /[\r\n]/.test(command) || command.length > 4096)
    reasons.push("mcp_command_invalid")
  const rawArgs = record.args
  const argsValid =
    Array.isArray(rawArgs) &&
    rawArgs.every(
      (value) => typeof value === "string" && !value.includes("\0") && value.length <= 4096,
    ) &&
    rawArgs.length <= 128
  if (!argsValid) reasons.push("mcp_args_invalid")
  const args = argsValid ? (rawArgs as string[]).map((value) => value.trim()).filter(Boolean) : []
  const cwd = typeof record.cwd === "string" ? record.cwd.trim() : ""
  if (
    typeof record.cwd !== "string" ||
    cwd.includes("\0") ||
    /[\r\n]/.test(cwd) ||
    cwd.length > 4096
  )
    reasons.push("mcp_cwd_invalid")
  const url = typeof record.url === "string" ? record.url.trim() : ""
  if (record.url !== undefined && typeof record.url !== "string") reasons.push("mcp_url_invalid")
  if (transport === "http") {
    reasons.push(...validateHttpUrl(url))
    if (command || args.length > 0 || cwd) reasons.push("mcp_transport_fields_mixed")
  } else if (transport === "stdio" && url) reasons.push("mcp_transport_fields_mixed")
  if (typeof record.required !== "boolean") reasons.push("mcp_required_invalid")
  const reasonCodes = [...new Set(reasons)]
  if (reasonCodes.length > 0 || (transport !== "stdio" && transport !== "http"))
    return { valid: false, reasonCodes }
  const draft: McpConnectionDraft = Object.freeze({
    displayName,
    transport,
    command,
    args: Object.freeze(args),
    cwd,
    ...(transport === "http" ? { url } : {}),
    required: record.required as boolean,
  })
  return { valid: true, reasonCodes: [], draft }
}
