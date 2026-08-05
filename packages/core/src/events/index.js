import { createLogger } from "../logger/index.js";
const log = createLogger("events");
function logListenerError(event, error) {
    log.error("Unhandled event listener error", { event, error });
}
class TypedEventBus {
    listeners = new Map();
    on(event, listener) {
        const key = event;
        let set = this.listeners.get(key);
        if (!set) {
            set = new Set();
            this.listeners.set(key, set);
        }
        set.add(listener);
        return () => set.delete(listener);
    }
    emit(event, payload) {
        const key = event;
        const set = this.listeners.get(key);
        if (!set)
            return;
        for (const listener of set) {
            try {
                void Promise.resolve(listener(payload)).catch((err) => {
                    logListenerError(key, err);
                });
            }
            catch (err) {
                logListenerError(key, err);
            }
        }
    }
    once(event, listener) {
        const unsub = this.on(event, (payload) => {
            unsub();
            return listener(payload);
        });
        return unsub;
    }
}
export const eventBus = new TypedEventBus();
//# sourceMappingURL=index.js.map