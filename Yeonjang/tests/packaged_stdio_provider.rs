//! Packaged executable boundary tests for strict stdio and managed bootstrap.
//!
//! These tests spawn the built binary and assert fail-closed argument, secret,
//! and protocol behavior without opening a production broker or device.

#[path = "support/protocol_fixture.rs"]
mod protocol_fixture;

use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use knowbee_yeonjang::protocol::Response;
use protocol_fixture::ReadOnlyProtocolFixture;

#[test]
fn packaged_stdio_requires_the_strict_versioned_envelope() {
    let responses = run_stdio(&[
        r#"{"id":"legacy-stdio","method":"system.info","params":{}}"#,
        r#"{"protocolVersion":1,"id":"unknown-field-stdio","method":"system.info","params":{},"metadata":{},"unexpected":true}"#,
        r#"{"protocolVersion":1,"id":"private-secret-value""#,
        r#"{"protocolVersion":1,"id":"canonical-stdio","method":"system.info","params":{},"metadata":{}}"#,
    ]);

    assert_eq!(responses.len(), 4);
    assert_eq!(
        responses[0].error.as_ref().map(|error| error.code.as_str()),
        Some("invalid_request")
    );
    assert_eq!(
        responses[1].error.as_ref().map(|error| error.code.as_str()),
        Some("invalid_request")
    );
    assert_eq!(
        responses[2]
            .error
            .as_ref()
            .map(|error| (error.code.as_str(), error.message.as_str())),
        Some(("invalid_request", "Invalid canonical request."))
    );
    assert!(responses[3].ok);
    assert_eq!(responses[3].id.as_deref(), Some("canonical-stdio"));
}

#[test]
fn packaged_authenticated_stdio_requires_explicit_bootstrap_and_runs_read_only() {
    let missing = Command::new(env!("CARGO_BIN_EXE_knowbee-yeonjang"))
        .arg("--stdio-authenticated")
        .env_remove("YEONJANG_STDIO_AUTH_ISSUER")
        .env_remove("YEONJANG_STDIO_AUTH_KEY_ID")
        .env_remove("YEONJANG_STDIO_AUTH_AUDIENCE")
        .env_remove("YEONJANG_STDIO_AUTH_SECRET")
        .output()
        .expect("missing bootstrap process");
    assert!(!missing.status.success());
    assert!(!String::from_utf8_lossy(&missing.stderr).contains("stdio-authenticated-secret"));

    let fixture = ReadOnlyProtocolFixture::system_info("authenticated-read");
    let payload = String::from_utf8(fixture.payload.clone()).expect("UTF-8 fixture");
    let responses = run_authenticated_stdio(&[payload.as_str()]);
    assert_eq!(responses.len(), 1);
    fixture.assert_success(&responses[0]);
}

#[test]
fn packaged_managed_tls_requires_all_bootstrap_material_before_runtime_start() {
    let output = Command::new(env!("CARGO_BIN_EXE_knowbee-yeonjang"))
        .arg("--managed-tls")
        .env_remove("YEONJANG_MQTT_CA_CERT_PATH")
        .env_remove("YEONJANG_MQTT_CLIENT_CERT_PATH")
        .env_remove("YEONJANG_MQTT_CLIENT_KEY_PATH")
        .output()
        .expect("missing TLS bootstrap process");
    assert!(!output.status.success());
    let stderr = String::from_utf8(output.stderr).expect("bounded TLS bootstrap diagnostic");
    assert!(stderr.contains("missing required bootstrap value"));
    assert!(!stderr.contains("PRIVATE KEY"));
}

#[test]
fn packaged_managed_explicit_root_and_stdin_secret_fail_closed() {
    let relative = Command::new(env!("CARGO_BIN_EXE_knowbee-yeonjang"))
        .args([
            "--managed",
            "--config-root",
            "relative-config-root",
            "--broker-secret-stdin",
        ])
        .output()
        .expect("relative config root process");
    assert!(!relative.status.success());
    assert!(
        String::from_utf8_lossy(&relative.stderr).contains("managed config root must be absolute")
    );

    let root = unique_test_root("managed-bootstrap");
    fs::create_dir_all(&root).expect("explicit config root");
    let empty = managed_with_secret(&root, &[]);
    assert!(!empty.status.success());
    assert!(
        String::from_utf8_lossy(&empty.stderr).contains("managed broker secret lease is invalid")
    );

    let marker = "managed-secret-marker-";
    let oversized = marker.repeat(300);
    let rejected = managed_with_secret(&root, oversized.as_bytes());
    let stderr = String::from_utf8(rejected.stderr).expect("bounded secret rejection");
    assert!(!rejected.status.success());
    assert!(stderr.contains("managed broker secret lease is invalid"));
    assert!(!stderr.contains(marker));

    fs::remove_dir_all(root).expect("managed bootstrap fixture cleanup");
}

