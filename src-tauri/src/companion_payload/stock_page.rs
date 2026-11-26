use super::accepts_gzip;
use crate::companion_assets::gzip_bytes;
use crate::companion_error::CompanionApiError;
use axum::http::{header, HeaderMap};
use axum::response::{IntoResponse, Response};
use flate2::read::MultiGzDecoder;
use serde::{de::DeserializeOwned, Serialize};
use std::io::Read;

pub(crate) const STOCK_PAGE_PATH: &str = "/api/v1/library/stock-cards";
// Serve larger pages as ordinary JSON so both peers agree on the maximum
// decoded size without changing which stock records can be read.
const MAX_COMPRESSIBLE_BYTES: usize = 8 * 1024 * 1024;

pub(crate) fn stock_page_response(
    headers: &HeaderMap,
    page: &impl Serialize,
) -> Result<Response, CompanionApiError> {
    let json =
        serde_json::to_vec(page).map_err(|error| CompanionApiError::Internal(error.to_string()))?;
    let common = [
        (header::CONTENT_TYPE, "application/json"),
        (header::VARY, "Accept-Encoding"),
    ];
    if (1024..=MAX_COMPRESSIBLE_BYTES).contains(&json.len())
        && accepts_gzip(headers)
        && let Some(encoded) = gzip_bytes(&json).filter(|bytes| bytes.len() < json.len())
    {
        return Ok((common, [(header::CONTENT_ENCODING, "gzip")], encoded).into_response());
    }
    Ok((common, json).into_response())
}

pub(crate) fn decode_gzip_page<T: DeserializeOwned>(reader: impl Read) -> Result<T, String> {
    let mut bytes = Vec::new();
    MultiGzDecoder::new(reader)
        .take(MAX_COMPRESSIBLE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not decompress stock page: {error}"))?;
    if bytes.len() > MAX_COMPRESSIBLE_BYTES {
        return Err("Compressed stock page exceeds the decoded size limit.".into());
    }
    serde_json::from_slice(&bytes).map_err(|error| format!("Invalid stock page JSON: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    #[tokio::test]
    async fn page_encoding_preserves_json_for_both_client_generations() {
        for (size, accept, compressed) in [
            (4096, None, false),
            (4096, Some("gzip;q=0"), false),
            (20, Some("gzip"), false),
            (4096, Some("gzip"), true),
        ] {
            let page = vec!["filament"; size];
            let mut headers = HeaderMap::new();
            if let Some(value) = accept {
                headers.insert(header::ACCEPT_ENCODING, value.parse().unwrap());
            }
            let response = stock_page_response(&headers, &page).unwrap();
            assert_eq!(response.headers()[header::VARY], "Accept-Encoding");
            assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
            assert_eq!(
                response.headers().contains_key(header::CONTENT_ENCODING),
                compressed
            );
            let bytes = to_bytes(response.into_body(), MAX_COMPRESSIBLE_BYTES)
                .await
                .unwrap();
            if compressed {
                assert!(bytes.len() < serde_json::to_vec(&page).unwrap().len());
                assert_eq!(decode_gzip_page::<Vec<String>>(&bytes[..]).unwrap(), page);
                assert!(decode_gzip_page::<Vec<String>>(&bytes[..bytes.len() - 1]).is_err());
            } else {
                assert_eq!(bytes.as_ref(), serde_json::to_vec(&page).unwrap());
            }
        }
    }

    #[test]
    fn oversized_page_uses_plain_json_and_an_oversized_gzip_is_rejected() {
        let mut headers = HeaderMap::new();
        headers.insert(header::ACCEPT_ENCODING, "gzip".parse().unwrap());
        let value = "x".repeat(MAX_COMPRESSIBLE_BYTES);
        let response = stock_page_response(&headers, &value).unwrap();
        assert!(!response.headers().contains_key(header::CONTENT_ENCODING));
        let encoded = gzip_bytes(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(decode_gzip_page::<String>(&encoded[..])
            .unwrap_err()
            .contains("size limit"));
    }
}
