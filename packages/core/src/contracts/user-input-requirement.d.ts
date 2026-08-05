export declare const USER_INPUT_RESOLUTION_KINDS: readonly ["provide_value", "choose_option", "confirm_scope"];
export type UserInputResolutionKind = (typeof USER_INPUT_RESOLUTION_KINDS)[number];
export interface UserInputRequirement {
    resolutionKind: UserInputResolutionKind;
    missingFields: string[];
}
export declare function parseUserInputRequirement(value: unknown): UserInputRequirement | null;
//# sourceMappingURL=user-input-requirement.d.ts.map