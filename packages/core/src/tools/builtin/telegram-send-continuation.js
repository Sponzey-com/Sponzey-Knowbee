export function createTelegramSendContinuationAdapter(input) {
    const adapter = {
        toolName: "telegram_send_file",
        async execute({ continuation, signal, }) {
            if (signal.aborted) {
                return {
                    status: "cancelled",
                    reasonCode: "approval_continuation_cancelled",
                };
            }
            const candidate = input.candidates().find((entry) => {
                const projected = input.projectOperation(entry);
                return (projected !== null
                    && projected.operationId === continuation.operationId
                    && projected.operationBindingHash
                        === continuation.operationBindingHash);
            });
            if (!candidate) {
                return {
                    status: "blocked",
                    reasonCode: "telegram_delivery_continuation_binding_not_rehydratable",
                };
            }
            return input.execute(candidate, continuation, signal);
        },
    };
    return Object.freeze(adapter);
}
//# sourceMappingURL=telegram-send-continuation.js.map