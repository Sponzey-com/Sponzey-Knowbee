import type { ToolEvidenceSourceKind, ToolResult } from "./types.js"

export function resolveLocalOrYeonjangEvidenceSourceKind(
  result: Readonly<ToolResult>,
): ToolEvidenceSourceKind {
  if (!result.details || typeof result.details !== "object") return "tool"
  return (result.details as { via?: unknown }).via === "yeonjang" ? "yeonjang" : "tool"
}
