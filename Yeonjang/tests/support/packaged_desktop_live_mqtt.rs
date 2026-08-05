//! Opt-in packaged desktop device acceptance over direct MQTT v2.
//!
//! The test performs real camera and screen effects, verifies transferred
//! image bytes, observes durable cleanup, and proves same-instance restart.
//! With explicit rollback inputs, the reacquiring process is a distinct
//! previous package that must read schema-3 state and replay without effect.

use std::collections::BTreeMap;
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(target_os = "windows")]
use std::{os::windows::process::CommandExt, thread};

use knowbee_yeonjang::artifact_transfer::decode_artifact_chunk_frame;
use knowbee_yeonjang::mqtt_v2_crypto::{MqttV2HmacCrypto, V2HmacKeySnapshot};
use knowbee_yeonjang::mqtt_v2_production_bootstrap::derive_mqtt_v2_hmac_key;
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2::parse_v2_command;
use knowbee_yeonjang::protocol_v2_artifact::parse_v2_artifact_control;
use knowbee_yeonjang::protocol_v2_capabilities::{V2CapabilitiesAdmission, parse_v2_capabilities};
use knowbee_yeonjang::protocol_v2_control::parse_v2_control;
use knowbee_yeonjang::protocol_v2_permission_query::parse_v2_capture_permission_query;
use knowbee_yeonjang::protocol_v2_policy_admin::parse_v2_policy_admin;
use knowbee_yeonjang::protocol_v2_receipt_query::parse_v2_receipt_query;
use knowbee_yeonjang::protocol_v2_response_ack::parse_v2_response_ack;
use knowbee_yeonjang::protocol_v2_terminal::V2ResponseSigner;
use knowbee_yeonjang::stage_timing::{RuntimeStage, StageTimingEvidence};
use rumqttc::{
    AsyncClient, ConnectionError, Event, EventLoop, Incoming, MqttOptions, NetworkOptions,
    Outgoing, QoS, TlsConfiguration, Transport,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::{
    Console::{CTRL_BREAK_EVENT, GenerateConsoleCtrlEvent},
    Threading::CREATE_NEW_PROCESS_GROUP,
};

const BROKER_PASSWORD: &str = "live-broker-password-0123456789";
const REQUESTER_KEY_ID: &str = "requester-hmac-v2";
const MAX_CAPTURE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Copy)]
pub struct DesktopLiveProfile {
    pub package_target: &'static str,
    pub target_os: &'static str,
    pub target_arch: &'static str,
}

/// Runs the same exact package/device contract for one desktop profile.
///
/// OS-specific entry tests select only immutable package identity. Request
/// signing, policy, capture, artifact, recovery, and delivery verification
/// remain shared so one platform cannot silently weaken the release gate.
pub async fn run_signed_package_device_gate(profile: DesktopLiveProfile) {
    let fixture = LiveFixture::from_environment(profile);
    let current_identity = fixture.verify_loaded_package_identity();
    fixture.verify_rollback_package_identity(&current_identity);
    let topics = MqttV2TopicSet::new(
        &fixture.instance_id,
        &fixture.session_id,
        &fixture.requester_id,
    )
    .expect("live exact topics");
    let signer = fixture.requester_signer();
    let (mut client, mut events) = fixture.requester_client();

    for topic in [
        topics.response(),
        topics.status(),
        format!(
            "yeonjang/v2/instances/{}/sessions/{}/requesters/{}/artifact/+/chunk",
            fixture.instance_id, fixture.session_id, fixture.requester_id
        ),
    ] {
        client
            .subscribe(topic, QoS::AtLeastOnce)
            .await
            .expect("live subscription enqueue");
    }
    expect_subacks(&mut events, 3).await;

    let mut runtime = LiveRuntime::spawn(&fixture);
    expect_online(&mut events, &topics.status()).await;
    LiveRuntime::expect_duplicate_rejected(&fixture);
    client
        .subscribe(topics.capabilities(), QoS::AtLeastOnce)
        .await
        .expect("retained capabilities subscription enqueue");
    expect_subacks(&mut events, 1).await;
    let capabilities =
        expect_capabilities(&mut events, &topics, &signer, &fixture.target_fingerprint).await;
    assert_eq!(
        capabilities["payload"]["advertisedMethods"],
        json!(["camera.capture", "screen.capture"])
    );
    assert_eq!(
        capabilities["payload"]["targetPlatform"],
        fixture.profile.target_os
    );
    let policy_revision = capabilities["payload"]["policyRevision"]
        .as_u64()
        .expect("canonical capability policy revision");
    assert!(
        policy_revision > 0,
        "reviewed legacy allow settings must migrate once"
    );
    for (index, method) in ["camera.capture", "screen.capture"].iter().enumerate() {
        let row = &capabilities["payload"]["capabilities"][index];
        assert_eq!(row["method"], *method);
        assert_eq!(row["implementationStatus"], "executable");
        assert_eq!(row["platformAvailable"], true);
        assert_eq!(row["localPolicy"], "allowed");
        assert_eq!(row["authorizationScope"], "effect.execute");
        assert_eq!(row["postCheckRequired"], true);
        assert_eq!(row["artifactDelivery"], "mqtt.fetch_ack");
    }
    assert!(capture_file_paths(&fixture.artifact_root, &fixture.artifact_root).is_empty());

    let rejection_now = now_ms();
    let v1_identity = CaptureIdentity::new(91, "camera.capture");
    let mut v1 = signed_capture_command(&topics, &fixture, &v1_identity, &signer, rejection_now);
    v1["protocol_version"] = 1.into();
    publish_and_expect_command_rejection(
        &client,
        &mut events,
        &topics,
        v1,
        "protocol_upgrade_required",
    )
    .await;

    let expired_identity = CaptureIdentity::new(92, "camera.capture");
    let mut expired =
        signed_capture_command(&topics, &fixture, &expired_identity, &signer, rejection_now);
    expired["issued_at"] = (rejection_now - 2_000).into();
    expired["expires_at"] = (rejection_now - 1_000).into();
    expired["authorization"]["expires_at"] = (rejection_now - 1_000).into();
    publish_and_expect_command_rejection(&client, &mut events, &topics, expired, "request_expired")
        .await;

    let wrong_target_identity = CaptureIdentity::new(93, "camera.capture");
    let mut wrong_target = signed_capture_command(
        &topics,
        &fixture,
        &wrong_target_identity,
        &signer,
        rejection_now,
    );
    wrong_target["target_instance_id"] = "wrong-instance".into();
    publish_and_expect_command_rejection(
        &client,
        &mut events,
        &topics,
        wrong_target,
        "target_mismatch",
    )
    .await;
    assert!(capture_file_paths(&fixture.artifact_root, &fixture.artifact_root).is_empty());

    let permission_query = signed_capture_permission_query(&topics, &fixture, &signer, now_ms());
    let permission_request_id =
        required_text(&permission_query["request_id"], "permission request ID").to_string();
    publish_json(&client, topics.control(), permission_query).await;
    let permission_response =
        expect_terminal_response(&mut events, &topics.response(), &permission_request_id).await;
    assert_eq!(
        permission_response["schema_id"],
        "yeonjang.capture-permission-response.v2"
    );
    assert_eq!(permission_response["payload"]["outcome"], "available");
    assert_eq!(
        permission_response["payload"]["policyRevision"],
        policy_revision
    );
    let expected_os_permissions = match fixture.profile.target_os {
        "macos" => ["granted", "granted"],
        "windows" | "linux" => ["not_observed", "not_required"],
        other => panic!("unsupported desktop permission profile: {other}"),
    };
    for (index, method) in ["camera.capture", "screen.capture"].iter().enumerate() {
        let row = &permission_response["payload"]["permissions"][index];
        assert_eq!(row["method"], *method);
        assert_eq!(row["platformAvailable"], true);
        assert_eq!(row["localPolicy"], "allowed");
        assert_eq!(row["osPermission"], expected_os_permissions[index]);
    }
    assert_eq!(
        permission_response["authorization"]["scope"],
        "response.publish"
    );
    let permission_signature = required_text(
        &permission_response["authorization"]["signature"],
        "permission response signature",
    );
    assert_eq!(permission_signature.len(), 64);
    assert!(
        permission_signature
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    );
    assert!(capture_file_paths(&fixture.artifact_root, &fixture.artifact_root).is_empty());
    exercise_policy_deny_and_rollback(
        &client,
        &mut events,
        &topics,
        &fixture,
        &signer,
        policy_revision,
    )
    .await;
    exercise_running_command_cancellation(&client, &mut events, &topics, &fixture, &signer).await;
    exercise_exact_command_duplicate(&client, &mut events, &topics, &fixture, &signer).await;
    restart_broker_and_recover(&mut client, &mut events, &topics, &fixture, &signer).await;
    let mut cancelled_artifact_ref = None;
    let mut completed_camera_replay = None;

    for (sequence, method, expected_media_type) in [
        (1_u64, "camera.capture", "image/jpeg"),
        (2_u64, "screen.capture", "image/png"),
    ] {
        let capture = CaptureIdentity::new(sequence, method);
        let command = signed_capture_command(&topics, &fixture, &capture, &signer, now_ms());
        publish_json(&client, topics.command(), command.clone()).await;
        let response =
            expect_terminal_response(&mut events, &topics.response(), &capture.request_id).await;
        assert_eq!(
            response["payload"]["terminal"]["execution_outcome"],
            "succeeded",
            "{method} terminal: {}",
            bounded_json(&response)
        );
        assert_eq!(response["payload"]["schema_version"], 3);
        assert!(
            required_text(
                &response["payload"]["target_scope_digest"],
                "terminal target scope digest"
            )
            .starts_with("sha256:")
        );
        if sequence == 1 {
            completed_camera_replay = Some((command, response.clone(), capture.request_id.clone()));
            exercise_terminal_delivery_controls(
                &client,
                &mut events,
                &topics,
                &fixture,
                &capture,
                &response,
                &signer,
            )
            .await;
        }
        let artifact = response["payload"]["artifact"]
            .as_object()
            .unwrap_or_else(|| {
                panic!(
                    "{method} response has no artifact: {}",
                    bounded_json(&response)
                )
            });
        assert_eq!(artifact["mediaType"], expected_media_type);
        assert_eq!(
            artifact["kind"],
            if method == "camera.capture" {
                "camera_jpeg"
            } else {
                "screen_png"
            }
        );
        let artifact_ref = required_text(&artifact["artifactRef"], "artifactRef");
        let full_digest = required_text(&artifact["fullDigest"], "fullDigest");
        let total_size = artifact["sizeBytes"].as_u64().expect("artifact size");
        let expected_revision = artifact["lifecycleRevision"]
            .as_u64()
            .expect("artifact lifecycle revision");
        assert!(total_size > 0 && total_size <= MAX_CAPTURE_BYTES as u64);
        let serialized = response.to_string();
        assert!(!serialized.contains(&fixture.private_root_text));
        assert!(!serialized.contains("capture-artifacts/"));

        let transfer_id = format!("transfer-{sequence}");
        let fetch = signed_artifact_control(
            &topics,
            &fixture,
            &capture,
            &transfer_id,
            artifact_ref,
            full_digest,
            expected_revision,
            false,
            &signer,
            now_ms(),
        );
        publish_json(&client, topics.control(), fetch).await;
        let bytes = collect_artifact(
            &mut events,
            &topics.artifact_chunk(&transfer_id).expect("chunk topic"),
            artifact_ref,
            full_digest,
            total_size,
        )
        .await;
        verify_image(method, &bytes);

        if sequence == 2 {
            let cancel = signed_artifact_cancel(
                &topics,
                &fixture,
                &capture,
                &transfer_id,
                artifact_ref,
                2,
                &signer,
                now_ms(),
            );
            let cancel_request_id =
                required_text(&cancel["request_id"], "cancel request ID").to_string();
            publish_json(&client, topics.control(), cancel.clone()).await;
            let response =
                expect_terminal_response(&mut events, &topics.response(), &cancel_request_id).await;
            assert_artifact_cancel_response(
                &response,
                "cancelled",
                artifact_ref,
                &capture,
                &transfer_id,
                2,
            );

            // A late ACK cannot convert the durable Cancelled terminal into
            // acknowledgement or cleanup. Exact cancel redelivery observes
            // that same canonical state as AlreadyCancelled.
            let late_ack = signed_artifact_control(
                &topics,
                &fixture,
                &capture,
                &transfer_id,
                artifact_ref,
                full_digest,
                2,
                true,
                &signer,
                now_ms(),
            );
            publish_json(
                &client,
                topics.artifact_ack(&transfer_id).expect("late ack topic"),
                late_ack,
            )
            .await;
            publish_json(&client, topics.control(), cancel).await;
            let replay =
                expect_terminal_response(&mut events, &topics.response(), &cancel_request_id).await;
            assert_artifact_cancel_response(
                &replay,
                "already_cancelled",
                artifact_ref,
                &capture,
                &transfer_id,
                2,
            );
            assert!(!capture_file_paths(&fixture.artifact_root, &fixture.artifact_root).is_empty());
            cancelled_artifact_ref = Some(artifact_ref.to_string());
            continue;
        }

        let ack = signed_artifact_control(
            &topics,
            &fixture,
            &capture,
            &transfer_id,
            artifact_ref,
            full_digest,
            2,
            true,
            &signer,
            now_ms(),
        );
        publish_json(
            &client,
            topics.artifact_ack(&transfer_id).expect("ack topic"),
            ack,
        )
        .await;
        expect_outgoing_publish(&mut events, "artifact acknowledgement").await;
        wait_for_artifact_cleanup(&fixture.artifact_root, artifact_ref, "acknowledged").await;
    }

    runtime.interrupt();
    expect_offline(&mut events, &topics.status()).await;
    runtime.wait_for_success();
    verify_stage_timing_baseline(&fixture, &runtime.log_path);

    let rollback_rehearsal = fixture.rollback_package.is_some();
    let mut restarted = if rollback_rehearsal {
        LiveRuntime::spawn_rollback(&fixture)
    } else {
        LiveRuntime::spawn(&fixture)
    };
    expect_online(&mut events, &topics.status()).await;
    wait_for_artifact_cleanup(
        &fixture.artifact_root,
        cancelled_artifact_ref
            .as_deref()
            .expect("cancelled screen artifact"),
        "cancelled",
    )
    .await;
    assert!(
        capture_file_paths(&fixture.artifact_root, &fixture.artifact_root).is_empty(),
        "restart cleanup must finish before completed terminal replay"
    );
    let (camera_command, camera_terminal, camera_request_id) =
        completed_camera_replay.expect("completed camera replay fixture");
    publish_json(&client, topics.command(), camera_command).await;
    let replay =
        expect_terminal_response(&mut events, &topics.response(), &camera_request_id).await;
    assert_eq!(replay["payload"], camera_terminal["payload"]);
    assert_eq!(replay["receipt_id"], camera_terminal["receipt_id"]);
    assert_eq!(
        replay["response_digest"],
        camera_terminal["response_digest"]
    );
    assert!(
        capture_file_paths(&fixture.artifact_root, &fixture.artifact_root).is_empty(),
        "{}",
        if rollback_rehearsal {
            "rollback replay must not execute a new camera effect"
        } else {
            "completed restart replay must not execute a new camera effect"
        }
    );
    restarted.interrupt();
    expect_offline(&mut events, &topics.status()).await;
    restarted.wait_for_success();

    client.disconnect().await.expect("requester disconnect");
    expect_disconnect(&mut events).await;
}

