use url::Url;

/// Sanitizes untrusted remote or user-entered filenames to avoid path traversal,
/// illegal filesystem characters, control characters, and reserved names.
pub fn sanitize_filename(raw: &str) -> String {
    let clean = raw.trim();
    if clean.is_empty() {
        return "download".to_string();
    }

    // Extract basename in case a path was provided
    let basename = clean.rsplit(['/', '\\']).next().unwrap_or(clean).trim();

    let mut filtered = String::with_capacity(basename.len());
    for c in basename.chars() {
        if c.is_control() || c == '\0' {
            continue;
        }
        match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => {
                filtered.push('_');
            }
            _ => {
                filtered.push(c);
            }
        }
    }

    // Strip leading/trailing dots and spaces
    let trimmed = filtered.trim_matches(['.', ' ']).to_string();

    // Check for empty or reserved filenames
    if trimmed.is_empty() || trimmed == ".." {
        return "download".to_string();
    }

    let upper = trimmed.to_ascii_uppercase();
    let is_reserved = matches!(
        upper.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    );

    if is_reserved {
        format!("{trimmed}_download")
    } else {
        trimmed
    }
}

/// Masks sensitive query parameters and user credentials in URLs for safe logging and UI display.
pub fn mask_url(raw: &str) -> String {
    let Ok(mut parsed) = Url::parse(raw) else {
        return raw.to_string();
    };

    if parsed.password().is_some() {
        let _ = parsed.set_password(Some("*****"));
    }

    let sensitive_keys = [
        "token",
        "access_token",
        "secret",
        "sig",
        "signature",
        "key",
        "api_key",
        "apikey",
        "auth",
        "password",
        "pwd",
        "credential",
        "session",
        "session_id",
        "x-amz-signature",
        "x-amz-security-token",
        "x-amz-credential",
    ];

    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(k, v)| {
            let k_lower = k.to_ascii_lowercase();
            if sensitive_keys.iter().any(|&s| s == k_lower) {
                (k.into_owned(), "*****".to_string())
            } else {
                (k.into_owned(), v.into_owned())
            }
        })
        .collect();

    if !pairs.is_empty() {
        parsed.query_pairs_mut().clear().extend_pairs(pairs.iter());
    }

    parsed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename_traversal() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_filename("..\\..\\windows\\system32"), "system32");
        assert_eq!(sanitize_filename("../../../"), "download");
        assert_eq!(sanitize_filename("..."), "download");
    }

    #[test]
    fn test_sanitize_filename_illegal_chars() {
        assert_eq!(sanitize_filename("foo:bar*baz?.txt"), "foo_bar_baz_.txt");
        assert_eq!(sanitize_filename("<test>|file\".iso"), "_test__file_.iso");
    }

    #[test]
    fn test_sanitize_filename_reserved() {
        assert_eq!(sanitize_filename("NUL"), "NUL_download");
        assert_eq!(sanitize_filename("aux"), "aux_download");
        assert_eq!(sanitize_filename("com1"), "com1_download");
    }

    #[test]
    fn test_mask_url_credentials() {
        let url = "https://user:mypassword@example.com/file.zip";
        let masked = mask_url(url);
        assert!(!masked.contains("mypassword"));
        assert!(masked.contains("*****"));
    }

    #[test]
    fn test_mask_url_sensitive_query() {
        let url = "https://example.com/file.tar.gz?auth=topsecret&token=abc123xyz&normal=keepme";
        let masked = mask_url(url);
        assert!(!masked.contains("topsecret"));
        assert!(!masked.contains("abc123xyz"));
        assert!(masked.contains("normal=keepme"));
    }
}
