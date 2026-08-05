use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};

use tokio::runtime::{Builder, Handle, Runtime};

const MAX_WORKER_THREADS: usize = 256;
const MAX_BLOCKING_THREADS: usize = 1_024;

static RUNTIME_HOST_OWNED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeHostConfig {
    pub worker_threads: usize,
    pub max_blocking_threads: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeHostError {
    InvalidWorkerThreads,
    InvalidMaxBlockingThreads,
    AlreadyOwned,
    BuildFailed,
}

pub struct TokioRuntimeHost {
    runtime: Option<Runtime>,
}

impl std::fmt::Debug for TokioRuntimeHost {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("TokioRuntimeHost")
            .field("running", &self.runtime.is_some())
            .finish()
    }
}

impl TokioRuntimeHost {
    pub fn acquire(config: RuntimeHostConfig) -> Result<Self, RuntimeHostError> {
        validate_config(config)?;
        RUNTIME_HOST_OWNED
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| RuntimeHostError::AlreadyOwned)?;

        let runtime = Builder::new_multi_thread()
            .worker_threads(config.worker_threads)
            .max_blocking_threads(config.max_blocking_threads)
            .enable_all()
            .build();

        match runtime {
            Ok(runtime) => Ok(Self {
                runtime: Some(runtime),
            }),
            Err(_) => {
                RUNTIME_HOST_OWNED.store(false, Ordering::Release);
                Err(RuntimeHostError::BuildFailed)
            }
        }
    }

    pub fn handle(&self) -> Handle {
        self.runtime
            .as_ref()
            .expect("runtime remains available while its host is alive")
            .handle()
            .clone()
    }

    pub fn block_on<F>(&self, future: F) -> F::Output
    where
        F: Future,
    {
        self.runtime
            .as_ref()
            .expect("runtime remains available while its host is alive")
            .block_on(future)
    }
}

impl Drop for TokioRuntimeHost {
    fn drop(&mut self) {
        if let Some(runtime) = self.runtime.take() {
            runtime.shutdown_background();
        }
        RUNTIME_HOST_OWNED.store(false, Ordering::Release);
    }
}

fn validate_config(config: RuntimeHostConfig) -> Result<(), RuntimeHostError> {
    if config.worker_threads == 0 || config.worker_threads > MAX_WORKER_THREADS {
        return Err(RuntimeHostError::InvalidWorkerThreads);
    }
    if config.max_blocking_threads == 0 || config.max_blocking_threads > MAX_BLOCKING_THREADS {
        return Err(RuntimeHostError::InvalidMaxBlockingThreads);
    }
    Ok(())
}
