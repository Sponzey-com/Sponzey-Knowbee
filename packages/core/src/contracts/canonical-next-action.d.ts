export interface CanonicalModelToolUse {
    readonly id: string;
    readonly name: string;
    readonly input: Readonly<Record<string, unknown>>;
}
export type CanonicalExecutionNextAction = Readonly<{
    kind: "response_only";
}> | Readonly<{
    kind: "execute_tool";
    toolUseId: string;
    toolName: string;
    input: Readonly<Record<string, unknown>>;
}>;
export type CanonicalExecutionNextActionAdmission = Readonly<{
    ok: true;
    action: CanonicalExecutionNextAction;
}> | Readonly<{
    ok: false;
    reasonCode: "canonical_next_action_multiple_tools" | "canonical_next_action_tool_invalid";
}>;
export declare function admitCanonicalExecutionNextAction(toolUses: readonly Readonly<{
    id: unknown;
    name: unknown;
    input: unknown;
}>[]): CanonicalExecutionNextActionAdmission;
//# sourceMappingURL=canonical-next-action.d.ts.map