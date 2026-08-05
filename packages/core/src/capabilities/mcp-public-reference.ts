import { createHash } from "node:crypto"

const MCP_PUBLIC_REF_NAMESPACE = "knowbee:mcp:v1:"

export function createMcpPublicRef(mcpServerId: string): string {
  if (!mcpServerId.trim()) throw new Error("mcp_public_ref_source_invalid")
  const digest = createHash("sha256")
    .update(MCP_PUBLIC_REF_NAMESPACE)
    .update(mcpServerId)
    .digest("hex")
    .slice(0, 24)
  return `mcp_v1_${digest}`
}
