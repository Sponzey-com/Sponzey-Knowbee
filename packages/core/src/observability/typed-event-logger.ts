import type { Logger } from "../logger/index.js"
import type { TypedObservabilityEvent } from "./typed-event-contract.js"

export interface TypedObservabilityLogReceipt {
  eventId: string
  purpose: TypedObservabilityEvent["purpose"]
  written: true
}

export function writeTypedObservabilityLog(
  logger: Pick<Logger, "product" | "fieldDebug" | "development">,
  event: TypedObservabilityEvent,
): TypedObservabilityLogReceipt {
  const message = `${event.kind}: ${event.summary}`
  const boundedContext = {
    eventId: event.eventId,
    reasonCode: event.reasonCode,
    correlation: event.correlation,
    ...(event.attributes ? { attributes: event.attributes } : {}),
  }

  if (event.purpose === "product") logger.product(message, boundedContext)
  else if (event.purpose === "field_debug") logger.fieldDebug(message, boundedContext)
  else logger.development(message, boundedContext)

  return { eventId: event.eventId, purpose: event.purpose, written: true }
}
