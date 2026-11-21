use orveth_core::error::{OrvethError, Result};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BValue {
    Int(i64),
    Bytes(Vec<u8>),
    List(Vec<BValue>),
    Dict(BTreeMap<Vec<u8>, BValue>),
}

impl BValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            BValue::Bytes(b) => std::str::from_utf8(b).ok(),
            _ => None,
        }
    }

    pub fn as_bytes(&self) -> Option<&[u8]> {
        match self {
            BValue::Bytes(b) => Some(b),
            _ => None,
        }
    }

    pub fn as_int(&self) -> Option<i64> {
        match self {
            BValue::Int(i) => Some(*i),
            _ => None,
        }
    }

    pub fn as_list(&self) -> Option<&[BValue]> {
        match self {
            BValue::List(l) => Some(l),
            _ => None,
        }
    }

    pub fn as_dict(&self) -> Option<&BTreeMap<Vec<u8>, BValue>> {
        match self {
            BValue::Dict(d) => Some(d),
            _ => None,
        }
    }

    pub fn get_key(&self, key: &str) -> Option<&BValue> {
        match self {
            BValue::Dict(d) => d.get(key.as_bytes()),
            _ => None,
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.encode_into(&mut buf);
        buf
    }

    fn encode_into(&self, buf: &mut Vec<u8>) {
        match self {
            BValue::Int(i) => {
                buf.push(b'i');
                buf.extend_from_slice(i.to_string().as_bytes());
                buf.push(b'e');
            }
            BValue::Bytes(b) => {
                buf.extend_from_slice(b.len().to_string().as_bytes());
                buf.push(b':');
                buf.extend_from_slice(b);
            }
            BValue::List(l) => {
                buf.push(b'l');
                for item in l {
                    item.encode_into(buf);
                }
                buf.push(b'e');
            }
            BValue::Dict(d) => {
                buf.push(b'd');
                for (k, v) in d {
                    buf.extend_from_slice(k.len().to_string().as_bytes());
                    buf.push(b':');
                    buf.extend_from_slice(k);
                    v.encode_into(buf);
                }
                buf.push(b'e');
            }
        }
    }
}

pub struct BencodeParser;

impl BencodeParser {
    pub fn parse(bytes: &[u8]) -> Result<BValue> {
        let (val, _) = Self::parse_value(bytes, 0)?;
        Ok(val)
    }

    pub fn parse_value(bytes: &[u8], mut idx: usize) -> Result<(BValue, usize)> {
        if idx >= bytes.len() {
            return Err(OrvethError::Torrent(
                "Unexpected end of bencoded input".to_string(),
            ));
        }

        match bytes[idx] {
            b'i' => {
                idx += 1;
                let end = bytes[idx..]
                    .iter()
                    .position(|&b| b == b'e')
                    .ok_or_else(|| {
                        OrvethError::Torrent("Unterminated bencoded integer".to_string())
                    })?;
                let int_slice = &bytes[idx..idx + end];
                let int_str = std::str::from_utf8(int_slice)
                    .map_err(|_| OrvethError::Torrent("Invalid integer bytes".to_string()))?;
                let num: i64 = int_str
                    .parse()
                    .map_err(|_| OrvethError::Torrent("Failed to parse integer".to_string()))?;
                Ok((BValue::Int(num), idx + end + 1))
            }
            b'l' => {
                idx += 1;
                let mut list = Vec::new();
                while idx < bytes.len() && bytes[idx] != b'e' {
                    let (item, next_idx) = Self::parse_value(bytes, idx)?;
                    list.push(item);
                    idx = next_idx;
                }
                if idx >= bytes.len() || bytes[idx] != b'e' {
                    return Err(OrvethError::Torrent(
                        "Unterminated bencoded list".to_string(),
                    ));
                }
                Ok((BValue::List(list), idx + 1))
            }
            b'd' => {
                idx += 1;
                let mut dict = BTreeMap::new();
                while idx < bytes.len() && bytes[idx] != b'e' {
                    let (key_val, next_idx) = Self::parse_value(bytes, idx)?;
                    let key = match key_val {
                        BValue::Bytes(k) => k,
                        _ => {
                            return Err(OrvethError::Torrent(
                                "Dict key must be byte string".to_string(),
                            ))
                        }
                    };
                    let (val, val_idx) = Self::parse_value(bytes, next_idx)?;
                    dict.insert(key, val);
                    idx = val_idx;
                }
                if idx >= bytes.len() || bytes[idx] != b'e' {
                    return Err(OrvethError::Torrent(
                        "Unterminated bencoded dict".to_string(),
                    ));
                }
                Ok((BValue::Dict(dict), idx + 1))
            }
            b'0'..=b'9' => {
                let colon_pos = bytes[idx..]
                    .iter()
                    .position(|&b| b == b':')
                    .ok_or_else(|| {
                        OrvethError::Torrent("Missing colon in byte string".to_string())
                    })?;
                let len_slice = &bytes[idx..idx + colon_pos];
                let len_str = std::str::from_utf8(len_slice)
                    .map_err(|_| OrvethError::Torrent("Invalid byte string length".to_string()))?;
                let str_len: usize = len_str.parse().map_err(|_| {
                    OrvethError::Torrent("Failed to parse byte string length".to_string())
                })?;

                let start = idx + colon_pos + 1;
                let end = start + str_len;
                if end > bytes.len() {
                    return Err(OrvethError::Torrent(
                        "Byte string length exceeds buffer".to_string(),
                    ));
                }
                let data = bytes[start..end].to_vec();
                Ok((BValue::Bytes(data), end))
            }
            _ => Err(OrvethError::Torrent(format!(
                "Invalid bencode token byte {} at offset {}",
                bytes[idx], idx
            ))),
        }
    }

