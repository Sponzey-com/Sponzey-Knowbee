export interface MqttClientErrorLogDecision {
    readonly emit: boolean;
    readonly suppressed: number;
}
export interface MqttClientErrorLogThrottle {
    admit(key: string): MqttClientErrorLogDecision;
    clear(): void;
    size(): number;
}
/**
 * Bounds repeated diagnostic logs without changing transport or workflow
 * state. The broker owns and clears this process-local projection.
 */
export declare function createMqttClientErrorLogThrottle(input: {
    readonly windowMs: number;
    readonly maxKeys: number;
    readonly nowMs?: () => number;
}): MqttClientErrorLogThrottle;
//# sourceMappingURL=client-error-log-throttle.d.ts.map