import { getMqttBrokerSnapshot, getMqttExtensionSnapshots } from "../../mqtt/broker.js";
function isConnected(state) {
    return (state ?? "").trim().toLowerCase() !== "offline";
}
function displayName(extension) {
    return extension.displayName?.trim()
        || extension.instanceAlias?.trim()
        || extension.extensionId;
}
export const yeonjangStatusTool = {
    evidenceSourceKind: "yeonjang",
    name: "yeonjang_status",
    description: "Inspect the built-in Yeonjang skill. Call this before answering questions about Yeonjang connectivity, availability, status, registered instances, connected instances, or instance count.",
    parameters: {
        type: "object",
        properties: {},
        required: [],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute() {
        const broker = getMqttBrokerSnapshot();
        const snapshots = getMqttExtensionSnapshots();
        const connected = snapshots.filter((extension) => isConnected(extension.state));
        const lines = [
            `연장 브로커: ${broker.running ? "실행 중" : "중지됨"}`,
            `연결된 연장: ${connected.length}개 / 등록된 연장: ${snapshots.length}개`,
        ];
        if (snapshots.length === 0) {
            lines.push("연결된 연장이 없습니다.");
            if (broker.reason)
                lines.push(`상태 이유: ${broker.reason}`);
        }
        else {
            for (const extension of snapshots) {
                const parts = [
                    displayName(extension),
                    `상태=${extension.state ?? "unknown"}`,
                    extension.platform ? `플랫폼=${extension.platform}` : "",
                    extension.version ? `버전=${extension.version}` : "",
                    extension.trustState ? `신뢰=${extension.trustState}` : "",
                    `기능=${extension.methods.length}개`,
                    `마지막 확인=${new Date(extension.lastSeenAt).toISOString()}`,
                ].filter(Boolean);
                lines.push(`- ${parts.join(" · ")}`);
            }
        }
        return {
            success: true,
            output: lines.join("\n"),
            details: {
                via: "yeonjang",
                skillId: "skill:yeonjang",
                broker: {
                    enabled: broker.enabled,
                    running: broker.running,
                    clientCount: broker.clientCount,
                    reason: broker.reason,
                },
                connectedCount: connected.length,
                totalCount: snapshots.length,
                instances: snapshots.map((extension) => ({
                    extensionId: extension.extensionId,
                    displayName: displayName(extension),
                    state: extension.state ?? "unknown",
                    platform: extension.platform,
                    version: extension.version,
                    trustState: extension.trustState,
                    methodCount: extension.methods.length,
                    lastSeenAt: extension.lastSeenAt,
                })),
            },
        };
    },
};
//# sourceMappingURL=yeonjang-status.js.map