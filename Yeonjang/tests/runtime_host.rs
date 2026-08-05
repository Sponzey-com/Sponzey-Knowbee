use knowbee_yeonjang::runtime_host::{RuntimeHostConfig, RuntimeHostError, TokioRuntimeHost};

fn valid_config() -> RuntimeHostConfig {
    RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: 8,
    }
}

#[test]
fn process_has_one_recoverable_tokio_runtime_owner() {
    let first = TokioRuntimeHost::acquire(valid_config()).expect("first runtime host");

    assert_eq!(
        TokioRuntimeHost::acquire(valid_config()).unwrap_err(),
        RuntimeHostError::AlreadyOwned
    );
    assert_eq!(first.block_on(async { 21 * 2 }), 42);

    drop(first);

    let replacement =
        TokioRuntimeHost::acquire(valid_config()).expect("runtime lease is released on drop");
    assert_eq!(replacement.block_on(async { "running" }), "running");
}

#[test]
fn invalid_runtime_bounds_are_rejected_before_ownership() {
    assert_eq!(
        TokioRuntimeHost::acquire(RuntimeHostConfig {
            worker_threads: 0,
            max_blocking_threads: 8,
        })
        .unwrap_err(),
        RuntimeHostError::InvalidWorkerThreads
    );
    assert_eq!(
        TokioRuntimeHost::acquire(RuntimeHostConfig {
            worker_threads: 2,
            max_blocking_threads: 0,
        })
        .unwrap_err(),
        RuntimeHostError::InvalidMaxBlockingThreads
    );
    assert_eq!(
        TokioRuntimeHost::acquire(RuntimeHostConfig {
            worker_threads: usize::MAX,
            max_blocking_threads: 8,
        })
        .unwrap_err(),
        RuntimeHostError::InvalidWorkerThreads
    );
    assert_eq!(
        TokioRuntimeHost::acquire(RuntimeHostConfig {
            worker_threads: 2,
            max_blocking_threads: usize::MAX,
        })
        .unwrap_err(),
        RuntimeHostError::InvalidMaxBlockingThreads
    );
}
