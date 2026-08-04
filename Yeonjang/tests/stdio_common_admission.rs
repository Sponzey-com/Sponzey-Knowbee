#[path = "support/system_info_test_backend.rs"]
mod system_info_test_backend;

use std::collections::BTreeSet;
use std::io::Cursor;
use std::sync::{Arc, Mutex};

use hmac::{Hmac, Mac};
use knowbee_yeonjang::authorization::{AuthorizationClock, AuthorizationReceipt};
use knowbee_yeonjang::authorization_bootstrap::AuthorizationBootstrapInput;
use knowbee_yeonjang::automation::AutomationBackend;
use knowbee_yeonjang::protocol::Response;
use knowbee_yeonjang::request_schema::MAX_CANONICAL_REQUEST_BYTES;
use knowbee_yeonjang::settings::YeonjangSettings;
use knowbee_yeonjang::stdio::{run_authenticated_stdio_with_backend, run_stdio_with_backend};
use sha2::Sha256;
use system_info_test_backend::SystemInfoTestBackend;

static STDIO_TEST_LOCK: Mutex<()> = Mutex::new(());

#[test]
fn stdio_common_admission_is_bounded_drains_eof_and_never_executes_unsigned_effects() {
    let _test_guard = STDIO_TEST_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let backend = Arc::new(SystemInfoTestBackend::default());
    let backend_port: Arc<dyn AutomationBackend> = backend.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let mut input = vec![b'x'; MAX_CANONICAL_REQUEST_BYTES + 64];
    input.push(b'\n');
    input.extend_from_slice(unsigned_camera_request().as_bytes());
    input.push(b'\n');
    for index in 0..20 {
        input.extend_from_slice(system_info_request(index).as_bytes());
        input.push(b'\n');
    }
    let mut output = Vec::new();

    run_stdio_with_backend(Cursor::new(input), &mut output, settings, backend_port)
        .expect("stdio pipeline");

    let responses = String::from_utf8(output)
        .expect("utf8 responses")
        .lines()
        .map(|line| serde_json::from_str::<Response>(line).expect("response"))
        .collect::<Vec<_>>();
    assert_eq!(responses.len(), 22);
    assert_eq!(
        responses[0].error.as_ref().map(|error| error.code.as_str()),
        Some("invalid_request")
    );
    let camera = responses
        .iter()
        .find(|response| response.id.as_deref() == Some("unsigned-camera"))
        .expect("camera response");
    assert_eq!(
        camera.error.as_ref().map(|error| error.code.as_str()),
        Some("side_effect_authorization_required")
    );
    assert_eq!(backend.camera_capture_calls(), 0);
    let terminal_ids = responses
        .iter()
        .filter_map(|response| response.id.clone())
        .filter(|id| id.starts_with("stdio-system-"))
        .collect::<BTreeSet<_>>();
    assert_eq!(terminal_ids.len(), 20);
    assert!(
        responses
            .iter()
            .filter(|response| {
                response
                    .id
                    .as_deref()
                    .is_some_and(|id| id.starts_with("stdio-system-"))
            })
            .all(|response| response.ok)
    );
}

struct FixedClock;

impl AuthorizationClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_700_000_000_000
    }
}

#[test]
fn authenticated_stdio_executes_one_exact_effect_and_rejects_its_replay() {
    let _test_guard = STDIO_TEST_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let secret = b"stdio-authenticated-secret";
    let backend = Arc::new(SystemInfoTestBackend::default());
    let backend_port: Arc<dyn AutomationBackend> = backend.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let signed = signed_camera_request("signed-camera-1", secret);
    let replayed = signed_camera_request("signed-camera-2", secret);
    let wrong_audience = signed_camera_request_for(
        "signed-camera-3",
        secret,
        "wrong-audience",
        "stdio-authorization-2",
    );
    let input = format!("{signed}\n{replayed}\n{wrong_audience}\n");
    let mut output = Vec::new();

    run_authenticated_stdio_with_backend(
        Cursor::new(input),
        &mut output,
        settings,
        backend_port,
        AuthorizationBootstrapInput::new(
            "stdio-test",
            "stdio-key",
            "stdio-audience",
            secret.to_vec(),
            8,
        )
        .expect("authorization input"),
        Arc::new(FixedClock),
    )
    .expect("authenticated stdio");

    let responses = String::from_utf8(output)
        .expect("utf8 responses")
        .lines()
        .map(|line| serde_json::from_str::<Response>(line).expect("response"))
        .collect::<Vec<_>>();
    assert_eq!(responses.len(), 3);
    assert!(responses.iter().any(|response| response.ok));
    let mut outcomes = responses
        .iter()
        .map(|response| {
            response
                .error
                .as_ref()
                .map(|error| error.code.clone())
                .unwrap_or_else(|| "ok".to_string())
        })
        .collect::<Vec<_>>();
    outcomes.sort();
    assert_eq!(
        outcomes,
        vec![
            "idempotency_in_progress".to_string(),
            "ok".to_string(),
            "side_effect_authorization_rejected".to_string(),
        ]
    );
    assert_eq!(backend.camera_capture_calls(), 1);
}

