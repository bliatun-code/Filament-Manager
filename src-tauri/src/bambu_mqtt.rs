use serde_json::Value;
use std::io::{ErrorKind, Read};

pub(crate) fn build_connect_packet(client_id: &str, username: &str, password: &str) -> Vec<u8> {
    let mut variable_header = Vec::new();
    push_mqtt_string(&mut variable_header, "MQTT");
    variable_header.push(4);
    variable_header.push(0x02 | 0x80 | 0x40);
    variable_header.extend_from_slice(&30_u16.to_be_bytes());

    let mut payload = Vec::new();
    push_mqtt_string(&mut payload, client_id);
    push_mqtt_string(&mut payload, username);
    push_mqtt_string(&mut payload, password);

    let mut packet = vec![0x10];
    packet.extend(encode_varint(variable_header.len() + payload.len()));
    packet.extend(variable_header);
    packet.extend(payload);
    packet
}

pub(crate) fn build_subscribe_packet(topic: &str) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&1_u16.to_be_bytes());
    push_mqtt_string(&mut payload, topic);
    payload.push(0);

    let mut packet = vec![0x82];
    packet.extend(encode_varint(payload.len()));
    packet.extend(payload);
    packet
}

fn push_mqtt_string(buffer: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    buffer.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
    buffer.extend_from_slice(bytes);
}

fn encode_varint(mut value: usize) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value % 128) as u8;
        value /= 128;
        if value > 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
    out
}

pub(crate) fn read_mqtt_packet(stream: &mut impl Read) -> Result<(u8, Vec<u8>), String> {
    let mut fixed_header = [0_u8; 1];
    stream.read_exact(&mut fixed_header).map_err(|error| {
        if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) {
            format!("failed to read MQTT fixed header: timed out waiting for MQTT data ({error})")
        } else {
            format!("failed to read MQTT fixed header: {error}")
        }
    })?;

    let mut multiplier = 1_usize;
    let mut remaining_length = 0_usize;
    for byte_index in 0..4 {
        let mut encoded = [0_u8; 1];
        stream
            .read_exact(&mut encoded)
            .map_err(|error| format!("failed to read MQTT remaining length: {error}"))?;
        remaining_length += ((encoded[0] & 0x7F) as usize) * multiplier;
        if encoded[0] & 0x80 == 0 {
            let mut payload = vec![0_u8; remaining_length];
            stream
                .read_exact(&mut payload)
                .map_err(|error| format!("failed to read MQTT payload: {error}"))?;
            return Ok((fixed_header[0], payload));
        }
        if byte_index == 3 {
            return Err("invalid MQTT remaining length: exceeds 4 bytes".to_string());
        }
        multiplier *= 128;
    }

    Err("invalid MQTT remaining length".to_string())
}

pub(crate) fn parse_publish_payload(payload: &[u8]) -> Result<Option<Value>, String> {
    if payload.len() < 2 {
        return Ok(None);
    }
    let topic_length = u16::from_be_bytes([payload[0], payload[1]]) as usize;
    if payload.len() < topic_length + 2 {
        return Ok(None);
    }
    let message_bytes = &payload[(2 + topic_length)..];
    serde_json::from_slice::<Value>(message_bytes)
        .map(Some)
        .map_err(|error| format!("failed to parse live MQTT JSON payload: {error}"))
}
