use rusqlite::types::ValueRef;
use serde_json::Value;

pub(crate) fn sqlite_value_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(number) => Value::from(number),
        ValueRef::Real(number) => {
            serde_json::Number::from_f64(number).map_or(Value::Null, Value::Number)
        }
        ValueRef::Text(text) => Value::String(String::from_utf8_lossy(text).to_string()),
        ValueRef::Blob(blob) => Value::String(bytes_to_hex(blob)),
    }
}

pub(crate) fn json_value_to_sql(value: &Value) -> rusqlite::types::Value {
    match value {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(boolean) => rusqlite::types::Value::Integer(if *boolean { 1 } else { 0 }),
        Value::Number(number) => {
            if let Some(integer) = number.as_i64() {
                rusqlite::types::Value::Integer(integer)
            } else if let Some(float) = number.as_f64() {
                rusqlite::types::Value::Real(float)
            } else {
                rusqlite::types::Value::Null
            }
        }
        Value::String(text) => rusqlite::types::Value::Text(text.clone()),
        Value::Array(_) | Value::Object(_) => rusqlite::types::Value::Text(value.to_string()),
    }
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push_str(&format!("{:02x}", byte));
    }
    output
}
