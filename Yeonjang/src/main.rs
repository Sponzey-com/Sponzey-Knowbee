//! Packaged Yeonjang composition root.
//!
//! Startup reads one validated settings snapshot, binds durable owners to one
//! config root, acquires secret material at the latest possible bootstrap
//! boundary, and then transfers ownership to the managed Tokio runtime.

#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use std::env;
use std::fs::File;
use std::io::Read;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};
use std::sync::Arc;

use anyhow::Result;
use knowbee_yeonjang::authorization_bootstrap::{
    AuthorizationBootstrapInput, SystemAuthorizationClock,
};
use knowbee_yeonjang::credential_store::resolve_system_settings_with_credentials;
use knowbee_yeonjang::instance_process_lease::{
    RuntimeLeaseError, RuntimeLeaseGuard, configured_runtime_lease_provider,
};
use knowbee_yeonjang::mqtt_transport::{
    MAX_TLS_MATERIAL_BYTES, MqttTransportSecurity, MutualTlsIdentity,
};
use knowbee_yeonjang::mqtt_v2_production_bootstrap::{
    MqttV2Enrollment, MqttV2ProductionConfig, MqttV2ProductionDependencies,
    SystemMqttV2BootstrapClock, configured_mqtt_v2_state_root, start_production_mqtt_v2,
    start_production_mqtt_v2_with_stage_timing,
};
use knowbee_yeonjang::permission_policy_bootstrap::{
    configured_permission_policy_repository, configured_permission_policy_repository_at,
};
use knowbee_yeonjang::platform_operation::TargetPlatform;
use knowbee_yeonjang::protocol::Response;
use knowbee_yeonjang::runtime_host::{RuntimeHostConfig, TokioRuntimeHost};
use knowbee_yeonjang::settings::{load_runtime_settings, load_settings, load_settings_at};
use knowbee_yeonjang::stage_timing::StageTimingRecorder;
use knowbee_yeonjang::stage_timing_jsonl::{JsonlStageTimingSink, SystemStageTimingClock};
use knowbee_yeonjang::startup_mode::StartupMode;
use knowbee_yeonjang::system_automation_backend;
use knowbee_yeonjang::system_screen_permission::SystemScreenPermissionProbe;

fn main() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();
    let mode = StartupMode::parse(&args).unwrap_or_else(|_| usage_and_exit());
    let runtime_lease = acquire_runtime_lease(&mode)?;

    match mode {
        StartupMode::Gui => knowbee_yeonjang::run_gui(require_runtime_lease(runtime_lease)?),
        StartupMode::Managed {
            use_tls,
            config_root,
            broker_secret_stdin,
            stage_timing_jsonl,
        } => {
            let config_root = config_root
                .map(PathBuf::from)
                .map(validate_explicit_config_root)
                .transpose()?;
            run_managed(
                use_tls,
                config_root,
                broker_secret_stdin,
                stage_timing_jsonl,
                require_runtime_lease(runtime_lease)?,
            )
        }
        StartupMode::Stdio { authenticated } => {
            run_stdio(authenticated, require_runtime_lease(runtime_lease)?)
        }
        StartupMode::ReleaseIdentity => write_release_identity(),
        StartupMode::WriteIcon { output_path } => {
            knowbee_yeonjang::write_bundle_icon_png(Path::new(&output_path))
        }
        StartupMode::CameraCaptureHelper { args } => run_camera_capture_helper(args),
        StartupMode::RejectLegacyLocalExec => reject_legacy_local_exec(),
    }
}

fn acquire_runtime_lease(mode: &StartupMode) -> Result<Option<RuntimeLeaseGuard>> {
    if !mode.claims_runtime() {
        return Ok(None);
    }
    configured_runtime_lease_provider()
        .and_then(|provider| provider.acquire())
        .map(Some)
        .map_err(project_runtime_lease_error)
}

