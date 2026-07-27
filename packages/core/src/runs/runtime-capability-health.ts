import type { McpServerStatus } from "../mcp/registry.js"
import type { AnyTool } from "../tools/types.js"
import type { YeonjangRegistryInstanceView } from "../yeonjang/registry.js"
import type { CapabilityRuntimeHealthObservation } from "./canonical-capability-snapshot.js"

export function projectMcpRuntimeHealthObservations(input: {
  statuses: McpServerStatus[]
  observedAt: number
}): CapabilityRuntimeHealthObservation[] {
  return input.statuses.flatMap((status) =>
    status.tools.map((tool) => ({
      capabilityId: tool.registeredName,
      targetId: `mcp:${status.name}`,
      status: status.ready ? ("ready" as const) : ("unavailable" as const),
      observedAt: input.observedAt,
      expiresAt: input.observedAt,
      reasonCodes: status.ready ? [] : ["mcp_server_not_ready"],
    })),
  )
}

export function projectYeonjangRuntimeHealthObservations(input: {
  instances: YeonjangRegistryInstanceView[]
  tools: AnyTool[]
  methodSnapshots: Array<{ instanceId: string; methods: string[] }>
  observedAt: number
}): CapabilityRuntimeHealthObservation[] {
  const capabilities = input.tools
    .filter((tool) => tool.runtimeHealthMode !== undefined)
    .map((tool) => {
      const capabilityId = tool.name.trim()
      const rawMethodIds = tool.runtimeMethodIds ?? []
      const methodIds = rawMethodIds.map((methodId) => methodId.trim())
      if (!capabilityId || methodIds.length === 0 || methodIds.some((methodId) => !methodId)) {
        throw new Error(`Yeonjang runtime method IDs are required for capability: ${capabilityId}`)
      }
      if (new Set(methodIds).size !== methodIds.length) {
        throw new Error(`Duplicate Yeonjang runtime method ID for capability: ${capabilityId}`)
      }
      return { capabilityId, methodIds }
    })
  const methodsByInstance = new Map<string, Set<string>>()
  for (const snapshot of input.methodSnapshots) {
    const instanceId = snapshot.instanceId.trim()
    if (!instanceId) throw new Error("Yeonjang method snapshot instance ID is required")
    if (methodsByInstance.has(instanceId)) {
      throw new Error(`Duplicate Yeonjang method snapshot for instance: ${instanceId}`)
    }
    methodsByInstance.set(
      instanceId,
      new Set(snapshot.methods.map((methodId) => methodId.trim()).filter(Boolean)),
    )
  }
  return input.instances.flatMap((instance) =>
    capabilities.map(({ capabilityId, methodIds }) => {
      const supportedMethods = methodsByInstance.get(instance.instanceId) ?? new Set<string>()
      const methodSupported = methodIds.some((methodId) => supportedMethods.has(methodId))
      const ready = instance.runnableTarget && methodSupported
      return {
        capabilityId,
        targetId: `yeonjang:${instance.instanceId}`,
        status: ready ? ("ready" as const) : ("unavailable" as const),
        observedAt: input.observedAt,
        expiresAt: input.observedAt,
        reasonCodes: ready
          ? []
          : !instance.runnableTarget
            ? instance.runnableReasonCodes.length > 0
              ? [...instance.runnableReasonCodes]
              : ["yeonjang_target_unavailable"]
            : ["yeonjang_method_unsupported"],
      }
    }),
  )
}
