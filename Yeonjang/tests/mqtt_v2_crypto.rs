use knowbee_yeonjang::mqtt_v2_crypto::{MqttV2HmacBuildError, MqttV2HmacCrypto, V2HmacKeySnapshot};
use knowbee_yeonjang::protocol_v2::V2CommandSignatureVerifier;
use knowbee_yeonjang::protocol_v2_artifact::V2ArtifactSignatureVerifier;
use knowbee_yeonjang::protocol_v2_control::V2ControlSignatureVerifier;
use knowbee_yeonjang::protocol_v2_policy_admin::V2PolicyAdminSignatureVerifier;
use knowbee_yeonjang::protocol_v2_receipt_query::V2ReceiptQuerySignatureVerifier;
use knowbee_yeonjang::protocol_v2_response_ack::V2ResponseAckSignatureVerifier;
use knowbee_yeonjang::protocol_v2_terminal::V2ResponseSigner;

#[test]
fn one_reference_hmac_fixture_serves_every_strict_v2_signature_trait() {
    let crypto = MqttV2HmacCrypto::new(
        key("issuer-a", "key-a", vec![0x0b; 20]),
        key("issuer-a", "key-a", vec![0x0b; 20]),
    )
    .expect("crypto");
    let signature =
        V2ResponseSigner::sign(&crypto, "issuer-a", "key-a", b"Hi There").expect("signature");
    assert_eq!(
        signature,
        "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
    );

    assert!(V2CommandSignatureVerifier::verify(
        &crypto,
        "issuer-a",
        "key-a",
        b"Hi There",
        &signature
    ));
    assert!(V2ControlSignatureVerifier::verify(
        &crypto,
        "issuer-a",
        "key-a",
        b"Hi There",
        &signature
    ));
    assert!(V2ReceiptQuerySignatureVerifier::verify(
        &crypto,
        "issuer-a",
        "key-a",
        b"Hi There",
        &signature
    ));
    assert!(V2ResponseAckSignatureVerifier::verify(
        &crypto,
        "issuer-a",
        "key-a",
        b"Hi There",
        &signature
    ));
    assert!(V2ArtifactSignatureVerifier::verify(
        &crypto,
        "issuer-a",
        "key-a",
        b"Hi There",
        &signature
    ));
    assert!(V2PolicyAdminSignatureVerifier::verify(
        &crypto,
        "issuer-a",
        "key-a",
        b"Hi There",
        &signature
    ));
}

#[test]
fn exact_identity_tamper_and_noncanonical_proof_are_rejected_without_secret_debug() {
    let crypto = MqttV2HmacCrypto::new(
        key("issuer-a", "key-a", b"0123456789abcdef".to_vec()),
        key("instance-a", "response-a", b"fedcba9876543210".to_vec()),
    )
    .expect("crypto");
    let signature = V2ResponseSigner::sign(&crypto, "instance-a", "response-a", b"response bytes")
        .expect("signature");

    assert!(!V2CommandSignatureVerifier::verify(
        &crypto,
        "issuer-a",
        "key-a",
        b"tampered",
        &signature
    ));
    assert!(!V2CommandSignatureVerifier::verify(
        &crypto,
        "wrong-issuer",
        "key-a",
        b"response bytes",
        &signature
    ));
    assert!(!V2CommandSignatureVerifier::verify(
        &crypto,
        "issuer-a",
        "key-a",
        b"response bytes",
        &signature.to_uppercase()
    ));
    let debug = format!("{crypto:?}");
    assert!(!debug.contains("0123456789abcdef"));
    assert!(!debug.contains("fedcba9876543210"));
    assert!(!debug.contains(&signature));
}

#[test]
fn rollback_verification_is_explicit_and_signing_uses_only_selected_outbound_key() {
    let old = MqttV2HmacCrypto::new(
        key("issuer-a", "old-key", b"old-secret-123456".to_vec()),
        key("issuer-a", "old-key", b"old-secret-123456".to_vec()),
    )
    .expect("old crypto");
    let old_signature =
        V2ResponseSigner::sign(&old, "issuer-a", "old-key", b"command").expect("old signature");
    let current = MqttV2HmacCrypto::new_with_rollback(
        key("issuer-a", "new-key", b"new-secret-123456".to_vec()),
        vec![key("issuer-a", "old-key", b"old-secret-123456".to_vec())],
        key("instance-a", "response-new", b"response-new-1234".to_vec()),
    )
    .expect("current crypto");

    assert!(V2CommandSignatureVerifier::verify(
        &current,
        "issuer-a",
        "old-key",
        b"command",
        &old_signature
    ));
    assert!(V2ResponseSigner::sign(&current, "issuer-a", "old-key", b"response").is_err());
    assert!(V2ResponseSigner::sign(&current, "instance-a", "response-new", b"response").is_ok());
}

#[test]
fn invalid_key_material_and_unbounded_rollback_set_fail_before_runtime_start() {
    assert_eq!(
        V2HmacKeySnapshot::new("issuer-a", "key-a", b"short".to_vec()).expect_err("short key"),
        MqttV2HmacBuildError::InvalidSecret
    );
    assert!(matches!(
        MqttV2HmacCrypto::new_with_rollback(
            key("issuer-a", "key-a", b"0123456789abcdef".to_vec()),
            vec![
                key("issuer-a", "rollback-a", b"0123456789abcdef".to_vec()),
                key("issuer-a", "rollback-b", b"0123456789abcdef".to_vec()),
                key("issuer-a", "rollback-c", b"0123456789abcdef".to_vec()),
            ],
            key("instance-a", "response-a", b"fedcba9876543210".to_vec()),
        ),
        Err(MqttV2HmacBuildError::TooManyRollbackKeys)
    ));
}

fn key(issuer: &str, key_id: &str, secret: Vec<u8>) -> V2HmacKeySnapshot {
    V2HmacKeySnapshot::new(issuer, key_id, secret).expect("key snapshot")
}
