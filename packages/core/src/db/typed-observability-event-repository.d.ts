import { type TypedObservabilityEvent } from "../observability/typed-event-contract.js";
import type { TypedObservabilityEventRepository, TypedObservabilityRepositoryQuery, TypedObservabilityRepositorySnapshot } from "../observability/typed-event-repository.js";
export declare class SqliteTypedObservabilityEventRepository implements TypedObservabilityEventRepository {
    append(event: TypedObservabilityEvent): {
        status: "rejected";
        reasonCode: import("../observability/typed-event-contract.js").TypedObservabilityEventRejectionReason;
    } | {
        status: "stored";
        inserted: boolean;
        eventId: string;
        reasonCode?: never;
    } | {
        status: "rejected";
        reasonCode: "event_id_conflict";
        inserted?: never;
        eventId?: never;
    };
    list(query: TypedObservabilityRepositoryQuery): TypedObservabilityRepositorySnapshot;
}
//# sourceMappingURL=typed-observability-event-repository.d.ts.map