struct LiveFixture {
    profile: DesktopLiveProfile,
    port: u16,
    instance_id: String,
    session_id: String,
    requester_id: String,
    target_fingerprint: String,
    camera_device_id: Option<String>,
    broker_restart: BrokerRestart,
    app_binary: PathBuf,
    package_manifest: PathBuf,
    rollback_package: Option<RollbackPackageFixture>,
    config_root: PathBuf,
    log_path: PathBuf,
    artifact_root: PathBuf,
    private_root_text: String,
    ca: Vec<u8>,
    requester_certificate: Vec<u8>,
    requester_key: Vec<u8>,
    ca_path: PathBuf,
    yeonjang_certificate_path: PathBuf,
    yeonjang_key_path: PathBuf,
}

/// Exact previous package inputs supplied only by the release operator.
struct RollbackPackageFixture {
    binary: PathBuf,
    package_manifest: PathBuf,
    log_path: PathBuf,
}

/// Minimal loaded identity retained for current/previous digest separation.
struct VerifiedPackageIdentity {
    binary_sha256: String,
}

/// Exact harness-owned mechanism used to interrupt only the controlled broker.
enum BrokerRestart {
    DockerContainer(String),
    ExactCommand(PathBuf),
}

impl BrokerRestart {
    fn from_environment(config_root: &Path) -> Self {
        let container = std::env::var("YEONJANG_TEST_MQTT_BROKER_CONTAINER")
            .ok()
            .filter(|value| !value.trim().is_empty());
        let command = std::env::var_os("YEONJANG_TEST_MQTT_BROKER_RESTART_COMMAND")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from);
        match (container, command) {
            (Some(container), None) => {
                assert!(
                    container.starts_with("knowbee-yeonjang-mtls-")
                        && container
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-'),
                    "live gate broker identity is not script-owned"
                );
                Self::DockerContainer(container)
            }
            (None, Some(command)) => {
                let metadata = command
                    .symlink_metadata()
                    .expect("native broker restart command metadata");
                assert!(
                    command.is_absolute()
                        && metadata.is_file()
                        && !metadata.file_type().is_symlink()
                        && command.parent() == Some(config_root)
                        && command.file_name().and_then(|name| name.to_str())
                            == Some("restart-mqtt-broker.cmd"),
                    "native broker restart command is not exact and script-owned"
                );
                Self::ExactCommand(command)
            }
            _ => panic!("live gate requires exactly one broker restart mechanism"),
        }
    }

    fn restart(&self) {
        let restart = match self {
            Self::DockerContainer(container) => Command::new("docker")
                .arg("kill")
                .arg("--signal")
                .arg("USR1")
                .arg(container)
                .status(),
            Self::ExactCommand(command) => {
                #[cfg(target_os = "windows")]
                {
                    Command::new("cmd.exe")
                        .arg("/d")
                        .arg("/c")
                        .arg(command)
                        .status()
                }
                #[cfg(not(target_os = "windows"))]
                {
                    Command::new(command).status()
                }
            }
        }
        .expect("script-owned broker restart");
        assert!(restart.success(), "script-owned broker restart failed");
    }
}

impl LiveFixture {
    fn from_environment(profile: DesktopLiveProfile) -> Self {
        let config_root = required_path("YEONJANG_TEST_LIVE_CONFIG_ROOT");
        let artifact_root = required_path("YEONJANG_TEST_LIVE_ARTIFACT_ROOT");
        let instance_id = required_environment("YEONJANG_TEST_LIVE_INSTANCE");
        let host_fingerprint = required_environment("YEONJANG_TEST_LIVE_HOST_FINGERPRINT");
        let install_fingerprint = required_environment("YEONJANG_TEST_LIVE_INSTALL_FINGERPRINT");
        let camera_device_id = (profile.target_os == "windows")
            .then(|| required_environment("YEONJANG_TEST_LIVE_CAMERA_DEVICE_ID"));
        Self {
            profile,
            port: required_environment("YEONJANG_TEST_MQTT_PORT")
                .parse()
                .expect("live broker port"),
            session_id: required_environment("YEONJANG_TEST_LIVE_SESSION"),
            requester_id: required_environment("YEONJANG_TEST_LIVE_REQUESTER"),
            broker_restart: BrokerRestart::from_environment(&config_root),
            target_fingerprint: target_fingerprint(
                &instance_id,
                &host_fingerprint,
                &install_fingerprint,
            ),
            camera_device_id,
            instance_id,
            app_binary: required_path("YEONJANG_TEST_LIVE_BINARY"),
            package_manifest: required_path("YEONJANG_TEST_LIVE_PACKAGE_MANIFEST"),
            rollback_package: optional_path_pair(
                "YEONJANG_TEST_ROLLBACK_BINARY",
                "YEONJANG_TEST_ROLLBACK_PACKAGE_MANIFEST",
            )
            .map(|(binary, package_manifest)| RollbackPackageFixture {
                binary,
                package_manifest,
                log_path: config_root.join("rollback-runtime.log"),
            }),
            log_path: required_path("YEONJANG_TEST_LIVE_LOG"),
            private_root_text: config_root.display().to_string(),
            config_root,
            artifact_root,
            ca: read_fixture("YEONJANG_TEST_MQTT_CA"),
            requester_certificate: read_fixture("YEONJANG_TEST_MQTT_REQUESTER_CERT"),
            requester_key: read_fixture("YEONJANG_TEST_MQTT_REQUESTER_KEY"),
            ca_path: required_path("YEONJANG_TEST_MQTT_CA"),
            yeonjang_certificate_path: required_path("YEONJANG_TEST_MQTT_YEONJANG_CERT"),
            yeonjang_key_path: required_path("YEONJANG_TEST_MQTT_YEONJANG_KEY"),
        }
    }

    fn verify_loaded_package_identity(&self) -> VerifiedPackageIdentity {
        verify_package_identity(
            &self.app_binary,
            &self.package_manifest,
            self.profile,
            "current",
        )
    }

    fn verify_rollback_package_identity(&self, current: &VerifiedPackageIdentity) {
        let Some(rollback) = &self.rollback_package else {
            return;
        };
        let previous = verify_package_identity(
            &rollback.binary,
            &rollback.package_manifest,
            self.profile,
            "rollback",
        );
        assert_ne!(
            current.binary_sha256, previous.binary_sha256,
            "rollback package must differ from the current package"
        );
    }

    fn requester_signer(&self) -> MqttV2HmacCrypto {
        let secret =
            derive_mqtt_v2_hmac_key(BROKER_PASSWORD.as_bytes()).expect("derived protocol key");
        MqttV2HmacCrypto::new(
            key(&self.instance_id, "instance-hmac-v2", secret.clone()),
            key(&self.requester_id, REQUESTER_KEY_ID, secret),
        )
        .expect("requester signer")
    }

