export function createApprovedOperationContinuationRecoverySupervisor(input) {
    const controller = new AbortController();
    let requested = false;
    let stopped = false;
    let running = null;
    const startRunner = () => {
        const runner = (async () => {
            while (requested && !stopped && !controller.signal.aborted) {
                requested = false;
                try {
                    const summary = await input.recover(controller.signal);
                    await input.onSummary?.(summary, controller.signal);
                }
                catch {
                    input.onError?.();
                }
            }
        })();
        running = runner.finally(() => {
            running = null;
            if (requested && !stopped && !controller.signal.aborted) {
                void startRunner();
            }
        });
        return running;
    };
    return Object.freeze({
        wake() {
            if (stopped || controller.signal.aborted)
                return Promise.resolve();
            requested = true;
            return running ?? startRunner();
        },
        async stop() {
            if (stopped) {
                await running;
                return;
            }
            stopped = true;
            requested = false;
            controller.abort();
            await running;
        },
    });
}
//# sourceMappingURL=approved-operation-continuation-recovery-supervisor.js.map