import { createHash } from "node:crypto"

const AGENT_PUBLIC_REF_NAMESPACE = "knowbee:agent:v1:"

export function createAgentPublicRef(agentId: string): string {
  if (!agentId.trim()) throw new Error("agent_public_ref_source_invalid")
  const digest = createHash("sha256")
    .update(AGENT_PUBLIC_REF_NAMESPACE)
    .update(agentId)
    .digest("hex")
    .slice(0, 24)
  return `agent_v1_${digest}`
}