fn require_runtime_lease(lease: Option<RuntimeLeaseGuard>) -> Result<RuntimeLeaseGuard> {
    lease.ok_or_else(|| anyhow::anyhow!("yeonjang startup failed: runtime_lease_unavailable"))
}

fn project_runtime_lease_error(error: RuntimeLeaseError) -> anyhow::Error {
    anyhow::anyhow!("yeonjang startup failed: {}", error.reason_code())
}

fn usage_and_exit() -> ! {
    eprintln!(
        "Usage: knowbee-yeonjang [--gui | --managed | --managed-tls] [--config-root <absolute-path>] [--broker-secret-stdin] [--stage-timing-jsonl] | [--stdio | --stdio-authenticated | --release-identity | --write-icon <path> | --camera-capture-helper <args...>]"
    );
    std::process::exit(2);
}

fn write_release_identity() -> Result<()> {
    let identity = knowbee_yeonjang::release_identity::ReleaseBinaryIdentity::current()
        .map_err(|_| anyhow::anyhow!("release executable identity is unavailable"))?;
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer(&mut output, &identity)
        .map_err(|_| anyhow::anyhow!("release executable identity serialization failed"))?;
    writeln!(output)?;
    Ok(())
}

fn run_stdio(authenticated: bool, runtime_lease: RuntimeLeaseGuard) -> Result<()> {
    let settings = load_runtime_settings()?;
    let backend = system_automation_backend();
    let stdin = io::stdin();
    let stdout = io::stdout();
    let result = if authenticated {
        let authorization = stdio_authorization_from_environment()?;
        knowbee_yeonjang::stdio::run_authenticated_stdio_with_backend(
            stdin.lock(),
            stdout.lock(),
            settings,
            backend,
            authorization,
            Arc::new(SystemAuthorizationClock),
        )
        .map_err(anyhow::Error::new)
    } else {
        knowbee_yeonjang::stdio::run_stdio_with_backend(
            stdin.lock(),
            stdout.lock(),
            settings,
            backend,
        )
        .map_err(anyhow::Error::new)
    };
    drop(runtime_lease);
    result
}

fn stdio_authorization_from_environment() -> Result<AuthorizationBootstrapInput> {
    let issuer = required_environment("YEONJANG_STDIO_AUTH_ISSUER")?;
    let issuer_key_id = required_environment("YEONJANG_STDIO_AUTH_KEY_ID")?;
    let audience = required_environment("YEONJANG_STDIO_AUTH_AUDIENCE")?;
    let secret = required_environment("YEONJANG_STDIO_AUTH_SECRET")?.into_bytes();
    AuthorizationBootstrapInput::new(issuer, issuer_key_id, audience, secret, 512)
        .map_err(|error| anyhow::anyhow!("invalid authenticated stdio bootstrap: {error:?}"))
}

fn required_environment(name: &'static str) -> Result<String> {
    env::var(name).map_err(|_| anyhow::anyhow!("missing required bootstrap value: {name}"))
}

fn reject_legacy_local_exec() -> Result<()> {
    write_response_and_exit(Response::error(
        None,
        "local_exec_requires_authenticated_stdio",
        "Local execution requires canonical authenticated stdio.",
    ))
}

