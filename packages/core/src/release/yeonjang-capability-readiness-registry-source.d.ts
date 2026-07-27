import type Database from "better-sqlite3";
import type { YeonjangCapabilityReadinessObservation } from "./yeonjang-capability-readiness-collector.js";
export interface CollectYeonjangCapabilityReadinessObservationsFromRegistryInput {
    requiredMethods: readonly string[];
    now: number;
    db?: Database.Database;
}
export declare function collectYeonjangCapabilityReadinessObservationsFromRegistry(input: CollectYeonjangCapabilityReadinessObservationsFromRegistryInput): YeonjangCapabilityReadinessObservation[];
//# sourceMappingURL=yeonjang-capability-readiness-registry-source.d.ts.map