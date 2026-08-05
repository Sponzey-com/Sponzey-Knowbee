export function createStartupProcessContext(input) {
    const cwd = input.cwd.trim();
    if (!cwd)
        throw new Error("startup_process_cwd_required");
    return Object.freeze({
        env: Object.freeze({ ...input.env }),
        argv: Object.freeze([...input.argv]),
        cwd,
        ...(input.platform?.trim() ? { platform: input.platform.trim() } : {}),
    });
}
export function captureStartupProcessContext() {
    return createStartupProcessContext({
        env: process.env,
        argv: process.argv,
        cwd: process.cwd(),
        platform: process.platform,
    });
}
//# sourceMappingURL=startup-process-context.js.map