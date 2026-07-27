export interface IntakeMethodConstraints {
    requestedMethods: string[];
    exclusiveMethods: string[];
    targetId?: string | undefined;
}
export type IntakeMethodConstraintsResult = {
    ok: true;
    constraints: IntakeMethodConstraints;
} | {
    ok: false;
    reasonCode: "method_constraints_malformed" | "method_identifier_invalid" | "target_instance_conflict";
};
export declare function extractIntakeMethodConstraints(actions: Array<{
    payload: Record<string, unknown>;
}>): IntakeMethodConstraintsResult;
//# sourceMappingURL=intake-method-constraints.d.ts.map