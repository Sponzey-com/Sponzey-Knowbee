export type YeonjangTargetSelectorType = "local" | "instance_id" | "instance_alias" | "call_name" | "all_online" | "filtered_group";
export type YeonjangTargetSelectorLocation = "local" | "remote";
export type YeonjangTargetSelectorState = "discovered" | "online" | "degraded" | "offline" | "update_required" | "permission_required";
export interface YeonjangTargetSelectorLocal {
    type: "local";
}
export interface YeonjangTargetSelectorByInstanceId {
    type: "instance_id";
    instanceId: string;
}
export interface YeonjangTargetSelectorByInstanceAlias {
    type: "instance_alias";
    instanceAlias: string;
}
export interface YeonjangTargetSelectorByCallName {
    type: "call_name";
    callName: string;
}
export interface YeonjangTargetSelectorAllOnline {
    type: "all_online";
}
export interface YeonjangTargetSelectorFilteredGroup {
    type: "filtered_group";
    location?: YeonjangTargetSelectorLocation;
    supportProfiles?: string[];
    platforms?: string[];
    states?: YeonjangTargetSelectorState[];
}
export type YeonjangTargetSelector = YeonjangTargetSelectorLocal | YeonjangTargetSelectorByInstanceId | YeonjangTargetSelectorByInstanceAlias | YeonjangTargetSelectorByCallName | YeonjangTargetSelectorAllOnline | YeonjangTargetSelectorFilteredGroup;
export interface YeonjangTargetSelectorValidationIssue {
    path: string;
    code: "contract_validation_failed";
    message: string;
}
export type YeonjangTargetSelectorValidationResult = {
    ok: true;
    value: YeonjangTargetSelector;
    issues: [];
} | {
    ok: false;
    issues: YeonjangTargetSelectorValidationIssue[];
};
export declare function isStructuredYeonjangTargetSelector(value: unknown): value is YeonjangTargetSelector;
export declare function validateYeonjangTargetSelector(value: unknown): YeonjangTargetSelectorValidationResult;
export declare function normalizeYeonjangTargetSelector(selector: YeonjangTargetSelector): YeonjangTargetSelector;
export declare function serializeYeonjangTargetSelector(selector: YeonjangTargetSelector): string;
export declare function buildYeonjangTargetSelectorSchemaProperty(): Record<string, unknown>;
//# sourceMappingURL=yeonjang-target.d.ts.map