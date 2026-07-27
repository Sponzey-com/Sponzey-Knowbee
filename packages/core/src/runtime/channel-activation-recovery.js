import { startChannels } from "../channels/index.js";
import { recoverCanonicalPendingResponsesOnStartup, } from "../runs/canonical-pending-response-recovery-runtime.js";
const defaultRecoveryDependencies = Object.freeze({
    recoverPendingResponses: recoverCanonicalPendingResponsesOnStartup,
});
const defaultActivationDependencies = Object.freeze({
    startChannels,
    ...defaultRecoveryDependencies,
});
export async function recoverPendingResponsesForChannelRuntime(channelRuntime, dependencies = defaultRecoveryDependencies) {
    return dependencies.recoverPendingResponses({
        resolveDeliveryHandler: channelRuntime.resolveDeliveryHandler,
    });
}
export async function activateChannelsAndRecoverPendingResponses(config, paths, dependencies = defaultActivationDependencies) {
    const channelRuntime = await dependencies.startChannels(config, paths);
    const recovery = await recoverPendingResponsesForChannelRuntime(channelRuntime, dependencies);
    return Object.freeze({ channelRuntime, recovery });
}
//# sourceMappingURL=channel-activation-recovery.js.map