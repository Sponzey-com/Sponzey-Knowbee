use anyhow::Result;
use serde_json::Value;

use crate::automation::AutomationBackend;

pub fn focused_target(backend: &dyn AutomationBackend) -> Result<Value> {
    Ok(serde_json::to_value(backend.focused_target()?)?)
}
