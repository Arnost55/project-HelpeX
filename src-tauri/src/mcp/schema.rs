use serde_json::Value;

pub fn validate_tool_arguments(schema: &Value, arguments: &Value) -> Result<(), Vec<String>> {
    let mut issues = Vec::new();
    validate_value(schema, arguments, "$", &mut issues);
    if issues.is_empty() {
        Ok(())
    } else {
        Err(issues)
    }
}

fn validate_value(schema: &Value, value: &Value, path: &str, issues: &mut Vec<String>) {
    if let Some(expected_type) = schema.get("type").and_then(Value::as_str) {
        if !matches_type(expected_type, value) {
            issues.push(format!(
                "{} expected type '{}' but received {}",
                path,
                expected_type,
                type_name(value)
            ));
            return;
        }
    }

    if let Some(enum_values) = schema.get("enum").and_then(Value::as_array) {
        if !enum_values.iter().any(|candidate| candidate == value) {
            issues.push(format!("{} must be one of the enum values", path));
            return;
        }
    }

    match value {
        Value::Object(map) => validate_object(schema, map, path, issues),
        Value::Array(items) => validate_array(schema, items, path, issues),
        _ => {}
    }
}

fn validate_object(
    schema: &Value,
    value: &serde_json::Map<String, Value>,
    path: &str,
    issues: &mut Vec<String>,
) {
    if let Some(required) = schema.get("required").and_then(Value::as_array) {
        for required_key in required.iter().filter_map(Value::as_str) {
            if !value.contains_key(required_key) {
                issues.push(format!(
                    "{} is missing required property '{}'",
                    path, required_key
                ));
            }
        }
    }

    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    for (key, property_value) in value {
        if let Some(property_schema) = properties.get(key) {
            validate_value(
                property_schema,
                property_value,
                &format!("{}.{}", path, key),
                issues,
            );
            continue;
        }

        if matches!(schema.get("additionalProperties"), Some(Value::Bool(false))) {
            issues.push(format!("{} contains unexpected property '{}'", path, key));
        }
    }
}

fn validate_array(schema: &Value, value: &[Value], path: &str, issues: &mut Vec<String>) {
    if let Some(min_items) = schema.get("minItems").and_then(Value::as_u64) {
        if value.len() < min_items as usize {
            issues.push(format!("{} requires at least {} items", path, min_items));
        }
    }
    if let Some(max_items) = schema.get("maxItems").and_then(Value::as_u64) {
        if value.len() > max_items as usize {
            issues.push(format!("{} allows at most {} items", path, max_items));
        }
    }

    if let Some(items_schema) = schema.get("items") {
        for (index, item) in value.iter().enumerate() {
            validate_value(items_schema, item, &format!("{}[{}]", path, index), issues);
        }
    }
}

fn matches_type(expected_type: &str, value: &Value) -> bool {
    match expected_type {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "number" => value.is_number(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        _ => true,
    }
}

fn type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(number) if number.is_i64() || number.is_u64() => "integer",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_required_and_nested_types() {
        let schema = json!({
            "type": "object",
            "required": ["city", "days"],
            "properties": {
                "city": { "type": "string" },
                "days": { "type": "integer" },
                "filters": {
                    "type": "array",
                    "items": { "type": "string" }
                }
            },
            "additionalProperties": false
        });

        assert!(validate_tool_arguments(
            &schema,
            &json!({
                "city": "Bratislava",
                "days": 2,
                "filters": ["today"]
            })
        )
        .is_ok());

        let error = validate_tool_arguments(
            &schema,
            &json!({
                "city": 5,
                "filters": [true],
                "extra": "nope"
            }),
        )
        .unwrap_err();
        assert!(error
            .iter()
            .any(|issue| issue.contains("missing required property 'days'")));
        assert!(error
            .iter()
            .any(|issue| issue.contains("$.city expected type 'string'")));
        assert!(error
            .iter()
            .any(|issue| issue.contains("$.filters[0] expected type 'string'")));
        assert!(error
            .iter()
            .any(|issue| issue.contains("unexpected property 'extra'")));
    }
}