    fn requester_client(&self) -> (AsyncClient, EventLoop) {
        let mut options = MqttOptions::new("live-reference-client", "localhost", self.port);
        options.set_transport(Transport::Tls(TlsConfiguration::Simple {
            ca: self.ca.clone(),
            alpn: None,
            client_auth: Some((
                self.requester_certificate.clone(),
                self.requester_key.clone(),
            )),
        }));
        options.set_keep_alive(Duration::from_secs(10));
        options.set_max_packet_size(512 * 1024, 512 * 1024);
        let (client, mut events) = AsyncClient::new(options, 16);
        let mut network = NetworkOptions::new();
        network.set_connection_timeout(20);
        events.set_network_options(network);
        (client, events)
    }
}

fn verify_package_identity(
    binary: &Path,
    package_manifest: &Path,
    profile: DesktopLiveProfile,
    label: &str,
) -> VerifiedPackageIdentity {
    let manifest: Value = serde_json::from_slice(
        &fs::read(package_manifest).unwrap_or_else(|_| panic!("{label} package identity manifest")),
    )
    .unwrap_or_else(|_| panic!("{label} package identity JSON"));
    let output = Command::new(binary)
        .arg("--release-identity")
        .output()
        .unwrap_or_else(|_| panic!("{label} loaded app identity"));
    assert!(output.status.success(), "{label} identity command failed");
    let loaded: Value = serde_json::from_slice(&output.stdout)
        .unwrap_or_else(|_| panic!("{label} loaded identity JSON"));
    assert_eq!(manifest["schemaId"], "yeonjang.package-identity.v1");
    assert_eq!(manifest["binary"]["sha256"], loaded["binary_sha256"]);
    assert_eq!(manifest["binary"]["sizeBytes"], loaded["binary_size_bytes"]);
    assert_eq!(manifest["target"]["key"], profile.package_target);
    assert_eq!(loaded["target_os"], profile.target_os);
    assert_eq!(loaded["target_arch"], profile.target_arch);
    VerifiedPackageIdentity {
        binary_sha256: required_text(&loaded["binary_sha256"], "loaded binary digest").to_string(),
    }
}

struct LiveRuntime {
    child: Child,
    log_path: PathBuf,
}

impl LiveRuntime {
    fn spawn(fixture: &LiveFixture) -> Self {
        Self::spawn_binary(
            fixture,
            &fixture.app_binary,
            &fixture.log_path,
            true,
            "signed live runtime",
        )
    }

    fn spawn_rollback(fixture: &LiveFixture) -> Self {
        let rollback = fixture
            .rollback_package
            .as_ref()
            .expect("rollback package fixture");
        Self::spawn_binary(
            fixture,
            &rollback.binary,
            &rollback.log_path,
            false,
            "signed rollback runtime",
        )
    }

    fn spawn_binary(
        fixture: &LiveFixture,
        binary: &Path,
        log_path: &Path,
        stage_timing: bool,
        label: &str,
    ) -> Self {
        let log = fs::File::create(log_path).expect("live runtime log");
        let child = managed_runtime_command(fixture, binary, stage_timing)
            .stdout(Stdio::null())
            .stderr(Stdio::from(log))
            .stdin(Stdio::piped())
            .spawn()
            .unwrap_or_else(|_| panic!("{label}"));
        let mut child = child;
        child
            .stdin
            .take()
            .expect("broker secret stdin")
            .write_all(BROKER_PASSWORD.as_bytes())
            .expect("broker secret lease");
        Self {
            child,
            log_path: log_path.to_path_buf(),
        }
    }

    fn expect_duplicate_rejected(fixture: &LiveFixture) {
        let duplicate_log_path = fixture.log_path.with_file_name("live-duplicate.log");
        let log = fs::File::create(&duplicate_log_path).expect("duplicate runtime log");
        let mut child = managed_runtime_command(fixture, &fixture.app_binary, true)
            .stdout(Stdio::null())
            .stderr(Stdio::from(log))
            .stdin(Stdio::piped())
            .spawn()
            .expect("duplicate signed runtime");
        child
            .stdin
            .take()
            .expect("duplicate broker secret stdin")
            .write_all(BROKER_PASSWORD.as_bytes())
            .expect("duplicate broker secret lease");
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let status = loop {
            if let Some(status) = child.try_wait().expect("duplicate runtime wait") {
                break status;
            }
            if std::time::Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("duplicate runtime did not reject within its bounded startup");
            }
            std::thread::sleep(Duration::from_millis(25));
        };
        let failure = bounded_log(&duplicate_log_path);
        assert!(
            !status.success(),
            "duplicate runtime unexpectedly succeeded"
        );
        assert!(
            failure.contains("already_running"),
            "duplicate runtime returned the wrong failure: {failure}"
        );
        assert!(!failure.contains(BROKER_PASSWORD));
        assert!(!failure.contains(&fixture.private_root_text));
        assert!(!failure.contains(&fixture.yeonjang_key_path.display().to_string()));
    }

    #[cfg(not(target_os = "windows"))]
    fn interrupt(&mut self) {
        let status = Command::new("kill")
            .arg("-INT")
            .arg(self.child.id().to_string())
            .status()
            .expect("runtime interrupt");
        assert!(status.success(), "runtime interrupt failed");
    }

    #[cfg(target_os = "windows")]
    fn interrupt(&mut self) {
        // CREATE_NEW_PROCESS_GROUP makes the child PID the exact group ID, so
        // Ctrl+Break cannot stop the requester test process or another runtime.
        let generated = unsafe { GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, self.child.id()) };
        assert_ne!(generated, 0, "runtime Ctrl+Break generation failed");
        thread::sleep(Duration::from_millis(25));
    }

    fn wait_for_success(&mut self) {
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(status) = self.child.try_wait().expect("runtime wait") {
                assert!(
                    status.success(),
                    "runtime exited unsuccessfully: {}",
                    bounded_log(&self.log_path)
                );
                return;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "runtime shutdown did not finish: {}",
                bounded_log(&self.log_path)
            );
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

fn managed_runtime_command(fixture: &LiveFixture, binary: &Path, stage_timing: bool) -> Command {
    let mut command = Command::new(binary);
    command
        .arg("--managed-tls")
        .arg("--config-root")
        .arg(&fixture.config_root)
        .arg("--broker-secret-stdin")
        .env("YEONJANG_MQTT_CA_CERT_PATH", &fixture.ca_path)
        .env(
            "YEONJANG_MQTT_CLIENT_CERT_PATH",
            &fixture.yeonjang_certificate_path,
        )
        .env("YEONJANG_MQTT_CLIENT_KEY_PATH", &fixture.yeonjang_key_path);
    if stage_timing {
        command.arg("--stage-timing-jsonl");
    }
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NEW_PROCESS_GROUP);
    command
}

impl Drop for LiveRuntime {
    fn drop(&mut self) {
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

struct CaptureIdentity {
    sequence: u64,
    method: &'static str,
    resource: &'static str,
    key: String,
    message_id: String,
    request_id: String,
    command_id: String,
    operation_id: String,
}

impl CaptureIdentity {
    fn new(sequence: u64, method: &'static str) -> Self {
        Self::with_variant(sequence, method, None)
    }

    fn with_variant(sequence: u64, method: &'static str, variant: Option<&str>) -> Self {
        let kind = if method == "camera.capture" {
            "camera"
        } else {
            "screen"
        };
        let key = variant.map_or_else(|| kind.to_string(), |variant| format!("{kind}-{variant}"));
        Self {
            sequence,
            method,
            resource: kind,
            message_id: format!("{key}-message"),
            request_id: format!("{key}-request"),
            command_id: format!("{key}-command"),
            operation_id: format!("{key}-operation"),
            key,
        }
    }
}

fn signed_capture_command(
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    identity: &CaptureIdentity,
    signer: &MqttV2HmacCrypto,
    now: i64,
) -> Value {
    let expires_at = now + 60_000;
    let suffix = identity.key.as_str();
    let params = if identity.method == "camera.capture" {
        let mut params = json!({"capture_timeout_ms": 20_000});
        if let Some(device_id) = fixture.camera_device_id.as_deref() {
            params["device_id"] = device_id.into();
        }
        params
    } else {
        json!({})
    };
    let mut value = json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.command.v2",
        "message_kind": "command",
        "message_id": identity.message_id,
        "request_id": identity.request_id,
        "command_id": identity.command_id,
        "operation_id": identity.operation_id,
        "correlation_id": format!("{suffix}-correlation"),
        "causation_id": format!("{suffix}-causation"),
        "requester_id": fixture.requester_id,
        "target_instance_id": fixture.instance_id,
        "target_session_id": fixture.session_id,
        "target_fingerprint": fixture.target_fingerprint,
        "idempotency_key": format!("{suffix}-idempotency"),
        "cancellation_id": format!("{suffix}-cancellation"),
        "cancel_token": format!("{suffix}-cancel-token"),
        "issued_at": now,
        "expires_at": expires_at,
        "sequence": identity.sequence,
        "payload": {"method": identity.method, "params": params},
        "authorization": {
            "schema_version": 1,
            "authorization_id": format!("{suffix}-authorization"),
            "issuer": fixture.requester_id,
            "key_id": REQUESTER_KEY_ID,
            "audience": fixture.instance_id,
            "scope": "effect.execute",
            "method": identity.method,
            "resource": identity.resource,
            "requester_id": fixture.requester_id,
            "command_id": identity.command_id,
            "operation_id": identity.operation_id,
            "target_instance_id": fixture.instance_id,
            "target_session_id": fixture.session_id,
            "target_fingerprint": fixture.target_fingerprint,
            "idempotency_key": format!("{suffix}-idempotency"),
            "cancellation_id": format!("{suffix}-cancellation"),
            "cancel_token": format!("{suffix}-cancel-token"),
            "expires_at": expires_at,
            "nonce": format!("{suffix}-nonce"),
            "signature": "00".repeat(32)
        }
    });
    let parsed = parse_v2_command(
        topics.command(),
        &serde_json::to_vec(&value).expect("command bytes"),
        now,
        topics,
    )
    .expect("live command parse");
    value["authorization"]["signature"] = signer
        .sign(
            &fixture.requester_id,
            REQUESTER_KEY_ID,
            &parsed.authorization_signing_bytes(),
        )
        .expect("live command signature")
        .into();
    value
}

