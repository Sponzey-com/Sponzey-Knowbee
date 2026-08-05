import { type YeonjangMqttV2Enrollment } from "./mqtt-v2-contract.js";
import type { YeonjangMqttV2ExpectedResponseIdentity, YeonjangMqttV2TerminalResult } from "./mqtt-v2-response.js";
export declare function createYeonjangMqttV2ResponseAck(input: {
    readonly enrollment: YeonjangMqttV2Enrollment;
    readonly targetFingerprint: string;
    readonly terminalIdentity: Omit<YeonjangMqttV2ExpectedResponseIdentity, "enrollment" | "targetFingerprint">;
    readonly terminal: Pick<YeonjangMqttV2TerminalResult, "receiptId" | "responseDigest" | "terminalRevision">;
    readonly identity: {
        readonly messageId: string;
        readonly requestId: string;
        readonly commandId: string;
        readonly operationId: string;
        readonly correlationId: string;
        readonly causationId: string;
        readonly idempotencyKey: string;
        readonly authorizationId: string;
        readonly nonce: string;
    };
    readonly issuedAt: number;
    readonly expiresAt: number;
    readonly sequence: number;
    readonly hmacKey: Uint8Array;
}): {
    readonly topic: string;
    readonly envelope: Readonly<Record<string, unknown>>;
};
export declare function admitYeonjangMqttV2ResponseAckResult(input: {
    readonly payload: Uint8Array;
    readonly nowMs: number;
    readonly hmacKey: Uint8Array;
    readonly expected: {
        readonly enrollment: YeonjangMqttV2Enrollment;
        readonly requestId: string;
        readonly commandId: string;
        readonly operationId: string;
        readonly idempotencyKey: string;
        readonly targetFingerprint: string;
        readonly receiptId: string;
        readonly targetRequestId: string;
        readonly targetCommandId: string;
        readonly targetOperationId: string;
        readonly targetIdempotencyKey: string;
        readonly terminalRevision: number;
        readonly responseDigest: string;
    };
}): {
    readonly ok: true;
    readonly outcome: "accepted" | "duplicate";
    readonly deliveryRevision: number | null;
} | {
    readonly ok: false;
    readonly reasonCode: string;
};
//# sourceMappingURL=mqtt-v2-response-ack.d.ts.map