fn run_managed(
    use_tls: bool,
    explicit_config_root: Option<PathBuf>,
    broker_secret_stdin: bool,
    stage_timing_jsonl: bool,
    runtime_lease: RuntimeLeaseGuard,
) -> Result<()> {
    let _managed_signal_source =
        knowbee_yeonjang::managed_shutdown::prepare_managed_signal_source()
            .map_err(|_| anyhow::anyhow!("managed shutdown signal source is unavailable"))?;
    let settings = match &explicit_config_root {
        Some(root) => load_settings_at(&root.join("settings.json"))?,
        None => load_settings()?,
    };
    let transport = if use_tls {
        mqtt_tls_from_environment()?
    } else {
        MqttTransportSecurity::LoopbackPlaintext
    };
    let policy = match &explicit_config_root {
        Some(root) => configured_permission_policy_repository_at(&settings, root),
        None => configured_permission_policy_repository(&settings),
    }
    .map_err(|error| anyhow::anyhow!("permission policy bootstrap failed: {error}"))?;
    let enrollment = MqttV2Enrollment::from_settings(&settings);
    let state_root = match &explicit_config_root {
        Some(root) => root.join("mqtt-v2"),
        None => configured_mqtt_v2_state_root()
            .map_err(|error| anyhow::anyhow!("v2 state path bootstrap failed: {error:?}"))?,
    };
    // Acquire the secret only after all non-secret filesystem/policy/lease
    // bootstrap has passed, then hand the settings directly to the consuming
    // production config so the plaintext lifetime stays bounded.
    let settings = if broker_secret_stdin {
        bind_broker_secret_from_stdin(settings)?
    } else {
        resolve_system_settings_with_credentials(settings)
            .map_err(|error| anyhow::anyhow!("managed credential bootstrap failed: {error:?}"))?
    };
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings.runtime_snapshot(),
        enrollment,
        transport,
        state_root,
        compiled_target_platform()?,
    )
    .map_err(|error| anyhow::anyhow!("v2 configuration bootstrap failed: {error:?}"))?;
    let host = TokioRuntimeHost::acquire(RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: 8,
    })
    .map_err(|error| anyhow::anyhow!("Tokio runtime bootstrap failed: {error:?}"))?;
    let dependencies = MqttV2ProductionDependencies {
        backend: system_automation_backend(),
        policy,
        screen_permission: Arc::new(SystemScreenPermissionProbe),
        clock: Arc::new(SystemMqttV2BootstrapClock),
    };
    let runtime = if stage_timing_jsonl {
        let recorder = StageTimingRecorder::new(
            Arc::new(SystemStageTimingClock::new()),
            Arc::new(
                JsonlStageTimingSink::stderr(4_096)
                    .map_err(|error| anyhow::anyhow!("stage timing bootstrap failed: {error:?}"))?,
            ),
        );
        start_production_mqtt_v2_with_stage_timing(
            config,
            dependencies,
            runtime_lease,
            host.handle(),
            recorder,
        )
    } else {
        start_production_mqtt_v2(config, dependencies, runtime_lease, host.handle())
    }
    .map_err(|error| anyhow::anyhow!("direct MQTT v2 startup failed: {error:?}"))?;

    eprintln!("Yeonjang direct MQTT v2 runtime started. Press Ctrl+C to stop.");
    host.block_on(
        runtime.run_until(knowbee_yeonjang::managed_shutdown::wait_for_managed_shutdown_signal()),
    )
    .map_err(|error| anyhow::anyhow!("direct MQTT v2 runtime stopped: {error:?}"))?;

    Ok(())
}

fn bind_broker_secret_from_stdin(
    mut settings: knowbee_yeonjang::settings::YeonjangSettings,
) -> Result<knowbee_yeonjang::settings::YeonjangSettings> {
    const MAX_BROKER_SECRET_BYTES: usize = 4_096;
    let mut secret = Vec::new();
    io::stdin()
        .take((MAX_BROKER_SECRET_BYTES + 1) as u64)
        .read_to_end(&mut secret)
        .map_err(|_| anyhow::anyhow!("managed broker secret lease is unavailable"))?;
    if secret.is_empty() || secret.len() > MAX_BROKER_SECRET_BYTES {
        secret.fill(0);
        anyhow::bail!("managed broker secret lease is invalid");
    }
    let password = match String::from_utf8(std::mem::take(&mut secret)) {
        Ok(password) => password,
        Err(error) => {
            let mut invalid = error.into_bytes();
            invalid.fill(0);
            anyhow::bail!("managed broker secret lease is invalid");
        }
    };
    settings.connection.password = password;
    Ok(settings)
}