#[test]
fn packaged_legacy_exec_flags_fail_closed_without_executing_commands() {
    for args in [
        vec!["--exec", "printf legacy-shell-marker"],
        vec!["--exec-bin", "/bin/echo", "legacy-binary-marker"],
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_knowbee-yeonjang"))
            .args(args)
            .output()
            .expect("legacy exec process");
        assert!(!output.status.success());

        let stdout = String::from_utf8(output.stdout).expect("bounded legacy response");
        let stderr = String::from_utf8(output.stderr).expect("bounded legacy diagnostic");
        let response: Response =
            serde_json::from_str(stdout.trim()).expect("typed legacy rejection");
        assert_eq!(
            response
                .error
                .as_ref()
                .map(|error| (error.code.as_str(), error.message.as_str())),
            Some((
                "local_exec_requires_authenticated_stdio",
                "Local execution requires canonical authenticated stdio."
            ))
        );
        assert!(!stdout.contains("legacy-shell-marker"));
        assert!(!stdout.contains("legacy-binary-marker"));
        assert!(!stderr.contains("legacy-shell-marker"));
        assert!(!stderr.contains("legacy-binary-marker"));
    }
}

fn run_stdio(lines: &[&str]) -> Vec<Response> {
    run_stdio_command("--stdio", lines, false)
}

fn run_authenticated_stdio(lines: &[&str]) -> Vec<Response> {
    run_stdio_command("--stdio-authenticated", lines, true)
}

fn managed_with_secret(root: &PathBuf, secret: &[u8]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_knowbee-yeonjang"))
        .args(["--managed", "--config-root"])
        .arg(root)
        .arg("--broker-secret-stdin")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("managed bootstrap process");
    child
        .stdin
        .as_mut()
        .expect("managed bootstrap stdin")
        .write_all(secret)
        .expect("managed bootstrap secret");
    child.wait_with_output().expect("managed bootstrap output")
}

fn unique_test_root(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "knowbee-{label}-{}-{}",
        std::process::id(),
        std::thread::current().name().unwrap_or("unnamed")
    ))
}

fn run_stdio_command(flag: &str, lines: &[&str], authenticated: bool) -> Vec<Response> {
    let mut command = Command::new(env!("CARGO_BIN_EXE_knowbee-yeonjang"));
    command.arg(flag);
    if authenticated {
        command
            .env("YEONJANG_STDIO_AUTH_ISSUER", "stdio-test")
            .env("YEONJANG_STDIO_AUTH_KEY_ID", "stdio-key")
            .env("YEONJANG_STDIO_AUTH_AUDIENCE", "stdio-audience")
            .env("YEONJANG_STDIO_AUTH_SECRET", "stdio-authenticated-secret");
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("packaged stdio process");
    {
        let mut stdin = child.stdin.take().expect("stdio stdin");
        for line in lines {
            stdin.write_all(line.as_bytes()).expect("request line");
            stdin.write_all(b"\n").expect("request separator");
        }
    }

    let deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        if let Some(status) = child.try_wait().expect("stdio process status") {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill().expect("kill timed out stdio process");
            panic!("packaged stdio process did not stop after EOF");
        }
        std::thread::sleep(Duration::from_millis(5));
    };
    assert!(status.success(), "packaged stdio process failed");

    let mut stdout = String::new();
    child
        .stdout
        .take()
        .expect("stdio stdout")
        .read_to_string(&mut stdout)
        .expect("stdio output");
    let mut stderr = String::new();
    child
        .stderr
        .take()
        .expect("stdio stderr")
        .read_to_string(&mut stderr)
        .expect("stdio diagnostic output");
    assert!(!stdout.contains("stdio-authenticated-secret"));
    assert!(!stderr.contains("stdio-authenticated-secret"));
    stdout
        .lines()
        .map(|line| serde_json::from_str(line).expect("bounded response JSON"))
        .collect()
}