fn signed_command_cancel(
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    capture: &CaptureIdentity,
    signer: &MqttV2HmacCrypto,
    now: i64,
) -> Value {
    let expires_at = now + 60_000;
    let suffix = format!("{}-cancel-control", capture.key);
    let target_idempotency = format!("{}-idempotency", capture.key);
    let cancellation_id = format!("{}-cancellation", capture.key);
    let cancel_token = format!("{}-cancel-token", capture.key);
    let mut value = json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": format!("{suffix}-message"),
        "request_id": format!("{suffix}-request"),
        "command_id": format!("{suffix}-command"),
        "operation_id": format!("{suffix}-operation"),
        "correlation_id": format!("{suffix}-correlation"),
        "causation_id": capture.message_id,
        "requester_id": fixture.requester_id,
        "target_instance_id": fixture.instance_id,
        "target_session_id": fixture.session_id,
        "target_fingerprint": fixture.target_fingerprint,
        "idempotency_key": format!("{suffix}-idempotency"),
        "issued_at": now, "expires_at": expires_at, "sequence": capture.sequence,
        "payload": {"control": "command.cancel", "params": {
            "target_request_id": capture.request_id,
            "target_command_id": capture.command_id,
            "target_operation_id": capture.operation_id,
            "target_idempotency_key": target_idempotency,
            "cancellation_id": cancellation_id,
            "cancel_token": cancel_token,
            "reason": "user_requested"
        }},
        "authorization": {
            "schema_version": 1,
            "authorization_id": format!("{suffix}-authorization"),
            "issuer": fixture.requester_id, "key_id": REQUESTER_KEY_ID,
            "audience": fixture.instance_id, "scope": "effect.cancel",
            "requester_id": fixture.requester_id,
            "command_id": format!("{suffix}-command"),
            "operation_id": format!("{suffix}-operation"),
            "target_instance_id": fixture.instance_id,
            "target_session_id": fixture.session_id,
            "target_fingerprint": fixture.target_fingerprint,
            "idempotency_key": format!("{suffix}-idempotency"),
            "target_request_id": capture.request_id,
            "target_command_id": capture.command_id,
            "target_operation_id": capture.operation_id,
            "target_idempotency_key": target_idempotency,
            "cancellation_id": cancellation_id,
            "cancel_token": cancel_token,
            "expires_at": expires_at,
            "nonce": format!("{suffix}-nonce"),
            "signature": "00".repeat(32)
        }
    });
    let parsed = parse_v2_control(
        topics.control(),
        &serde_json::to_vec(&value).expect("command cancel bytes"),
        now,
        topics,
    )
    .expect("live command cancel parse");
    value["authorization"]["signature"] = signer
        .sign(
            &fixture.requester_id,
            REQUESTER_KEY_ID,
            &parsed.authorization_signing_bytes(),
        )
        .expect("live command cancel signature")
        .into();
    value
}

fn signed_receipt_query(
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    capture: &CaptureIdentity,
    terminal_response: &Value,
    signer: &MqttV2HmacCrypto,
    now: i64,
) -> Value {
    let expires_at = now + 30_000;
    let terminal = &terminal_response["payload"]["terminal"];
    let scope_digest = required_text(
        &terminal_response["payload"]["target_scope_digest"],
        "terminal query scope digest",
    );
    let terminal_revision = terminal["terminal_revision"]
        .as_u64()
        .expect("terminal revision");
    let mut value = json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "camera-receipt-message",
        "request_id": "camera-receipt-request", "command_id": "camera-receipt-command",
        "operation_id": "camera-receipt-operation",
        "correlation_id": "camera-receipt-correlation",
        "causation_id": capture.message_id, "requester_id": fixture.requester_id,
        "target_instance_id": fixture.instance_id, "target_session_id": fixture.session_id,
        "target_fingerprint": fixture.target_fingerprint,
        "idempotency_key": "camera-receipt-idempotency",
        "issued_at": now, "expires_at": expires_at, "sequence": 1,
        "payload": {"control": "receipt.get", "params": {
            "target_request_id": capture.request_id,
            "target_command_id": capture.command_id,
            "target_operation_id": capture.operation_id,
            "target_idempotency_key": "camera-idempotency",
            "target_scope_digest": scope_digest,
            "expected_terminal_revision": terminal_revision
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "camera-receipt-authorization",
            "issuer": fixture.requester_id, "key_id": REQUESTER_KEY_ID,
            "audience": fixture.instance_id, "scope": "receipt.read",
            "requester_id": fixture.requester_id,
            "command_id": "camera-receipt-command",
            "operation_id": "camera-receipt-operation",
            "target_instance_id": fixture.instance_id,
            "target_session_id": fixture.session_id,
            "target_fingerprint": fixture.target_fingerprint,
            "idempotency_key": "camera-receipt-idempotency",
            "target_request_id": capture.request_id,
            "target_command_id": capture.command_id,
            "target_operation_id": capture.operation_id,
            "target_idempotency_key": "camera-idempotency",
            "target_scope_digest": scope_digest,
            "expected_terminal_revision": terminal_revision,
            "expires_at": expires_at, "nonce": "camera-receipt-nonce",
            "signature": "00".repeat(32)
        }
    });
    let parsed = parse_v2_receipt_query(
        topics.control(),
        &serde_json::to_vec(&value).expect("receipt query bytes"),
        now,
        topics,
    )
    .expect("receipt query parse");
    value["authorization"]["signature"] = signer
        .sign(
            &fixture.requester_id,
            REQUESTER_KEY_ID,
            &parsed.authorization_signing_bytes(),
        )
        .expect("receipt query signature")
        .into();
    value
}

fn signed_response_ack(
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    capture: &CaptureIdentity,
    terminal_response: &Value,
    signer: &MqttV2HmacCrypto,
    now: i64,
) -> Value {
    let expires_at = now + 30_000;
    let receipt_id = required_text(&terminal_response["receipt_id"], "terminal receipt ID");
    let response_digest = required_text(
        &terminal_response["response_digest"],
        "terminal response digest",
    );
    let terminal_revision = terminal_response["payload"]["terminal"]["terminal_revision"]
        .as_u64()
        .expect("terminal revision");
    let mut value = json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "camera-response-ack-message",
        "request_id": "camera-response-ack-request",
        "command_id": "camera-response-ack-command",
        "operation_id": "camera-response-ack-operation",
        "correlation_id": "camera-response-ack-correlation",
        "causation_id": terminal_response["message_id"],
        "requester_id": fixture.requester_id,
        "target_instance_id": fixture.instance_id, "target_session_id": fixture.session_id,
        "target_fingerprint": fixture.target_fingerprint,
        "idempotency_key": "camera-response-ack-idempotency",
        "issued_at": now, "expires_at": expires_at, "sequence": 1,
        "payload": {"control": "response.ack", "params": {
            "receipt_id": receipt_id,
            "target_request_id": capture.request_id,
            "target_command_id": capture.command_id,
            "target_operation_id": capture.operation_id,
            "target_idempotency_key": "camera-idempotency",
            "terminal_revision": terminal_revision,
            "response_digest": response_digest
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "camera-response-ack-authorization",
            "issuer": fixture.requester_id, "key_id": REQUESTER_KEY_ID,
            "audience": fixture.instance_id, "scope": "response.ack",
            "requester_id": fixture.requester_id,
            "command_id": "camera-response-ack-command",
            "operation_id": "camera-response-ack-operation",
            "target_instance_id": fixture.instance_id,
            "target_session_id": fixture.session_id,
            "target_fingerprint": fixture.target_fingerprint,
            "idempotency_key": "camera-response-ack-idempotency",
            "receipt_id": receipt_id,
            "target_request_id": capture.request_id,
            "target_command_id": capture.command_id,
            "target_operation_id": capture.operation_id,
            "target_idempotency_key": "camera-idempotency",
            "terminal_revision": terminal_revision,
            "response_digest": response_digest,
            "expires_at": expires_at, "nonce": "camera-response-ack-nonce",
            "signature": "00".repeat(32)
        }
    });
    let parsed = parse_v2_response_ack(
        topics.control(),
        &serde_json::to_vec(&value).expect("response ack bytes"),
        now,
        topics,
    )
    .expect("response ack parse");
    value["authorization"]["signature"] = signer
        .sign(
            &fixture.requester_id,
            REQUESTER_KEY_ID,
            &parsed.authorization_signing_bytes(),
        )
        .expect("response ack signature")
        .into();
    value
}

fn signed_policy_admin(
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    suffix: &str,
    sequence: u64,
    payload: Value,
    signer: &MqttV2HmacCrypto,
    now: i64,
) -> Value {
    let expires_at = now + 30_000;
    let mut value = json!({
        "protocol_version": 2, "schema_id": "yeonjang.admin.v2",
        "message_kind": "admin", "message_id": format!("policy-{suffix}-message"),
        "request_id": format!("policy-{suffix}-request"),
        "command_id": format!("policy-{suffix}-command"),
        "operation_id": format!("policy-{suffix}-operation"),
        "correlation_id": format!("policy-{suffix}-correlation"),
        "causation_id": "live-policy-acceptance",
        "requester_id": fixture.requester_id,
        "target_instance_id": fixture.instance_id,
        "target_session_id": fixture.session_id,
        "target_fingerprint": fixture.target_fingerprint,
        "idempotency_key": format!("policy-{suffix}-idempotency"),
        "issued_at": now, "expires_at": expires_at, "sequence": sequence,
        "payload": payload,
        "authorization": {
            "schema_version": 1,
            "authorization_id": format!("policy-{suffix}-authorization"),
            "issuer": fixture.requester_id, "key_id": REQUESTER_KEY_ID,
            "audience": fixture.instance_id, "scope": "admin.policy.write",
            "requester_id": fixture.requester_id,
            "command_id": format!("policy-{suffix}-command"),
            "operation_id": format!("policy-{suffix}-operation"),
            "target_instance_id": fixture.instance_id,
            "target_session_id": fixture.session_id,
            "target_fingerprint": fixture.target_fingerprint,
            "idempotency_key": format!("policy-{suffix}-idempotency"),
            "expires_at": expires_at, "nonce": format!("policy-{suffix}-nonce"),
            "signature": "00".repeat(32)
        }
    });
    let parsed = parse_v2_policy_admin(
        topics.admin(),
        &serde_json::to_vec(&value).expect("policy admin bytes"),
        false,
        now,
        topics,
    )
    .expect("policy admin parse");
    value["authorization"]["signature"] = signer
        .sign(
            &fixture.requester_id,
            REQUESTER_KEY_ID,
            &parsed.authorization_signing_bytes(),
        )
        .expect("policy admin signature")
        .into();
    value
}

