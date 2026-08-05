import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { bindLiveAcceptanceRequestCancellation } from "../packages/core/src/api/routes/live-acceptance.ts"

class RequestLifecycle extends EventEmitter {
  aborted = false
}

class ResponseLifecycle extends EventEmitter {
  writableEnded = false
}

describe("Task 175 live acceptance request cancellation", () => {
  it("aborts once when the request is already aborted or emits aborted", () => {
    const alreadyAborted = new RequestLifecycle()
    alreadyAborted.aborted = true
    const response = new ResponseLifecycle()
    const first = bindLiveAcceptanceRequestCancellation({
      request: alreadyAborted,
      response,
    })
    expect(first.signal.aborted).toBe(true)
    first.dispose()

    const request = new RequestLifecycle()
    const second = bindLiveAcceptanceRequestCancellation({ request, response })
    request.emit("aborted")
    request.emit("aborted")
    expect(second.signal.aborted).toBe(true)
    second.dispose()
  })

  it("aborts only for a response close before writable completion", () => {
    const request = new RequestLifecycle()
    const response = new ResponseLifecycle()
    const premature = bindLiveAcceptanceRequestCancellation({ request, response })
    response.emit("close")
    expect(premature.signal.aborted).toBe(true)
    premature.dispose()

    const completedResponse = new ResponseLifecycle()
    completedResponse.writableEnded = true
    const completed = bindLiveAcceptanceRequestCancellation({
      request: new RequestLifecycle(),
      response: completedResponse,
    })
    completedResponse.emit("close")
    expect(completed.signal.aborted).toBe(false)
    completed.dispose()
  })

  it("removes both listeners and ignores lifecycle events after dispose", () => {
    const request = new RequestLifecycle()
    const response = new ResponseLifecycle()
    const lifecycle = bindLiveAcceptanceRequestCancellation({ request, response })

    expect(request.listenerCount("aborted")).toBe(1)
    expect(response.listenerCount("close")).toBe(1)
    lifecycle.dispose()
    expect(request.listenerCount("aborted")).toBe(0)
    expect(response.listenerCount("close")).toBe(0)
    request.emit("aborted")
    response.emit("close")
    expect(lifecycle.signal.aborted).toBe(false)
  })

  it("keeps abort and dispose idempotent", () => {
    const request = new RequestLifecycle()
    const response = new ResponseLifecycle()
    const lifecycle = bindLiveAcceptanceRequestCancellation({ request, response })
    const abort = vi.fn()
    lifecycle.signal.addEventListener("abort", abort)

    response.emit("close")
    request.emit("aborted")
    lifecycle.dispose()
    lifecycle.dispose()
    expect(abort).toHaveBeenCalledOnce()
  })
})
