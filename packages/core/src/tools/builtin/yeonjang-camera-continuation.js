export function createYeonjangCameraContinuationAdapter(dependencies) {
    return Object.freeze({
        toolName: "yeonjang_camera_capture",
        async execute(input) {
            const { continuation, signal } = input;
            const exact = dependencies.candidates().find((candidate) => {
                const projected = dependencies.projectOperation(candidate);
                return (projected.operationId === continuation.operationId
                    && projected.operationBindingHash
                        === continuation.operationBindingHash);
            });
            if (!exact) {
                return {
                    status: "blocked",
                    reasonCode: "camera_continuation_binding_not_rehydratable",
                };
            }
            return dependencies.execute(exact, continuation, signal);
        },
    });
}
//# sourceMappingURL=yeonjang-camera-continuation.js.map