import { ToolDispatcher, } from "./dispatcher.js";
let activeDispatcher = null;
let activeConfig = null;
let activeDependencies = null;
const EMPTY_RUNTIME_DISPATCHER_DEPENDENCIES = Object.freeze({});
export function initializeToolDispatcher(config, dependencies = EMPTY_RUNTIME_DISPATCHER_DEPENDENCIES) {
    if (activeDispatcher) {
        if (activeConfig !== config || activeDependencies !== dependencies) {
            throw new Error("Tool dispatcher is already initialized with a different config snapshot");
        }
        return activeDispatcher;
    }
    activeConfig = config;
    activeDependencies = dependencies;
    activeDispatcher = new ToolDispatcher({ config, ...dependencies });
    return activeDispatcher;
}
export function getToolDispatcher() {
    if (!activeDispatcher) {
        throw new Error("Tool dispatcher is not initialized");
    }
    return activeDispatcher;
}
export const toolDispatcher = new Proxy({}, {
    get(_target, property) {
        const dispatcher = getToolDispatcher();
        const value = Reflect.get(dispatcher, property, dispatcher);
        return typeof value === "function" ? value.bind(dispatcher) : value;
    },
});
export function grantRunApprovalScope(runId, toolName, params) {
    getToolDispatcher().grantRunApprovalScope(runId, toolName, params);
}
export function grantRunSingleApproval(runId, toolName, params) {
    getToolDispatcher().grantRunSingleApproval(runId, toolName, params);
}
export function resolvePendingInteraction(runId, decision) {
    return getToolDispatcher().resolvePendingInteraction(runId, decision);
}
export function listPendingInteractions() {
    return getToolDispatcher().listPendingInteractions();
}
//# sourceMappingURL=runtime-dispatcher.js.map