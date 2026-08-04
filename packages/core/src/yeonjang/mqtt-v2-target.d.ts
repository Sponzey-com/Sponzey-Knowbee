export interface YeonjangMqttV2TargetSnapshot {
    readonly extensionId: string;
    readonly nodeId?: string | null;
    readonly instanceId?: string | null;
    readonly sessionId?: string | null;
    readonly protocolVersion?: string | null;
    readonly state?: string | null;
    readonly targetFingerprint?: string | null;
}
export type YeonjangMqttV2TargetResolution = {
    readonly ok: true;
    readonly target: {
        readonly instanceId: string;
        readonly sessionId: string;
        readonly targetFingerprint: string;
    };
} | {
    readonly ok: false;
    readonly reasonCode: "yeonjang_v2_target_not_found" | "yeonjang_v2_target_ambiguous" | "yeonjang_v2_target_offline" | "yeonjang_v2_target_session_mismatch" | "yeonjang_v2_target_projection_incomplete";
};
/** Resolves one exact signed v2 projection without inventing a default target. */
export declare function resolveYeonjangMqttV2Target(input: {
    readonly snapshots: readonly YeonjangMqttV2TargetSnapshot[];
    readonly requestedExtensionId: string;
    readonly expectedSessionId?: string;
}): YeonjangMqttV2TargetResolution;
//# sourceMappingURL=mqtt-v2-target.d.ts.map