    /// Extracts the raw slice of the "info" dictionary for SHA-1 infohash calculation.
    pub fn extract_raw_dict_value<'a>(bytes: &'a [u8], key: &[u8]) -> Option<&'a [u8]> {
        if bytes.is_empty() || bytes[0] != b'd' {
            return None;
        }

        let mut idx = 1;
        while idx < bytes.len() && bytes[idx] != b'e' {
            let (k_val, next_idx) = match Self::parse_value(bytes, idx) {
                Ok(res) => res,
                Err(_) => return None,
            };

            let k_bytes = match k_val {
                BValue::Bytes(b) => b,
                _ => return None,
            };

            let val_start = next_idx;
            let (_, val_end) = match Self::parse_value(bytes, val_start) {
                Ok(res) => res,
                Err(_) => return None,
            };

            if k_bytes == key {
                return Some(&bytes[val_start..val_end]);
            }

            idx = val_end;
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bencode_int() {
        let parsed = BencodeParser::parse(b"i42e").unwrap();
        assert_eq!(parsed, BValue::Int(42));
        assert_eq!(parsed.encode(), b"i42e");

        let neg = BencodeParser::parse(b"i-100e").unwrap();
        assert_eq!(neg, BValue::Int(-100));
    }

    #[test]
    fn test_bencode_bytes() {
        let parsed = BencodeParser::parse(b"4:spam").unwrap();
        assert_eq!(parsed, BValue::Bytes(b"spam".to_vec()));
        assert_eq!(parsed.as_str(), Some("spam"));
        assert_eq!(parsed.encode(), b"4:spam");
    }

    #[test]
    fn test_bencode_list() {
        let parsed = BencodeParser::parse(b"l4:spami42ee").unwrap();
        assert_eq!(
            parsed,
            BValue::List(vec![BValue::Bytes(b"spam".to_vec()), BValue::Int(42)])
        );
        assert_eq!(parsed.encode(), b"l4:spami42ee");
    }

    #[test]
    fn test_bencode_dict() {
        let parsed = BencodeParser::parse(b"d3:bar4:spam3:fooi42ee").unwrap();
        assert_eq!(parsed.get_key("bar").and_then(|v| v.as_str()), Some("spam"));
        assert_eq!(parsed.get_key("foo").and_then(|v| v.as_int()), Some(42));
    }

    #[test]
    fn test_extract_raw_info_slice() {
        let raw = b"d4:infod4:name4:test12:piece lengthi16384ee8:announce15:http://tr.local7:comment4:good1:ye";
        let info_slice = BencodeParser::extract_raw_dict_value(raw, b"info").unwrap();
        assert_eq!(info_slice, b"d4:name4:test12:piece lengthi16384ee");
    }
}