#[allow(clippy::too_many_arguments)]
fn signed_artifact_control(
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    capture: &CaptureIdentity,
    transfer_id: &str,
    artifact_ref: &str,
    full_digest: &str,
    expected_revision: u64,
    acknowledgement: bool,
    signer: &MqttV2HmacCrypto,
    now: i64,
) -> Value {
    let variant = if acknowledgement { "ack" } else { "fetch" };
    let expires_at = now + 30_000;
    let payload = if acknowledgement {
        json!({"artifact": "artifact.ack", "params": {
            "artifact_ref": artifact_ref,
            "owner_request_id": capture.request_id,
            "owner_operation_id": capture.operation_id,
            "expected_revision": expected_revision,
            "transfer_id": transfer_id,
            "full_digest": full_digest
        }})
    } else {
        json!({"artifact": "artifact.fetch", "params": {
            "artifact_ref": artifact_ref,
            "owner_request_id": capture.request_id,
            "owner_operation_id": capture.operation_id,
            "expected_revision": expected_revision,
            "transfer_id": transfer_id,
            "chunk_payload_bytes": 262144
        }})
    };
    let mut value = json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.artifact-control.v2",
        "message_kind": "control",
        "message_id": format!("artifact-{variant}-message-{}", capture.sequence),
        "request_id": format!("artifact-{variant}-request-{}", capture.sequence),
        "command_id": format!("artifact-{variant}-command-{}", capture.sequence),
        "operation_id": format!("artifact-{variant}-operation-{}", capture.sequence),
        "correlation_id": format!("artifact-correlation-{}", capture.sequence),
        "causation_id": capture.message_id,
        "requester_id": fixture.requester_id,
        "target_instance_id": fixture.instance_id,
        "target_session_id": fixture.session_id,
        "target_fingerprint": fixture.target_fingerprint,
        "idempotency_key": format!("artifact-{variant}-idempotency-{}", capture.sequence),
        "issued_at": now,
        "expires_at": expires_at,
        "sequence": capture.sequence,
        "payload": payload,
        "authorization": {
            "schema_version": 1,
            "authorization_id": format!("artifact-{variant}-authorization-{}", capture.sequence),
            "issuer": fixture.requester_id,
            "key_id": REQUESTER_KEY_ID,
            "audience": fixture.instance_id,
            "scope": "artifact.read",
            "requester_id": fixture.requester_id,
            "command_id": format!("artifact-{variant}-command-{}", capture.sequence),
            "operation_id": format!("artifact-{variant}-operation-{}", capture.sequence),
            "target_instance_id": fixture.instance_id,
            "target_session_id": fixture.session_id,
            "target_fingerprint": fixture.target_fingerprint,
            "idempotency_key": format!("artifact-{variant}-idempotency-{}", capture.sequence),
            "artifact_ref": artifact_ref,
            "owner_request_id": capture.request_id,
            "owner_operation_id": capture.operation_id,
            "transfer_id": transfer_id,
            "expected_revision": expected_revision,
            "full_digest": if acknowledgement { Some(full_digest) } else { None },
            "chunk_payload_bytes": if acknowledgement { None } else { Some(262144_u32) },
            "expires_at": expires_at,
            "nonce": format!("artifact-{variant}-nonce-{}", capture.sequence),
            "signature": "00".repeat(32)
        }
    });
    let topic = if acknowledgement {
        topics
            .artifact_ack(transfer_id)
            .expect("artifact ack topic")
    } else {
        topics.control()
    };
    let parsed = parse_v2_artifact_control(
        topic,
        &serde_json::to_vec(&value).expect("artifact control bytes"),
        false,
        now,
        topics,
    )
    .expect("live artifact control parse");
    value["authorization"]["signature"] = signer
        .sign(
            &fixture.requester_id,
            REQUESTER_KEY_ID,
            &parsed.authorization_signing_bytes(),
        )
        .expect("live artifact signature")
        .into();
    value
}

fn signed_capture_permission_query(
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    signer: &MqttV2HmacCrypto,
    now: i64,
) -> Value {
    let expires_at = now + 30_000;
    let mut value = json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.control.v2",
        "message_kind": "control",
        "message_id": "capture-permission-message",
        "request_id": "capture-permission-request",
        "command_id": "capture-permission-command",
        "operation_id": "capture-permission-operation",
        "correlation_id": "capture-permission-correlation",
        "causation_id": "capture-permission-causation",
        "requester_id": fixture.requester_id,
        "target_instance_id": fixture.instance_id,
        "target_session_id": fixture.session_id,
        "target_fingerprint": fixture.target_fingerprint,
        "idempotency_key": "capture-permission-idempotency",
        "issued_at": now,
        "expires_at": expires_at,
        "sequence": 1,
        "payload": {"control": "capture.permission.get", "params": {}},
        "authorization": {
            "schema_version": 1,
            "authorization_id": "capture-permission-authorization",
            "issuer": fixture.requester_id,
            "key_id": REQUESTER_KEY_ID,
            "audience": fixture.instance_id,
            "scope": "permission.read",
            "requester_id": fixture.requester_id,
            "command_id": "capture-permission-command",
            "operation_id": "capture-permission-operation",
            "target_instance_id": fixture.instance_id,
            "target_session_id": fixture.session_id,
            "target_fingerprint": fixture.target_fingerprint,
            "idempotency_key": "capture-permission-idempotency",
            "expires_at": expires_at,
            "nonce": "capture-permission-nonce",
            "signature": "00".repeat(32)
        }
    });
    let parsed = parse_v2_capture_permission_query(
        topics.control(),
        &serde_json::to_vec(&value).expect("permission query bytes"),
        false,
        now,
        topics,
    )
    .expect("live permission query parse");
    value["authorization"]["signature"] = signer
        .sign(
            &fixture.requester_id,
            REQUESTER_KEY_ID,
            &parsed.authorization_signing_bytes(),
        )
        .expect("live permission query signature")
        .into();
    value
}

#[allow(clippy::too_many_arguments)]
fn signed_artifact_cancel(
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    capture: &CaptureIdentity,
    transfer_id: &str,
    artifact_ref: &str,
    expected_revision: u64,
    signer: &MqttV2HmacCrypto,
    now: i64,
) -> Value {
    let expires_at = now + 30_000;
    let mut value = json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.artifact-control.v2",
        "message_kind": "control",
        "message_id": format!("artifact-cancel-message-{}", capture.sequence),
        "request_id": format!("artifact-cancel-request-{}", capture.sequence),
        "command_id": format!("artifact-cancel-command-{}", capture.sequence),
        "operation_id": format!("artifact-cancel-operation-{}", capture.sequence),
        "correlation_id": format!("artifact-correlation-{}", capture.sequence),
        "causation_id": capture.message_id,
        "requester_id": fixture.requester_id,
        "target_instance_id": fixture.instance_id,
        "target_session_id": fixture.session_id,
        "target_fingerprint": fixture.target_fingerprint,
        "idempotency_key": format!("artifact-cancel-idempotency-{}", capture.sequence),
        "issued_at": now,
        "expires_at": expires_at,
        "sequence": capture.sequence,
        "payload": {"artifact": "artifact.cancel", "params": {
            "artifact_ref": artifact_ref,
            "owner_request_id": capture.request_id,
            "owner_operation_id": capture.operation_id,
            "expected_revision": expected_revision,
            "transfer_id": transfer_id
        }},
        "authorization": {
            "schema_version": 1,
            "authorization_id": format!("artifact-cancel-authorization-{}", capture.sequence),
            "issuer": fixture.requester_id,
            "key_id": REQUESTER_KEY_ID,
            "audience": fixture.instance_id,
            "scope": "artifact.cancel",
            "requester_id": fixture.requester_id,
            "command_id": format!("artifact-cancel-command-{}", capture.sequence),
            "operation_id": format!("artifact-cancel-operation-{}", capture.sequence),
            "target_instance_id": fixture.instance_id,
            "target_session_id": fixture.session_id,
            "target_fingerprint": fixture.target_fingerprint,
            "idempotency_key": format!("artifact-cancel-idempotency-{}", capture.sequence),
            "artifact_ref": artifact_ref,
            "owner_request_id": capture.request_id,
            "owner_operation_id": capture.operation_id,
            "transfer_id": transfer_id,
            "expected_revision": expected_revision,
            "full_digest": null,
            "chunk_payload_bytes": null,
            "expires_at": expires_at,
            "nonce": format!("artifact-cancel-nonce-{}", capture.sequence),
            "signature": "00".repeat(32)
        }
    });
    let parsed = parse_v2_artifact_control(
        topics.control(),
        &serde_json::to_vec(&value).expect("artifact cancel bytes"),
        false,
        now,
        topics,
    )
    .expect("live artifact cancel parse");
    value["authorization"]["signature"] = signer
        .sign(
            &fixture.requester_id,
            REQUESTER_KEY_ID,
            &parsed.authorization_signing_bytes(),
        )
        .expect("live artifact cancel signature")
        .into();
    value
}

fn assert_artifact_cancel_response(
    response: &Value,
    outcome: &str,
    artifact_ref: &str,
    capture: &CaptureIdentity,
    transfer_id: &str,
    observed_revision: u64,
) {
    assert_eq!(response["schema_id"], "yeonjang.artifact-cancel-ack.v2");
    assert_eq!(
        response["request_id"],
        format!("artifact-cancel-request-{}", capture.sequence)
    );
    assert_eq!(response["payload"]["artifact_ref"], artifact_ref);
    assert_eq!(response["payload"]["owner_request_id"], capture.request_id);
    assert_eq!(
        response["payload"]["owner_operation_id"],
        capture.operation_id
    );
    assert_eq!(response["payload"]["transfer_id"], transfer_id);
    assert_eq!(response["payload"]["observed_revision"], observed_revision);
    assert_eq!(response["payload"]["outcome"], outcome);
    assert_eq!(response["payload"]["lifecycle_revision"], 3);
    assert_eq!(response["authorization"]["scope"], "response.publish");
    let signature = required_text(
        &response["authorization"]["signature"],
        "cancel response signature",
    );
    assert_eq!(signature.len(), 64);
    assert!(signature.bytes().all(|byte| byte.is_ascii_hexdigit()));
}

async fn exercise_policy_deny_and_rollback(
    client: &AsyncClient,
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    signer: &MqttV2HmacCrypto,
    initial_revision: u64,
) {
    let camera_deny = signed_policy_admin(
        topics,
        fixture,
        "deny-camera",
        1,
        json!({"admin": "policy.update", "params": {
            "expected_revision": initial_revision,
            "capability": "camera.capture", "decision": "denied",
            "resource": {"kind": "any"}, "reason": "live reversible camera deny"
        }}),
        signer,
        now_ms(),
    );
    let camera_revision =
        publish_policy_and_expect_revision(client, events, topics, camera_deny).await;
    assert_eq!(camera_revision, initial_revision + 1);

    let screen_deny = signed_policy_admin(
        topics,
        fixture,
        "deny-screen",
        2,
        json!({"admin": "policy.update", "params": {
            "expected_revision": camera_revision,
            "capability": "screen.capture", "decision": "denied",
            "resource": {"kind": "any"}, "reason": "live reversible screen deny"
        }}),
        signer,
        now_ms(),
    );
    let denied_revision =
        publish_policy_and_expect_revision(client, events, topics, screen_deny).await;
    assert_eq!(denied_revision, camera_revision + 1);

    let denied_capabilities =
        replay_capabilities(client, events, topics, signer, &fixture.target_fingerprint).await;
    assert_eq!(
        denied_capabilities["payload"]["advertisedMethods"],
        json!(["camera.capture", "screen.capture"])
    );
    assert_eq!(
        denied_capabilities["payload"]["policyRevision"],
        denied_revision
    );
    for row in denied_capabilities["payload"]["capabilities"]
        .as_array()
        .expect("denied capability rows")
    {
        assert_eq!(row["localPolicy"], "denied");
    }

    let permission_query = signed_capture_permission_query(topics, fixture, signer, now_ms());
    let permission_request_id = required_text(
        &permission_query["request_id"],
        "denied permission request ID",
    )
    .to_string();
    publish_json(client, topics.control(), permission_query).await;
    let denied_permission =
        expect_terminal_response(events, &topics.response(), &permission_request_id).await;
    assert_eq!(
        denied_permission["payload"]["policyRevision"],
        denied_revision
    );
    for row in denied_permission["payload"]["permissions"]
        .as_array()
        .expect("denied permission rows")
    {
        assert_eq!(row["localPolicy"], "denied");
    }

    for (sequence, method, variant) in [
        (94, "camera.capture", "policy-denied"),
        (95, "screen.capture", "policy-denied"),
    ] {
        let identity = CaptureIdentity::with_variant(sequence, method, Some(variant));
        let command = signed_capture_command(topics, fixture, &identity, signer, now_ms());
        publish_and_expect_command_rejection(
            client,
            events,
            topics,
            command,
            "local_policy_denied",
        )
        .await;
    }
    assert!(capture_file_paths(&fixture.artifact_root, &fixture.artifact_root).is_empty());

    let rollback = signed_policy_admin(
        topics,
        fixture,
        "rollback-capture",
        3,
        json!({"admin": "policy.rollback", "params": {
            "expected_current_revision": denied_revision,
            "restore_revision": initial_revision,
            "reason": "restore live capture policy"
        }}),
        signer,
        now_ms(),
    );
    let rollback_revision =
        publish_policy_and_expect_revision(client, events, topics, rollback).await;
    assert_eq!(rollback_revision, denied_revision + 1);
    let restored =
        replay_capabilities(client, events, topics, signer, &fixture.target_fingerprint).await;
    assert_eq!(
        restored["payload"]["advertisedMethods"],
        json!(["camera.capture", "screen.capture"])
    );
    assert_eq!(restored["payload"]["policyRevision"], rollback_revision);
    for row in restored["payload"]["capabilities"]
        .as_array()
        .expect("restored capability rows")
    {
        assert_eq!(row["localPolicy"], "allowed");
    }
    let restored_query = signed_capture_permission_query(topics, fixture, signer, now_ms());
    let restored_request_id = required_text(
        &restored_query["request_id"],
        "restored permission request ID",
    )
    .to_string();
    publish_json(client, topics.control(), restored_query).await;
    let restored_permission =
        expect_terminal_response(events, &topics.response(), &restored_request_id).await;
    assert_eq!(
        restored_permission["payload"]["policyRevision"],
        rollback_revision
    );
    for row in restored_permission["payload"]["permissions"]
        .as_array()
        .expect("restored permission rows")
    {
        assert_eq!(row["localPolicy"], "allowed");
    }
}

