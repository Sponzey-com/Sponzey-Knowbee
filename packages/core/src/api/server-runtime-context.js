export function parseSlackLiveSmokeTarget(env) {
    const channelId = env.KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID?.trim();
    const userId = env.KNOWBEE_CHANNEL_SMOKE_SLACK_USER_ID?.trim();
    const threadTs = env.KNOWBEE_CHANNEL_SMOKE_SLACK_THREAD_TS?.trim();
    if (!channelId && !userId && !threadTs) {
        return { status: "unavailable", reasonCode: "not_configured" };
    }
    if (!channelId || !userId)
        return { status: "unavailable", reasonCode: "incomplete" };
    const identifier = /^[A-Z][A-Z0-9]{2,31}$/u;
    const timestamp = /^\d{10,16}\.\d{6}$/u;
    if (!identifier.test(channelId) ||
        !identifier.test(userId) ||
        (threadTs && !timestamp.test(threadTs))) {
        return { status: "unavailable", reasonCode: "invalid" };
    }
    return {
        status: "ready",
        target: Object.freeze({ channelId, userId, ...(threadTs ? { threadTs } : {}) }),
    };
}
export function parseTelegramLiveSmokeTarget(env) {
    const chat = env.KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID?.trim();
    const user = env.KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID?.trim();
    const thread = env.KNOWBEE_CHANNEL_SMOKE_TELEGRAM_THREAD_ID?.trim();
    if (!chat && !user && !thread)
        return { status: "unavailable", reasonCode: "not_configured" };
    if (!chat || !user)
        return { status: "unavailable", reasonCode: "incomplete" };
    const signedInteger = /^-?[1-9]\d*$/u;
    const positiveInteger = /^[1-9]\d*$/u;
    if (!signedInteger.test(chat) ||
        !positiveInteger.test(user) ||
        (thread !== undefined && !positiveInteger.test(thread))) {
        return { status: "unavailable", reasonCode: "invalid" };
    }
    const chatId = Number(chat);
    const userId = Number(user);
    const threadId = thread === undefined ? undefined : Number(thread);
    if (!Number.isSafeInteger(chatId) ||
        chatId === 0 ||
        !Number.isSafeInteger(userId) ||
        userId <= 0 ||
        (threadId !== undefined && (!Number.isSafeInteger(threadId) || threadId <= 0))) {
        return { status: "unavailable", reasonCode: "invalid" };
    }
    return {
        status: "ready",
        target: Object.freeze({
            chatId,
            userId,
            ...(threadId === undefined ? {} : { threadId }),
        }),
    };
}
export function resolveApiLiveAcceptanceExecutor(input) {
    if (input.runtime.liveAcceptanceExecutor) {
        return Object.freeze({ status: "ready", executor: input.runtime.liveAcceptanceExecutor });
    }
    const factory = input.runtime.liveAcceptanceExecutorFactory;
    if (!factory) {
        return Object.freeze({
            status: "unavailable",
            reasonCode: "live_acceptance_executor_missing",
        });
    }
    try {
        const factoryInput = Object.freeze({
            ...(input.channelSmokeLiveExecutor
                ? { channelSmokeLiveExecutor: input.channelSmokeLiveExecutor }
                : {}),
        });
        const executor = factory(factoryInput);
        return executor
            ? Object.freeze({ status: "ready", executor })
            : Object.freeze({
                status: "unavailable",
                reasonCode: "live_acceptance_executor_factory_unavailable",
            });
    }
    catch {
        return Object.freeze({
            status: "unavailable",
            reasonCode: "live_acceptance_executor_factory_failed",
        });
    }
}
export function createApiServerRuntimeContext(startup, dependencies = {}) {
    const env = startup.env;
    const parsedTelegramLiveSmokeTarget = parseTelegramLiveSmokeTarget(env);
    const parsedSlackLiveSmokeTarget = parseSlackLiveSmokeTarget(env);
    const telegramLiveSmokeTarget = parsedTelegramLiveSmokeTarget.status === "ready"
        ? parsedTelegramLiveSmokeTarget.target
        : parsedTelegramLiveSmokeTarget.reasonCode === "not_configured"
            ? dependencies.telegramLiveSmokeTarget
            : undefined;
    const slackLiveSmokeTarget = parsedSlackLiveSmokeTarget.status === "ready"
        ? parsedSlackLiveSmokeTarget.target
        : parsedSlackLiveSmokeTarget.reasonCode === "not_configured"
            ? dependencies.slackLiveSmokeTarget
            : undefined;
    return Object.freeze({
        mcpProcessEnv: Object.freeze({ ...env }),
        uiModeEnv: Object.freeze({
            KNOWBEE_ADMIN_UI: env.KNOWBEE_ADMIN_UI,
            KNOWBEE_ADMIN_UI_SOURCE: env.KNOWBEE_ADMIN_UI_SOURCE,
            KNOWBEE_LOCAL_DEV_ADMIN_UI: env.KNOWBEE_LOCAL_DEV_ADMIN_UI,
            KNOWBEE_UI_MODE_ROLLBACK: env.KNOWBEE_UI_MODE_ROLLBACK,
            KNOWBEE_LEGACY_UI: env.KNOWBEE_LEGACY_UI,
            NODE_ENV: env.NODE_ENV,
        }),
        argv: Object.freeze([...startup.argv]),
        enterpriseTopologyBuilderUi: env.KNOWBEE_ENTERPRISE_TOPOLOGY_BUILDER_UI,
        channelSmokeLiveEnabled: env.KNOWBEE_CHANNEL_SMOKE_LIVE === "1",
        liveAcceptanceEnabled: env.KNOWBEE_LIVE_ACCEPTANCE === "1",
        ...(dependencies.liveAcceptanceExecutor
            ? { liveAcceptanceExecutor: dependencies.liveAcceptanceExecutor }
            : {}),
        ...(dependencies.liveAcceptanceExecutorFactory
            ? { liveAcceptanceExecutorFactory: dependencies.liveAcceptanceExecutorFactory }
            : {}),
        ...(dependencies.liveAcceptanceSelectionAvailabilityInspector
            ? {
                liveAcceptanceSelectionAvailabilityInspector: dependencies.liveAcceptanceSelectionAvailabilityInspector,
            }
            : {}),
        ...(dependencies.liveAcceptanceRuntimeIdentityInspector
            ? {
                liveAcceptanceRuntimeIdentityInspector: dependencies.liveAcceptanceRuntimeIdentityInspector,
            }
            : {}),
        ...(telegramLiveSmokeTarget ? { telegramLiveSmokeTarget } : {}),
        ...(slackLiveSmokeTarget ? { slackLiveSmokeTarget } : {}),
        ...(dependencies.channelSmokeLiveExecutor
            ? { channelSmokeLiveExecutor: dependencies.channelSmokeLiveExecutor }
            : {}),
        ...(dependencies.pairingExecutionAdmissionKeyProvisioner
            ? {
                pairingExecutionAdmissionKeyProvisioner: dependencies.pairingExecutionAdmissionKeyProvisioner,
            }
            : {}),
        ...(dependencies.startupProgress
            ? { startupProgress: dependencies.startupProgress }
            : {}),
        updateEnv: Object.freeze({
            KNOWBEE_UPDATE_REPOSITORY: env.KNOWBEE_UPDATE_REPOSITORY,
            WIZBY_UPDATE_REPOSITORY: env.WIZBY_UPDATE_REPOSITORY,
            HOWIE_UPDATE_REPOSITORY: env.HOWIE_UPDATE_REPOSITORY,
        }),
    });
}
//# sourceMappingURL=server-runtime-context.js.map