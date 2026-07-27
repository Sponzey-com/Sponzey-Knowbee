use anyhow::Result;
use serde_json::Value;

use crate::automation::AutomationBackend;
use crate::platform::current_backend;

pub fn focused_target() -> Result<Value> {
    Ok(serde_json::to_value(current_backend().focused_target()?)?)
}
