import { providerFailureReasonCode, } from "./provider-failure.js";
const textEncoder = new TextEncoder();
function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${label} must be a positive safe integer`);
    }
}
function encodedToolInputBytes(input) {
    try {
        return textEncoder.encode(JSON.stringify(input)).byteLength;
    }
    catch {
        return Number.POSITIVE_INFINITY;
    }
}
export async function collectBoundedChatAttempt(input) {
    requirePositiveInteger(input.deadlineMs, "deadlineMs");
    requirePositiveInteger(input.maxTextBytes, "maxTextBytes");
    requirePositiveInteger(input.maxToolInputBytes, "maxToolInputBytes");
    if (input.signal?.aborted)
        return { status: "cancelled" };
    const controller = new AbortController();
    let timedOut = false;
    let callerCancelled = false;
    const cancelFromCaller = () => {
        callerCancelled = true;
        controller.abort();
    };
    input.signal?.addEventListener("abort", cancelFromCaller, { once: true });
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, input.deadlineMs);
    let iterator;
    let resolveAborted;
    const aborted = new Promise((resolve) => {
        resolveAborted = resolve;
    });
    const notifyAborted = () => resolveAborted?.();
    controller.signal.addEventListener("abort", notifyAborted, { once: true });
    try {
        iterator = input.stream(controller.signal)[Symbol.asyncIterator]();
        const chunks = [];
        let textBytes = 0;
        let toolInputBytes = 0;
        while (true) {
            const next = iterator.next().then((value) => ({ kind: "chunk", value }), (failure) => ({ kind: "error", failure }));
            const outcome = await Promise.race([
                next,
                aborted.then(() => ({ kind: "aborted" })),
            ]);
            if (outcome.kind === "aborted") {
                void iterator.return?.().catch(() => undefined);
                return { status: timedOut ? "timed_out" : "cancelled" };
            }
            if (outcome.kind === "error") {
                if (timedOut)
                    return { status: "timed_out" };
                if (callerCancelled)
                    return { status: "cancelled" };
                return {
                    status: "provider_failed",
                    reasonCode: providerFailureReasonCode(outcome.failure),
                };
            }
            if (outcome.value.done)
                return { status: "completed", chunks };
            const chunk = outcome.value.value;
            if (chunk.type === "text_delta") {
                textBytes += textEncoder.encode(chunk.delta).byteLength;
            }
            else if (chunk.type === "tool_use") {
                toolInputBytes += encodedToolInputBytes(chunk.input);
            }
            if (textBytes > input.maxTextBytes || toolInputBytes > input.maxToolInputBytes) {
                controller.abort();
                void iterator.return?.().catch(() => undefined);
                return { status: "output_limit_exceeded" };
            }
            chunks.push(chunk);
        }
    }
    catch (failure) {
        if (timedOut)
            return { status: "timed_out" };
        if (callerCancelled)
            return { status: "cancelled" };
        return {
            status: "provider_failed",
            reasonCode: providerFailureReasonCode(failure),
        };
    }
    finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener("abort", cancelFromCaller);
        controller.signal.removeEventListener("abort", notifyAborted);
    }
}
//# sourceMappingURL=bounded-chat-attempt.js.map