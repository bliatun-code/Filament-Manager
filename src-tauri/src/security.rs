use sha2::{Digest, Sha256};

pub fn hash_secret(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let digest = hasher.finalize();
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

#[cfg(test)]
mod tests {
    use super::hash_secret;

    #[test]
    fn hash_secret_returns_sha256_hex() {
        assert_eq!(
            hash_secret("filament-manager"),
            "c1bb129e618423657ba2095b7e03b2db16f6640dc9e0dc6799842a121f08a8cd"
        );
    }
}