fn unsigned_camera_request() -> String {
    serde_json::json!({
        "protocolVersion": 1,
        "id": "unsigned-camera",
        "method": "camera.capture",
        "params": {},
        "metadata": {
            "commandId": "stdio-camera-command",
            "operationId": "stdio-camera-operation",
            "targetSessionId": "stdio-camera-session",
            "targetFingerprint": "stdio-camera-fingerprint",
            "idempotencyKey": "stdio-camera-idempotency",
            "expiresAt": 4_000_000_000_000_i64,
            "cancelToken": "stdio-camera-cancel"
        }
    })
    .to_string()
}

fn system_info_request(index: usize) -> String {
    serde_json::json!({
        "protocolVersion": 1,
        "id": format!("stdio-system-{index}"),
        "method": "system.info",
        "params": {},
        "metadata": {}
    })
    .to_string()
}

fn signed_camera_request(delivery_id: &str, secret: &[u8]) -> String {
    signed_camera_request_for(
        delivery_id,
        secret,
        "stdio-audience",
        "stdio-authorization-1",
    )
}

fn signed_camera_request_for(
    delivery_id: &str,
    secret: &[u8],
    audience: &str,
    authorization_id: &str,
) -> String {
    let target = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let mut receipt = AuthorizationReceipt {
        schema_version: 1,
        authorization_id: authorization_id.to_string(),
        issuer: "stdio-test".to_string(),
        issuer_key_id: "stdio-key".to_string(),
        audience: audience.to_string(),
        method: "camera.capture".to_string(),
        resource_scope: "camera".to_string(),
        command_id: "stdio-signed-command".to_string(),
        operation_id: "stdio-signed-operation".to_string(),
        target_session_id: "stdio-signed-session".to_string(),
        target_fingerprint: target.to_string(),
        idempotency_key: "stdio-signed-idempotency".to_string(),
        expires_at: 4_000_000_000_000,
        proof: String::new(),
    };
    let payload = [
        receipt.schema_version.to_string(),
        receipt.authorization_id.clone(),
        receipt.issuer.clone(),
        receipt.issuer_key_id.clone(),
        receipt.audience.clone(),
        receipt.method.clone(),
        receipt.resource_scope.clone(),
        receipt.command_id.clone(),
        receipt.operation_id.clone(),
        receipt.target_session_id.clone(),
        receipt.target_fingerprint.clone(),
        receipt.idempotency_key.clone(),
        receipt.expires_at.to_string(),
    ]
    .into_iter()
    .map(|value| format!("{}:{value}", value.len()))
    .collect::<String>();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC");
    mac.update(payload.as_bytes());
    receipt.proof = mac
        .finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();

    serde_json::json!({
        "protocolVersion": 1,
        "id": delivery_id,
        "method": "camera.capture",
        "params": {},
        "metadata": {
            "commandId": receipt.command_id,
            "operationId": receipt.operation_id,
            "targetSessionId": receipt.target_session_id,
            "targetFingerprint": receipt.target_fingerprint,
            "idempotencyKey": receipt.idempotency_key,
            "expiresAt": receipt.expires_at,
            "cancelToken": "stdio-signed-cancel",
            "authorizationReceipt": {
                "schemaVersion": receipt.schema_version,
                "authorizationId": receipt.authorization_id,
                "issuer": receipt.issuer,
                "issuerKeyId": receipt.issuer_key_id,
                "audience": receipt.audience,
                "method": receipt.method,
                "resourceScope": receipt.resource_scope,
                "commandId": receipt.command_id,
                "operationId": receipt.operation_id,
                "targetSessionId": receipt.target_session_id,
                "targetFingerprint": receipt.target_fingerprint,
                "idempotencyKey": receipt.idempotency_key,
                "expiresAt": receipt.expires_at,
                "proof": receipt.proof
            }
        }
    })
    .to_string()
}