async fn exercise_running_command_cancellation(
    client: &AsyncClient,
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    signer: &MqttV2HmacCrypto,
) {
    let capture = CaptureIdentity::with_variant(96, "camera.capture", Some("running-cancellation"));
    publish_json(
        client,
        topics.command(),
        signed_capture_command(topics, fixture, &capture, signer, now_ms()),
    )
    .await;
    // Desktop helpers own cancellable child processes. This delay makes an
    // in-flight cancellation likely, but scheduler and device timing remain a
    // race: only the terminal effect evidence decides whether cancellation
    // happened before dispatch or after the device effect became uncertain.
    tokio::time::sleep(Duration::from_millis(200)).await;
    let cancel = signed_command_cancel(topics, fixture, &capture, signer, now_ms());
    let cancel_request_id =
        required_text(&cancel["request_id"], "command cancel request ID").to_string();
    publish_json(client, topics.control(), cancel).await;

    let (ack, terminal) = tokio::time::timeout(Duration::from_secs(75), async {
        let mut ack = None;
        let mut terminal = None;
        while ack.is_none() || terminal.is_none() {
            let Some(response) =
                next_json_publish(events, &topics.response(), "command cancellation").await
            else {
                continue;
            };
            if response["request_id"] == cancel_request_id {
                ack = Some(response);
            } else if response["request_id"] == capture.request_id {
                terminal = Some(response);
            }
        }
        (
            ack.expect("cancel acknowledgement"),
            terminal.expect("cancelled target terminal"),
        )
    })
    .await
    .expect("actual command cancellation did not converge");

    assert_eq!(ack["schema_id"], "yeonjang.cancel-ack.v2");
    assert_eq!(ack["payload"]["target_terminal"], false);
    assert_eq!(ack["authorization"]["scope"], "response.publish");
    if ack["payload"]["outcome"] == "already_terminal" {
        assert_eq!(
            terminal["payload"]["terminal"]["execution_outcome"],
            "succeeded",
            "already-terminal cancellation target: {}",
            bounded_json(&terminal)
        );
        let artifact = terminal["payload"]["artifact"]
            .as_object()
            .expect("already-terminal cancellation artifact");
        let artifact_ref = required_text(
            &artifact["artifactRef"],
            "already-terminal cancellation artifact ref",
        );
        let full_digest = required_text(
            &artifact["fullDigest"],
            "already-terminal cancellation digest",
        );
        let total_size = artifact["sizeBytes"]
            .as_u64()
            .expect("already-terminal cancellation artifact size");
        let lifecycle_revision = artifact["lifecycleRevision"]
            .as_u64()
            .expect("already-terminal cancellation lifecycle revision");
        let transfer_id = "transfer-running-cancellation-race";
        publish_json(
            client,
            topics.control(),
            signed_artifact_control(
                topics,
                fixture,
                &capture,
                transfer_id,
                artifact_ref,
                full_digest,
                lifecycle_revision,
                false,
                signer,
                now_ms(),
            ),
        )
        .await;
        let bytes = collect_artifact(
            events,
            &topics
                .artifact_chunk(transfer_id)
                .expect("already-terminal cancellation artifact chunk topic"),
            artifact_ref,
            full_digest,
            total_size,
        )
        .await;
        verify_image("camera.capture", &bytes);
        let awaiting_ack = cleanup_receipt(&fixture.artifact_root, artifact_ref)
            .expect("already-terminal cancellation awaiting-ack receipt");
        let acknowledgement_revision = awaiting_ack["revision"]
            .as_u64()
            .expect("already-terminal cancellation acknowledgement revision");
        publish_json(
            client,
            topics
                .artifact_ack(transfer_id)
                .expect("already-terminal cancellation artifact ack topic"),
            signed_artifact_control(
                topics,
                fixture,
                &capture,
                transfer_id,
                artifact_ref,
                full_digest,
                acknowledgement_revision,
                true,
                signer,
                now_ms(),
            ),
        )
        .await;
        expect_outgoing_publish(
            events,
            "already-terminal cancellation artifact acknowledgement",
        )
        .await;
        wait_for_artifact_cleanup(&fixture.artifact_root, artifact_ref, "acknowledged").await;
        return;
    }

    assert_eq!(ack["payload"]["outcome"], "accepted");
    assert_eq!(
        terminal["payload"]["terminal"]["failure"]["reason_code"],
        "cancelled"
    );
    let cancellation_terminal = (
        terminal["payload"]["terminal"]["execution_outcome"].as_str(),
        terminal["payload"]["terminal"]["failure"]["effect_state"].as_str(),
        terminal["payload"]["terminal"]["failure"]["retry_safety"].as_str(),
        terminal["payload"]["terminal"]["failure"]["recovery_action"].as_str(),
    );
    assert!(
        matches!(
            cancellation_terminal,
            (
                Some("cancelled"),
                Some("not_started" | "confirmed_not_applied"),
                Some("not_retryable"),
                Some("none")
            ) | (
                Some("effect_unknown"),
                Some("unknown"),
                Some("manual_verification_required"),
                Some("manual_effect_verification")
            )
        ),
        "running cancellation terminal: {}",
        bounded_json(&terminal)
    );
    assert!(terminal["payload"]["artifact"].is_null());
    assert!(capture_file_paths(&fixture.artifact_root, &fixture.artifact_root).is_empty());
}

async fn exercise_exact_command_duplicate(
    client: &AsyncClient,
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    signer: &MqttV2HmacCrypto,
) {
    let capture = CaptureIdentity::with_variant(98, "camera.capture", Some("exact-duplicate"));
    let command = signed_capture_command(topics, fixture, &capture, signer, now_ms());
    let command_bytes = serde_json::to_vec(&command).expect("duplicate command bytes");
    let correlation = format!("sha256:{:x}", Sha256::digest(&command_bytes));
    for _ in 0..2 {
        client
            .publish(
                topics.command(),
                QoS::AtLeastOnce,
                false,
                command_bytes.clone(),
            )
            .await
            .expect("duplicate command enqueue");
    }

    let mut observed_matching_responses = 0_usize;
    let response_result = tokio::time::timeout(Duration::from_secs(75), async {
        let mut responses = Vec::with_capacity(2);
        while responses.len() < 2 {
            let Some(response) =
                next_json_publish(events, &topics.response(), "exact command duplicate").await
            else {
                continue;
            };
            if response["request_id"] == capture.request_id
                || (response["schema_id"] == "yeonjang.command-rejection.v2"
                    && response["correlation_id"] == correlation)
            {
                responses.push(response);
                observed_matching_responses = responses.len();
            }
        }
        responses
    })
    .await;
    let responses = response_result.unwrap_or_else(|_| {
        panic!(
            "duplicate command responses did not converge; matching_responses={observed_matching_responses}"
        )
    });

    let terminals = responses
        .iter()
        .filter(|response| response["schema_id"] == "yeonjang.response.v2")
        .collect::<Vec<_>>();
    let rejections = responses
        .iter()
        .filter(|response| response["schema_id"] == "yeonjang.command-rejection.v2")
        .collect::<Vec<_>>();
    assert!(!terminals.is_empty() && terminals.len() <= 2);
    assert_eq!(terminals.len() + rejections.len(), 2);
    let terminal = terminals[0];
    assert_eq!(
        terminal["payload"]["terminal"]["execution_outcome"],
        "succeeded",
        "exact duplicate terminal: {}",
        bounded_json(terminal)
    );
    for replay in terminals.iter().skip(1) {
        assert_eq!(replay["payload"], terminal["payload"]);
        assert_eq!(replay["receipt_id"], terminal["receipt_id"]);
        assert_eq!(replay["response_digest"], terminal["response_digest"]);
    }
    for rejection in rejections {
        let reason = required_text(
            &rejection["payload"]["failure"]["reason_code"],
            "duplicate rejection reason",
        );
        assert!(
            matches!(reason, "idempotency_in_progress" | "authorization_replayed"),
            "unexpected duplicate rejection: {}",
            bounded_json(rejection)
        );
        assert_eq!(
            rejection["payload"]["failure"]["effect_state"],
            "not_started"
        );
        if reason == "authorization_replayed" {
            assert_eq!(
                rejection["payload"]["failure"]["retry_safety"],
                "not_retryable"
            );
            assert_eq!(rejection["payload"]["failure"]["recovery_action"], "none");
        }
    }

    let artifact = terminal["payload"]["artifact"]
        .as_object()
        .expect("duplicate terminal artifact");
    let artifact_ref = required_text(&artifact["artifactRef"], "duplicate artifact ref");
    let full_digest = required_text(&artifact["fullDigest"], "duplicate full digest");
    let total_size = artifact["sizeBytes"]
        .as_u64()
        .expect("duplicate artifact size");
    let lifecycle_revision = artifact["lifecycleRevision"]
        .as_u64()
        .expect("duplicate artifact lifecycle revision");
    let transfer_id = "transfer-exact-duplicate";
    publish_json(
        client,
        topics.control(),
        signed_artifact_control(
            topics,
            fixture,
            &capture,
            transfer_id,
            artifact_ref,
            full_digest,
            lifecycle_revision,
            false,
            signer,
            now_ms(),
        ),
    )
    .await;
    let bytes = collect_artifact(
        events,
        &topics
            .artifact_chunk(transfer_id)
            .expect("duplicate artifact chunk topic"),
        artifact_ref,
        full_digest,
        total_size,
    )
    .await;
    verify_image("camera.capture", &bytes);
    let awaiting_ack = cleanup_receipt(&fixture.artifact_root, artifact_ref)
        .expect("duplicate artifact awaiting-ack receipt");
    assert_eq!(awaiting_ack["state"]["kind"], "awaiting_ack");
    assert_eq!(awaiting_ack["state"]["transfer_id"], transfer_id);
    let acknowledgement_revision = awaiting_ack["revision"]
        .as_u64()
        .expect("duplicate acknowledgement revision");
    publish_json(
        client,
        topics
            .artifact_ack(transfer_id)
            .expect("duplicate artifact ack topic"),
        signed_artifact_control(
            topics,
            fixture,
            &capture,
            transfer_id,
            artifact_ref,
            full_digest,
            acknowledgement_revision,
            true,
            signer,
            now_ms(),
        ),
    )
    .await;
    expect_outgoing_publish(events, "duplicate artifact acknowledgement").await;
    wait_for_artifact_cleanup(&fixture.artifact_root, artifact_ref, "acknowledged").await;
}

