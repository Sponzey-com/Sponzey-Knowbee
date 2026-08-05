import type { Logger } from "../logger/index.js";
import type { TypedObservabilityEvent } from "./typed-event-contract.js";
export interface TypedObservabilityLogReceipt {
    eventId: string;
    purpose: TypedObservabilityEvent["purpose"];
    written: true;
}
export declare function writeTypedObservabilityLog(logger: Pick<Logger, "product" | "fieldDebug" | "development">, event: TypedObservabilityEvent): TypedObservabilityLogReceipt;
//# sourceMappingURL=typed-event-logger.d.ts.map