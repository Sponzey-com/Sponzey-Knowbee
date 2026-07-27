import {
  type McpConnectionDraft,
  type McpConnectionValidationResult,
  validateMcpConnectionDraft,
} from "./mcp-connection-validation.js"

export interface McpProtectedUpdateChange {
  displayName?: string
  required?: boolean
  replacement?: {
    transport: "stdio" | "http"
    command: string
    args: readonly string[]
    cwd: string
    url?: string
  }
}

const CHANGE_FIELDS = new Set(["displayName", "required", "replacement"])
const REPLACEMENT_FIELDS = new Set(["transport", "command", "args", "cwd", "url"])
const REQUIRED_REPLACEMENT_FIELDS = ["transport", "command", "args", "cwd"] as const

export function validateMcpProtectedUpdateShape(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return "mcp_update_change_invalid"
  const change = input as Record<string, unknown>
  if (Object.keys(change).some((key) => !CHANGE_FIELDS.has(key)))
    return "mcp_update_change_field_unknown"
  if (change.displayName !== undefined && typeof change.displayName !== "string")
    return "mcp_display_name_invalid"
  if (change.required !== undefined && typeof change.required !== "boolean")
    return "mcp_required_invalid"
  if (change.replacement !== undefined) {
    if (
      !change.replacement ||
      typeof change.replacement !== "object" ||
      Array.isArray(change.replacement)
    )
      return "mcp_replacement_invalid"
    const replacement = change.replacement as Record<string, unknown>
    if (
      Object.keys(replacement).some((key) => !REPLACEMENT_FIELDS.has(key)) ||
      REQUIRED_REPLACEMENT_FIELDS.some((key) => !(key in replacement))
    )
      return "mcp_replacement_invalid"
  }
  return null
}

export function mergeMcpProtectedUpdate(
  current: McpConnectionDraft,
  input: unknown,
): McpConnectionValidationResult {
  const shapeReason = validateMcpProtectedUpdateShape(input)
  if (shapeReason) return { valid: false, reasonCodes: [shapeReason] }
  const change = input as Record<string, unknown>
  let connection: Pick<McpConnectionDraft, "transport" | "command" | "args" | "cwd" | "url"> =
    current
  if (change.replacement !== undefined) {
    const replacement = change.replacement as Record<string, unknown>
    connection = replacement as unknown as typeof connection
  }
  return validateMcpConnectionDraft({
    displayName: change.displayName ?? current.displayName,
    required: change.required ?? current.required,
    transport: connection.transport,
    command: connection.command,
    args: connection.args,
    cwd: connection.cwd,
    ...(connection.url !== undefined ? { url: connection.url } : {}),
  })
}