async fn restart_broker_and_recover(
    client: &mut AsyncClient,
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    signer: &MqttV2HmacCrypto,
) {
    fixture.broker_restart.restart();

    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            if tokio::net::TcpStream::connect(("127.0.0.1", fixture.port))
                .await
                .is_ok()
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await
    .expect("restarted broker port did not become reachable");

    // The harness owns this exact broker restart and recreates only its
    // requester transport with the same mTLS/client identity. The signed app
    // receives no signal: its fresh online/capabilities projections below
    // prove autonomous product reconnect.
    let (reconnected_client, reconnected_events) = fixture.requester_client();
    *client = reconnected_client;
    *events = reconnected_events;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    let mut observed = BTreeMap::<&'static str, usize>::new();
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        assert!(
            !remaining.is_zero(),
            "requester did not reconnect: {observed:?}"
        );
        match tokio::time::timeout(remaining.min(Duration::from_secs(5)), events.poll()).await {
            Ok(Ok(Event::Incoming(Incoming::ConnAck(_)))) => break,
            Ok(Ok(_)) => *observed.entry("mqtt_event").or_default() += 1,
            Ok(Err(error)) => *observed.entry(connection_error_class(&error)).or_default() += 1,
            Err(_) => *observed.entry("poll_timeout").or_default() += 1,
        }
    }

    for topic in [
        topics.response(),
        topics.status(),
        topics.capabilities(),
        format!(
            "yeonjang/v2/instances/{}/sessions/{}/requesters/{}/artifact/+/chunk",
            fixture.instance_id, fixture.session_id, fixture.requester_id
        ),
    ] {
        client
            .subscribe(topic, QoS::AtLeastOnce)
            .await
            .expect("post-reconnect subscription enqueue");
    }
    expect_subacks(events, 4).await;
    expect_online(events, &topics.status()).await;

    // Re-subscribe after online so this observation is broker-retained
    // capability state rather than an in-flight publication.
    client
        .unsubscribe(topics.capabilities())
        .await
        .expect("capabilities unsubscribe enqueue");
    expect_unsuback(events).await;
    client
        .subscribe(topics.capabilities(), QoS::AtLeastOnce)
        .await
        .expect("retained capabilities re-subscription enqueue");
    expect_subacks(events, 1).await;
    let capabilities =
        expect_capabilities(events, topics, signer, &fixture.target_fingerprint).await;
    assert_eq!(
        capabilities["payload"]["advertisedMethods"],
        json!(["camera.capture", "screen.capture"])
    );
}

fn connection_error_class(error: &ConnectionError) -> &'static str {
    match error {
        ConnectionError::MqttState(_) => "mqtt_state",
        ConnectionError::NetworkTimeout => "network_timeout",
        ConnectionError::FlushTimeout => "flush_timeout",
        ConnectionError::Tls(_) => "tls",
        ConnectionError::Io(_) => "io",
        ConnectionError::ConnectionRefused(_) => "connection_refused",
        ConnectionError::NotConnAck(_) => "not_connack",
        ConnectionError::RequestsDone => "requests_done",
    }
}

async fn publish_policy_and_expect_revision(
    client: &AsyncClient,
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    request: Value,
) -> u64 {
    let request_id = required_text(&request["request_id"], "policy request ID").to_string();
    publish_json(client, topics.admin(), request).await;
    let response = expect_terminal_response(events, &topics.response(), &request_id).await;
    assert_eq!(response["schema_id"], "yeonjang.policy-admin-result.v2");
    assert_eq!(response["payload"]["outcome"], "applied");
    assert_eq!(
        response["authorization"]["scope"],
        "admin.policy.write.result"
    );
    response["payload"]["revision"]
        .as_u64()
        .expect("applied policy revision")
}

async fn replay_capabilities(
    client: &AsyncClient,
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    signer: &MqttV2HmacCrypto,
    target_fingerprint: &str,
) -> Value {
    client
        .subscribe(topics.capabilities(), QoS::AtLeastOnce)
        .await
        .expect("capability replay subscription enqueue");
    expect_subacks(events, 1).await;
    expect_capabilities(events, topics, signer, target_fingerprint).await
}

async fn exercise_terminal_delivery_controls(
    client: &AsyncClient,
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    fixture: &LiveFixture,
    capture: &CaptureIdentity,
    terminal_response: &Value,
    signer: &MqttV2HmacCrypto,
) {
    let query = signed_receipt_query(
        topics,
        fixture,
        capture,
        terminal_response,
        signer,
        now_ms(),
    );
    let query_request_id =
        required_text(&query["request_id"], "receipt query request ID").to_string();
    publish_json(client, topics.control(), query).await;
    let receipt = expect_terminal_response(events, &topics.response(), &query_request_id).await;
    assert_eq!(receipt["schema_id"], "yeonjang.receipt-response.v2");
    assert_eq!(receipt["payload"]["outcome"], "found");
    assert_eq!(receipt["payload"]["terminal"], terminal_response["payload"]);
    assert_eq!(
        receipt["authorization"]["scope"], "receipt.response",
        "receipt replay must be separately signed"
    );

    let ack = signed_response_ack(
        topics,
        fixture,
        capture,
        terminal_response,
        signer,
        now_ms(),
    );
    let ack_request_id = required_text(&ack["request_id"], "response ack request ID").to_string();
    publish_json(client, topics.control(), ack.clone()).await;
    let accepted = expect_terminal_response(events, &topics.response(), &ack_request_id).await;
    assert_eq!(accepted["schema_id"], "yeonjang.response-ack-result.v2");
    assert_eq!(accepted["payload"]["outcome"], "accepted");
    assert_eq!(
        accepted["payload"]["receipt_id"],
        terminal_response["receipt_id"]
    );
    assert_eq!(
        accepted["payload"]["response_digest"],
        terminal_response["response_digest"]
    );
    let delivery_revision = accepted["payload"]["delivery_revision"]
        .as_u64()
        .expect("consumer acknowledgement delivery revision");

    publish_json(client, topics.control(), ack).await;
    let duplicate = expect_terminal_response(events, &topics.response(), &ack_request_id).await;
    assert_eq!(duplicate["payload"]["outcome"], "duplicate");
    assert_eq!(duplicate["payload"]["delivery_revision"], delivery_revision);
}

async fn publish_json(client: &AsyncClient, topic: String, value: Value) {
    client
        .publish(
            topic,
            QoS::AtLeastOnce,
            false,
            serde_json::to_vec(&value).expect("MQTT JSON"),
        )
        .await
        .expect("MQTT publish enqueue");
}

async fn expect_subacks(events: &mut EventLoop, expected: usize) {
    let mut count = 0;
    while count < expected {
        if matches!(
            next_event(events, "subscription acknowledgement").await,
            Event::Incoming(Incoming::SubAck(_))
        ) {
            count += 1;
        }
    }
}

async fn expect_unsuback(events: &mut EventLoop) {
    loop {
        if matches!(
            next_event(events, "unsubscription acknowledgement").await,
            Event::Incoming(Incoming::UnsubAck(_))
        ) {
            return;
        }
    }
}

async fn expect_online(events: &mut EventLoop, topic: &str) {
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            if let Some(value) = next_json_publish(events, topic, "online status").await
                && value["payload"]["state"] == "online"
            {
                return;
            }
        }
    })
    .await
    .expect("signed runtime did not publish online status");
}

async fn expect_offline(events: &mut EventLoop, topic: &str) {
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            if let Some(value) = next_json_publish(events, topic, "offline status").await
                && value["payload"]["state"] == "offline"
                && value["payload"]["reason"] == "graceful_shutdown"
            {
                return;
            }
        }
    })
    .await
    .expect("signed runtime did not publish graceful offline status");
}

async fn expect_capabilities(
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    verifier: &MqttV2HmacCrypto,
    target_fingerprint: &str,
) -> Value {
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            let Event::Incoming(Incoming::Publish(publish)) =
                next_event(events, "retained capabilities").await
            else {
                continue;
            };
            if publish.topic != topics.capabilities() {
                continue;
            }
            assert!(
                publish.retain,
                "capabilities subscription must replay retained state"
            );
            let parsed = parse_v2_capabilities(
                topics.capabilities(),
                &publish.payload,
                true,
                now_ms(),
                topics,
            )
            .expect("strict capabilities projection");
            V2CapabilitiesAdmission::new(verifier)
                .admit(&parsed)
                .expect("capabilities signature");
            let value: Value = serde_json::from_slice(&publish.payload).expect("capabilities JSON");
            assert_eq!(value["target_instance_id"], topics.instance_id());
            assert_eq!(value["target_session_id"], topics.session_id());
            assert_eq!(value["target_fingerprint"], target_fingerprint);
            assert_eq!(value["authorization"]["scope"], "capabilities.publish");
            return value;
        }
    })
    .await
    .expect("signed runtime did not replay retained capabilities")
}

async fn expect_terminal_response(events: &mut EventLoop, topic: &str, request_id: &str) -> Value {
    tokio::time::timeout(Duration::from_secs(75), async {
        loop {
            if let Some(value) = next_json_publish(events, topic, "terminal response").await
                && value["request_id"] == request_id
            {
                return value;
            }
        }
    })
    .await
    .expect("signed runtime did not publish a terminal response")
}

async fn publish_and_expect_command_rejection(
    client: &AsyncClient,
    events: &mut EventLoop,
    topics: &MqttV2TopicSet,
    command: Value,
    expected_reason: &str,
) {
    let bytes = serde_json::to_vec(&command).expect("rejected command bytes");
    let correlation = format!("sha256:{:x}", Sha256::digest(&bytes));
    client
        .publish(topics.command(), QoS::AtLeastOnce, false, bytes)
        .await
        .expect("rejected command enqueue");
    let response = tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            if let Some(value) =
                next_json_publish(events, &topics.response(), "command rejection").await
                && value["schema_id"] == "yeonjang.command-rejection.v2"
                && value["correlation_id"] == correlation
            {
                return value;
            }
        }
    })
    .await
    .expect("signed runtime did not publish command rejection");
    assert_eq!(
        response["payload"]["failure"]["reason_code"],
        expected_reason
    );
    assert_eq!(
        response["payload"]["failure"]["effect_state"],
        "not_started"
    );
    assert_eq!(response["requester_id"], topics.requester_id());
    assert_eq!(response["target_instance_id"], topics.instance_id());
    assert_eq!(response["target_session_id"], topics.session_id());
    assert_eq!(response["authorization"]["scope"], "response.publish");
    assert_eq!(response["authorization"]["correlation_id"], correlation);
    for forbidden in [
        "request_id",
        "command_id",
        "operation_id",
        "idempotency_key",
    ] {
        assert!(!response.to_string().contains(forbidden));
    }
}

