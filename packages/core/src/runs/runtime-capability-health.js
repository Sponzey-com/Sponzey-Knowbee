export function projectMcpRuntimeHealthObservations(input) {
    return input.statuses.flatMap((status) => status.tools.map((tool) => ({
        capabilityId: tool.registeredName,
        targetId: `mcp:${status.name}`,
        status: status.ready ? "ready" : "unavailable",
        observedAt: input.observedAt,
        expiresAt: input.observedAt,
        reasonCodes: status.ready ? [] : ["mcp_server_not_ready"],
    })));
}
export function projectYeonjangRuntimeHealthObservations(input) {
    const capabilities = input.tools
        .filter((tool) => tool.runtimeHealthMode !== undefined)
        .map((tool) => {
        const capabilityId = tool.name.trim();
        const rawMethodIds = tool.runtimeMethodIds ?? [];
        const methodIds = rawMethodIds.map((methodId) => methodId.trim());
        if (!capabilityId || methodIds.length === 0 || methodIds.some((methodId) => !methodId)) {
            throw new Error(`Yeonjang runtime method IDs are required for capability: ${capabilityId}`);
        }
        if (new Set(methodIds).size !== methodIds.length) {
            throw new Error(`Duplicate Yeonjang runtime method ID for capability: ${capabilityId}`);
        }
        return { capabilityId, methodIds };
    });
    const methodsByInstance = new Map();
    for (const snapshot of input.methodSnapshots) {
        const instanceId = snapshot.instanceId.trim();
        if (!instanceId)
            throw new Error("Yeonjang method snapshot instance ID is required");
        if (methodsByInstance.has(instanceId)) {
            throw new Error(`Duplicate Yeonjang method snapshot for instance: ${instanceId}`);
        }
        methodsByInstance.set(instanceId, {
            methods: new Set(snapshot.methods.map((methodId) => methodId.trim()).filter(Boolean)),
            toolHealth: snapshot.toolHealth,
        });
    }
    return input.instances.flatMap((instance) => capabilities.map(({ capabilityId, methodIds }) => {
        const snapshot = methodsByInstance.get(instance.instanceId);
        const supportedMethodIds = methodIds.filter((methodId) => snapshot?.methods.has(methodId));
        const healthStatuses = supportedMethodIds.map((methodId) => {
            const health = snapshot?.toolHealth?.[methodId];
            if (!health || typeof health !== "object" || Array.isArray(health))
                return null;
            const status = health["status"];
            return typeof status === "string" ? status.trim().toLowerCase() : null;
        });
        const methodSupported = supportedMethodIds.length > 0;
        const permissionDisabled = methodSupported
            && healthStatuses.every((status) => status === "permission_disabled");
        const methodReady = methodSupported
            && healthStatuses.some((status) => status === null
                || status === "ok"
                || status === "ready"
                || status === "healthy"
                || status === "warning");
        const ready = instance.runnableTarget && methodReady;
        return {
            capabilityId,
            targetId: `yeonjang:${instance.instanceId}`,
            status: ready ? "ready" : "unavailable",
            observedAt: input.observedAt,
            expiresAt: input.observedAt,
            reasonCodes: ready
                ? []
                : !instance.runnableTarget
                    ? instance.runnableReasonCodes.length > 0
                        ? [...instance.runnableReasonCodes]
                        : ["yeonjang_target_unavailable"]
                    : !methodSupported
                        ? ["yeonjang_method_unsupported"]
                        : permissionDisabled
                            ? ["yeonjang_method_permission_disabled"]
                            : ["yeonjang_method_unavailable"],
        };
    }));
}
//# sourceMappingURL=runtime-capability-health.js.map