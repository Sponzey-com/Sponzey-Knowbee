// Each integration-test crate consumes a different projection of this shared
// fixture. The complete API is exercised only by the transport suite together.
#![allow(dead_code)]

use knowbee_yeonjang::protocol::{Request, Response};
use knowbee_yeonjang::request_schema::parse_canonical_request;
use serde_json::{Value, json};

pub struct ReadOnlyProtocolFixture {
    pub request_id: String,
    pub value: Value,
    pub payload: Vec<u8>,
}

impl ReadOnlyProtocolFixture {
    pub fn system_info(request_id: impl Into<String>) -> Self {
        let request_id = request_id.into();
        let value = json!({
            "protocolVersion": 1,
            "id": request_id,
            "method": "system.info",
            "params": {},
            "metadata": {}
        });
        let payload = serde_json::to_vec(&value).expect("canonical read-only fixture");
        Self {
            request_id,
            value,
            payload,
        }
    }

    pub fn request(&self) -> Request {
        parse_canonical_request(&self.payload)
            .expect("canonical fixture request")
            .into_request()
    }

    pub fn assert_success(&self, response: &Response) {
        assert!(response.ok);
        assert_eq!(response.id.as_deref(), Some(self.request_id.as_str()));
    }
}