async fn next_json_publish(events: &mut EventLoop, topic: &str, context: &str) -> Option<Value> {
    match next_event(events, context).await {
        Event::Incoming(Incoming::Publish(publish)) if publish.topic == topic => Some(
            serde_json::from_slice(&publish.payload)
                .unwrap_or_else(|_| panic!("invalid JSON on {context}")),
        ),
        _ => None,
    }
}

async fn collect_artifact(
    events: &mut EventLoop,
    topic: &str,
    artifact_ref: &str,
    full_digest: &str,
    total_size: u64,
) -> Vec<u8> {
    tokio::time::timeout(Duration::from_secs(30), async {
        let mut chunks = BTreeMap::new();
        let mut expected_count = None;
        loop {
            let Event::Incoming(Incoming::Publish(publish)) =
                next_event(events, "artifact chunk").await
            else {
                continue;
            };
            if publish.topic != topic {
                continue;
            }
            let chunk =
                decode_artifact_chunk_frame(&publish.payload).expect("valid artifact frame");
            assert_eq!(chunk.header().artifact_ref(), artifact_ref);
            assert_eq!(chunk.header().full_digest(), full_digest);
            assert_eq!(chunk.header().total_size(), total_size);
            match expected_count {
                Some(count) => assert_eq!(count, chunk.header().count()),
                None => expected_count = Some(chunk.header().count()),
            }
            chunks.insert(chunk.header().index(), chunk.payload().to_vec());
            if chunks.len() == expected_count.expect("chunk count") as usize {
                break;
            }
        }
        let mut bytes = Vec::with_capacity(total_size as usize);
        for (_, payload) in chunks {
            bytes.extend_from_slice(&payload);
        }
        assert_eq!(bytes.len() as u64, total_size);
        assert_eq!(format!("sha256:{:x}", Sha256::digest(&bytes)), full_digest);
        bytes
    })
    .await
    .expect("artifact chunks were not completed")
}

fn verify_image(method: &str, bytes: &[u8]) {
    if method == "camera.capture" {
        let (width, height) = jpeg_dimensions(bytes).expect("camera JPEG dimensions");
        assert!(width > 0 && height > 0);
    } else {
        let decoder = png::Decoder::new(Cursor::new(bytes));
        let reader = decoder.read_info().expect("screen PNG");
        assert!(reader.info().width > 0 && reader.info().height > 0);
    }
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u16, u16)> {
    if bytes.get(..2) != Some(&[0xff, 0xd8]) {
        return None;
    }
    let mut offset = 2;
    while offset + 4 <= bytes.len() {
        if bytes[offset] != 0xff {
            offset += 1;
            continue;
        }
        let marker = bytes[offset + 1];
        offset += 2;
        if matches!(marker, 0xd8 | 0xd9) {
            continue;
        }
        let length = u16::from_be_bytes(bytes.get(offset..offset + 2)?.try_into().ok()?) as usize;
        if length < 2 || offset.checked_add(length)? > bytes.len() {
            return None;
        }
        if matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        ) {
            let height = u16::from_be_bytes(bytes.get(offset + 3..offset + 5)?.try_into().ok()?);
            let width = u16::from_be_bytes(bytes.get(offset + 5..offset + 7)?.try_into().ok()?);
            return Some((width, height));
        }
        offset += length;
    }
    None
}

async fn wait_for_artifact_cleanup(root: &Path, artifact_ref: &str, expected_state: &str) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        let capture_files = capture_file_paths(root, root);
        let cleanup_receipt = cleanup_receipt(root, artifact_ref);
        if capture_files.is_empty()
            && cleanup_receipt.as_ref().is_some_and(|receipt| {
                receipt["state"]["kind"] == expected_state
                    && receipt["cleanupStatus"]["kind"] == "completed"
            })
        {
            return;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "{expected_state} artifact cleanup incomplete: files={capture_files:?}, receipt={}",
            cleanup_receipt
                .as_ref()
                .map(bounded_json)
                .unwrap_or_else(|| "missing".to_string())
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn capture_file_paths(root: &Path, base: &Path) -> Vec<PathBuf> {
    fs::read_dir(root)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .flat_map(|entry| {
            entry.file_type().ok().map_or_else(Vec::new, |kind| {
                if root == base && entry.file_name() == ".artifact-state-v2" {
                    return Vec::new();
                }
                if kind.is_file() {
                    let path = entry.path();
                    vec![
                        path.strip_prefix(base)
                            .map(Path::to_path_buf)
                            .unwrap_or_else(|_| PathBuf::from(entry.file_name())),
                    ]
                } else if kind.is_dir() {
                    capture_file_paths(&entry.path(), base)
                } else {
                    Vec::new()
                }
            })
        })
        .take(16)
        .collect()
}

fn cleanup_receipt(root: &Path, artifact_ref: &str) -> Option<Value> {
    let lifecycle_path = find_named_file(&root.join(".artifact-state-v2"), "lifecycle.json")?;
    let envelope: Value = serde_json::from_slice(&fs::read(lifecycle_path).ok()?).ok()?;
    envelope["entries"]
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .filter_map(decode_hex)
        .filter_map(|entry| serde_json::from_slice::<Value>(&entry).ok())
        .find(|entry| entry["artifactRef"] == artifact_ref)
}

fn find_named_file(root: &Path, expected_name: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(root).ok()?.filter_map(Result::ok) {
        let kind = entry.file_type().ok()?;
        if kind.is_file() && entry.file_name() == expected_name {
            return Some(entry.path());
        }
        if kind.is_dir()
            && let Some(found) = find_named_file(&entry.path(), expected_name)
        {
            return Some(found);
        }
    }
    None
}

fn decode_hex(encoded: &str) -> Option<Vec<u8>> {
    if !encoded.len().is_multiple_of(2) {
        return None;
    }
    encoded
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char).to_digit(16)?;
            let low = (pair[1] as char).to_digit(16)?;
            Some(((high << 4) | low) as u8)
        })
        .collect()
}

async fn expect_outgoing_publish(events: &mut EventLoop, context: &str) {
    loop {
        if matches!(
            next_event(events, context).await,
            Event::Outgoing(Outgoing::Publish(_))
        ) {
            return;
        }
    }
}

async fn expect_disconnect(events: &mut EventLoop) {
    loop {
        if matches!(
            next_event(events, "requester disconnect").await,
            Event::Outgoing(Outgoing::Disconnect)
        ) {
            return;
        }
    }
}

async fn next_event(events: &mut EventLoop, context: &str) -> Event {
    match tokio::time::timeout(Duration::from_secs(30), events.poll()).await {
        Ok(Ok(event)) => event,
        Ok(Err(error)) => panic!("live MQTT event failed at {context}: {error:?}"),
        Err(_) => panic!("live MQTT event deadline: {context}"),
    }
}

fn target_fingerprint(instance_id: &str, host: &str, install: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(b"knowbee.yeonjang.target-fingerprint.v2\0");
    for field in [instance_id, host, install] {
        digest.update((field.len() as u64).to_be_bytes());
        digest.update(field.as_bytes());
    }
    format!("sha256:{:x}", digest.finalize())
}

fn key(issuer: &str, key_id: &str, secret: Vec<u8>) -> V2HmacKeySnapshot {
    V2HmacKeySnapshot::new(issuer, key_id, secret).expect("HMAC key")
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_millis()
        .try_into()
        .expect("clock range")
}

fn required_environment(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("missing live fixture: {name}"))
}

fn required_path(name: &str) -> PathBuf {
    PathBuf::from(required_environment(name))
}

fn optional_path_pair(binary_name: &str, manifest_name: &str) -> Option<(PathBuf, PathBuf)> {
    let binary = std::env::var_os(binary_name).filter(|value| !value.is_empty());
    let manifest = std::env::var_os(manifest_name).filter(|value| !value.is_empty());
    match (binary, manifest) {
        (None, None) => None,
        (Some(binary), Some(manifest)) => Some((PathBuf::from(binary), PathBuf::from(manifest))),
        _ => panic!("rollback package fixture requires both exact paths"),
    }
}

fn read_fixture(name: &str) -> Vec<u8> {
    fs::read(required_path(name)).unwrap_or_else(|_| panic!("unavailable live fixture: {name}"))
}

fn required_text<'a>(value: &'a Value, context: &str) -> &'a str {
    value
        .as_str()
        .unwrap_or_else(|| panic!("missing {context}"))
}

fn bounded_json(value: &Value) -> String {
    let encoded = value.to_string();
    encoded.chars().take(2_048).collect()
}

fn bounded_log(path: &Path) -> String {
    fs::read_to_string(path)
        .unwrap_or_default()
        .chars()
        .take(4_096)
        .collect()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProductStageTimingRow {
    log_class: String,
    event: String,
    evidence: StageTimingEvidence,
}

fn verify_stage_timing_baseline(fixture: &LiveFixture, path: &Path) {
    const MAX_BASELINE_LOG_BYTES: u64 = 2 * 1024 * 1024;
    let metadata = fs::metadata(path).expect("stage timing log metadata");
    assert!(
        metadata.len() <= MAX_BASELINE_LOG_BYTES,
        "stage timing log exceeded its release-gate bound"
    );
    let log = fs::read_to_string(path).expect("stage timing log");
    let rows: Vec<ProductStageTimingRow> = log
        .lines()
        .filter_map(|line| serde_json::from_str::<ProductStageTimingRow>(line).ok())
        .filter(|row| row.event == "yeonjang.stage_duration")
        .collect();

    assert!(!rows.is_empty(), "stage timing evidence was not emitted");
    for row in &rows {
        assert_eq!(row.log_class, "product");
        assert_eq!(row.evidence.correlation_id().len(), 71);
        assert!(
            row.evidence.correlation_id().starts_with("sha256:"),
            "stage timing correlation must remain path-free"
        );
        assert!(row.evidence.completed_at_ms() >= row.evidence.started_at_ms());
        assert!(!log.contains(BROKER_PASSWORD));
        assert!(!log.contains(&fixture.private_root_text));
        assert!(!log.contains(&fixture.yeonjang_key_path.display().to_string()));
    }

    for stage in RuntimeStage::ALL {
        let row = rows
            .iter()
            .find(|row| row.evidence.stage() == stage)
            .unwrap_or_else(|| panic!("missing stage timing evidence: {stage:?}"));
        eprintln!(
            "YEONJANG_STAGE_BASELINE target_os={} target_arch={} stage={:?} duration_us={}",
            fixture.profile.target_os,
            fixture.profile.target_arch,
            stage,
            row.evidence.duration_us()
        );
    }
}
