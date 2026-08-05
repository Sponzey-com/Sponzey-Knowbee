export function createSlackLiveSmokeEvidenceReader(dependencies) {
    return (run, target) => {
        const events = dependencies
            .listMessageLedgerEvents({ runId: run.id, limit: 1_000 })
            .filter((event) => event.run_id === run.id &&
            event.request_group_id === run.requestGroupId &&
            event.channel === "slack");
        const refs = dependencies
            .listChannelMessageRefsForRun(run.id)
            .filter((ref) => ref.root_run_id === run.id &&
            ref.request_group_id === run.requestGroupId &&
            ref.source === "slack" &&
            ref.role === "assistant");
        const providerMessageIds = events.flatMap((event) => {
            if (event.event_kind !== "text_delivered" ||
                (event.status !== "delivered" && event.status !== "succeeded")) {
                return [];
            }
            const detail = safeObject(event.detail_json);
            const receipts = Array.isArray(detail?.deliveryReceipts) ? detail.deliveryReceipts : [];
            return receipts.flatMap((value) => {
                const receipt = objectValue(value);
                return receipt?.provider === "slack" &&
                    (receipt.status === "sent" || receipt.status === "delivered") &&
                    typeof receipt.messageId === "string" &&
                    receipt.messageId.trim()
                    ? [receipt.messageId.trim()]
                    : [];
            });
        });
        const targetMatched = providerMessageIds.some((messageId) => refs.some((ref) => ref.external_chat_id === target.channelId &&
            ref.external_thread_id === (target.threadTs ?? null) &&
            ref.external_message_id === messageId));
        const userReportDelivered = events.some((event) => event.event_kind === "final_answer_delivered" &&
            (event.status === "delivered" || event.status === "succeeded") &&
            safeObject(event.detail_json)?.providerEvidence === "confirmed");
        return {
            providerDeliveryReceipted: providerMessageIds.length > 0,
            targetMatched,
            userReportDelivered,
        };
    };
}
function objectValue(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function safeObject(value) {
    if (!value)
        return undefined;
    try {
        return objectValue(JSON.parse(value));
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=slack-live-smoke-evidence.js.map