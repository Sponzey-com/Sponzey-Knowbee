use knowbee_yeonjang::protocol::Request;
use knowbee_yeonjang::request_schema::{
    CANONICAL_PROTOCOL_VERSION, MAX_CANONICAL_PARAMS_BYTES, RequestSchemaError,
    parse_canonical_request,
};
use serde_json::json;

#[test]
fn canonical_request_requires_the_supported_top_level_version() {
    let valid = json!({
        "protocolVersion": CANONICAL_PROTOCOL_VERSION,
        "id": "request-1",
        "method": "node.ping",
        "params": {},
        "metadata": {}
    });
    let parsed = parse_canonical_request(valid.to_string().as_bytes()).expect("canonical request");
    assert_eq!(parsed.protocol_version(), CANONICAL_PROTOCOL_VERSION);
    assert_eq!(parsed.request().method, "node.ping");

    let mut unsupported = valid.clone();
    unsupported["protocolVersion"] = json!(CANONICAL_PROTOCOL_VERSION + 1);
    assert_eq!(
        parse_canonical_request(unsupported.to_string().as_bytes()).expect_err("unknown version"),
        RequestSchemaError::UnsupportedVersion
    );
}

#[test]
fn canonical_parser_rejects_unknown_top_level_fields_without_breaking_legacy_parser() {
    let payload = json!({
        "protocolVersion": CANONICAL_PROTOCOL_VERSION,
        "id": "request-1",
        "method": "node.ping",
        "params": {},
        "metadata": {},
        "unexpected": "must-not-be-ignored"
    });
    assert_eq!(
        parse_canonical_request(payload.to_string().as_bytes()).expect_err("unknown field"),
        RequestSchemaError::Malformed
    );

    let legacy = json!({
        "id": "legacy-request",
        "method": "node.ping",
        "unexpected": "legacy parser remains additive"
    });
    assert!(serde_json::from_value::<Request>(legacy).is_ok());
}

#[test]
fn canonical_parser_rejects_oversized_params_before_dispatch() {
    let payload = json!({
        "protocolVersion": CANONICAL_PROTOCOL_VERSION,
        "id": "request-large",
        "method": "node.ping",
        "params": { "value": "x".repeat(MAX_CANONICAL_PARAMS_BYTES + 1) },
        "metadata": {}
    });
    assert_eq!(
        parse_canonical_request(payload.to_string().as_bytes()).expect_err("oversized params"),
        RequestSchemaError::ParamsTooLarge
    );
}
