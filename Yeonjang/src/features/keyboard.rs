use anyhow::{Result, anyhow};
use serde::Deserialize;
use serde_json::Value;

use crate::automation::{AutomationBackend, KeyboardActionRequest, KeyboardTypeRequest};

#[derive(Debug, Deserialize)]
pub struct TypeParams {
    pub text: String,
}

pub fn type_text(params: TypeParams, backend: &dyn AutomationBackend) -> Result<Value> {
    if params.text.is_empty() {
        return Err(anyhow!("keyboard input text must not be empty"));
    }

    let request = KeyboardTypeRequest { text: params.text };
    Ok(serde_json::to_value(backend.type_text(request)?)?)
}

pub fn action(params: KeyboardActionRequest, backend: &dyn AutomationBackend) -> Result<Value> {
    Ok(serde_json::to_value(
        backend.perform_keyboard_action(params)?,
    )?)
}