fn validate_explicit_config_root(path: PathBuf) -> Result<PathBuf> {
    if !path.is_absolute() {
        anyhow::bail!("managed config root must be absolute");
    }
    std::fs::create_dir_all(&path)
        .map_err(|_| anyhow::anyhow!("managed config root is unavailable"))?;
    let metadata = std::fs::symlink_metadata(&path)
        .map_err(|_| anyhow::anyhow!("managed config root is unavailable"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        anyhow::bail!("managed config root is unsafe");
    }
    path.canonicalize()
        .map_err(|_| anyhow::anyhow!("managed config root is unavailable"))
}

fn compiled_target_platform() -> Result<TargetPlatform> {
    #[cfg(target_os = "macos")]
    {
        Ok(TargetPlatform::Macos)
    }
    #[cfg(target_os = "windows")]
    {
        Ok(TargetPlatform::Windows)
    }
    #[cfg(target_os = "linux")]
    {
        Ok(TargetPlatform::Linux)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        anyhow::bail!("direct MQTT v2 platform adapter is unavailable")
    }
}

fn mqtt_tls_from_environment() -> Result<MqttTransportSecurity> {
    let ca_certificate = read_bounded_tls_material("YEONJANG_MQTT_CA_CERT_PATH")?;
    let client_certificate = read_bounded_tls_material("YEONJANG_MQTT_CLIENT_CERT_PATH")?;
    let client_private_key = read_bounded_tls_material("YEONJANG_MQTT_CLIENT_KEY_PATH")?;
    let identity = MutualTlsIdentity::new(ca_certificate, client_certificate, client_private_key)
        .map_err(|_| anyhow::anyhow!("invalid managed MQTT TLS bootstrap"))?;
    Ok(MqttTransportSecurity::MutualTls(identity))
}

fn read_bounded_tls_material(environment_name: &'static str) -> Result<Vec<u8>> {
    let path = required_environment(environment_name)?;
    let file = File::open(path)
        .map_err(|_| anyhow::anyhow!("managed MQTT TLS material is unavailable"))?;
    let mut bytes = Vec::new();
    file.take((MAX_TLS_MATERIAL_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| anyhow::anyhow!("managed MQTT TLS material is unavailable"))?;
    if bytes.len() > MAX_TLS_MATERIAL_BYTES {
        anyhow::bail!("managed MQTT TLS material is invalid");
    }
    Ok(bytes)
}

fn run_camera_capture_helper(args: Vec<String>) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        knowbee_yeonjang::run_platform_camera_capture_helper(args)
    }

    #[cfg(target_os = "macos")]
    {
        run_macos_camera_capture_helper(args)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = args;
        anyhow::bail!("camera capture helper is not implemented for this platform");
    }
}

#[cfg(target_os = "macos")]
fn run_macos_camera_capture_helper(args: Vec<String>) -> Result<()> {
    let current_exe = env::current_exe()?;
    let helper_path = current_exe
        .parent()
        .map(|directory| directory.join("yeonjang-camera-helper"))
        .ok_or_else(|| anyhow::anyhow!("failed to resolve Yeonjang executable directory"))?;

    if !helper_path.is_file() {
        anyhow::bail!(
            "bundled camera capture helper was not found next to the Yeonjang executable: {}",
            helper_path.display()
        );
    }

    let output = Command::new(&helper_path)
        .args(args)
        .stdin(Stdio::null())
        .output()?;

    io::stdout().lock().write_all(&output.stdout)?;
    io::stderr().lock().write_all(&output.stderr)?;

    if output.status.success() {
        return Ok(());
    }

    std::process::exit(output.status.code().unwrap_or(1));
}

fn write_response_and_exit(response: Response) -> Result<()> {
    serde_json::to_writer_pretty(io::stdout().lock(), &response)?;
    io::stdout().lock().write_all(b"\n")?;

    if response.ok {
        return Ok(());
    }

    std::process::exit(1);
}
