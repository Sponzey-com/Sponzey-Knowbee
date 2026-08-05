export function installApiRuntimeConfig(app, config, paths) {
    if (app.hasDecorator("knowbeeRuntimeContext")) {
        throw new Error("API runtime config context is already installed");
    }
    const context = Object.freeze({ config, paths });
    app.decorate("knowbeeRuntimeContext", context);
    return context;
}
export function getApiRuntimePaths(request) {
    const context = request.server.knowbeeRuntimeContext;
    if (!context?.paths)
        throw new Error("API runtime path context is not installed");
    return context.paths;
}
export function getApiRuntimeConfig(request) {
    const context = request.server.knowbeeRuntimeContext;
    if (!context?.config) {
        throw new Error("API runtime config context is not installed");
    }
    return context.config;
}
//# sourceMappingURL=runtime-context.js.map