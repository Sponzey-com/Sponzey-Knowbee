export type NextAttemptToolPolicy = {
    mode: "unconstrained";
} | {
    mode: "required";
    toolNames: string[];
} | {
    mode: "forbidden";
};
export declare function buildNextAttemptToolPolicy(input: {
    followupExecutionMode?: "tool" | "response_only" | undefined;
    requiredToolNames?: readonly string[] | undefined;
}): NextAttemptToolPolicy;
//# sourceMappingURL=next-attempt-tool-policy.d.ts.map