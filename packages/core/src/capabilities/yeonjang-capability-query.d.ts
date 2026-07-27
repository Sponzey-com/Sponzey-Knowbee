import type { YeonjangCapabilityItem, YeonjangCapabilityProjection, YeonjangCapabilityStatus } from "./yeonjang-capability-projection.js";
export interface YeonjangCapabilityQueryInput {
    search?: string;
    location?: YeonjangCapabilityItem["location"];
    platform?: YeonjangCapabilityItem["platform"];
    status?: YeonjangCapabilityStatus;
    cursor?: string;
    limit?: number;
}
export interface YeonjangCapabilityPage {
    items: YeonjangCapabilityItem[];
    nextCursor: string | null;
    cursorValid: boolean;
    totalMatches: number;
    summary: YeonjangCapabilityProjection["summary"];
    observedAt: number;
}
export declare function queryYeonjangCapabilityCatalog(projection: YeonjangCapabilityProjection, input?: YeonjangCapabilityQueryInput): YeonjangCapabilityPage;
export declare function resolveYeonjangCapabilityDetail(projection: YeonjangCapabilityProjection, yeonjangRef: string): YeonjangCapabilityItem | null;
//# sourceMappingURL=yeonjang-capability-query.d.ts.map