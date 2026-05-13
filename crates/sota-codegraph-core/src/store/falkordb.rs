//! FalkorDB backend.
//!
//! Talks to FalkorDB over the Redis protocol via the `GRAPH.QUERY` command.
//! Provides the same six search tools as the SQLite backend, plus the
//! `upsert_*` operations needed by the indexer.
//!
//! The Rust side compiles and exercises the redis client API correctly, but
//! end-to-end behaviour against a live FalkorDB instance has not been verified
//! in this repo. The `#[ignore]`-gated tests at the bottom run against a real
//! FalkorDB if `FALKORDB_URL` is set in the environment.

use redis::aio::ConnectionManager;
use redis::{cmd, Client, Value};

use crate::error::CodeGraphError;
use crate::search::{FileSummary, Reference, SearchHit, SymbolEntry, SymbolMatch};
use crate::types::{Edge, EdgeKind, FileNode, SymbolKind, SymbolNode};

/// Number of properties FalkorDB returns per node entry in compact mode.
/// Not currently used — we use plain mode and `RETURN <field>` selection.

#[derive(Clone)]
pub struct FalkorStore {
    conn: ConnectionManager,
    graph: String,
}

impl FalkorStore {
    pub async fn connect(url: &str, graph_name: impl Into<String>) -> Result<Self, CodeGraphError> {
        let client = Client::open(url)
            .map_err(|e| CodeGraphError::Parse(format!("redis open: {e}")))?;
        let conn = ConnectionManager::new(client)
            .await
            .map_err(|e| CodeGraphError::Parse(format!("redis connect: {e}")))?;
        let mut store = Self {
            conn,
            graph: graph_name.into(),
        };
        store.ensure_indexes().await?;
        Ok(store)
    }

    async fn query_raw(&mut self, cypher: &str) -> Result<Value, CodeGraphError> {
        cmd("GRAPH.QUERY")
            .arg(&self.graph)
            .arg(cypher)
            .query_async::<Value>(&mut self.conn)
            .await
            .map_err(|e| CodeGraphError::Parse(format!("GRAPH.QUERY: {e}")))
    }

    /// Run a parameterised Cypher query. Parameters are emitted via FalkorDB's
    /// `CYPHER name=value` prefix, which the engine parses as values rather
    /// than Cypher syntax — closing the injection vector that inlining
    /// untrusted strings into a `format!`-built query opens.
    async fn query(
        &mut self,
        cypher: &str,
        params: &[(&str, Param<'_>)],
    ) -> Result<Value, CodeGraphError> {
        let q = if params.is_empty() {
            cypher.to_string()
        } else {
            let prefix = params
                .iter()
                .map(|(k, v)| format!("{k}={}", v.encode()))
                .collect::<Vec<_>>()
                .join(" ");
            format!("CYPHER {prefix} {cypher}")
        };
        self.query_raw(&q).await
    }

    async fn ensure_indexes(&mut self) -> Result<(), CodeGraphError> {
        // Create indexes once. CREATE INDEX is idempotent in FalkorDB when the
        // index already exists, so re-running is cheap.
        let queries = [
            "CREATE INDEX FOR (f:File) ON (f.path)",
            "CREATE INDEX FOR (s:Symbol) ON (s.name)",
        ];
        for q in queries {
            // Errors here are non-fatal — the index may already exist with a
            // slightly different shape. We ignore the result and let upserts
            // proceed.
            let _ = self.query_raw(q).await;
        }
        Ok(())
    }

    // ─────────────────────────────── Upserts ───────────────────────────────────

    pub async fn upsert_file(&mut self, file: &FileNode) -> Result<(), CodeGraphError> {
        let path = file.path.to_string_lossy().to_string();
        let lang = format!("{:?}", file.language);
        let hash = file.content_hash as i64;
        self.query(
            "MERGE (f:File {path: $path}) \
             SET f.language = $lang, f.content_hash = $hash, f.indexed_at = timestamp()",
            &[
                ("path", Param::Str(&path)),
                ("lang", Param::Str(&lang)),
                ("hash", Param::Int(hash)),
            ],
        )
        .await?;
        Ok(())
    }

    pub async fn upsert_symbol(
        &mut self,
        file_path: &str,
        sym: &SymbolNode,
    ) -> Result<(), CodeGraphError> {
        let kind = format!("{:?}", sym.kind);
        let start = sym.range.0 as i64;
        let end = sym.range.1 as i64;
        let cypher = if sym.doc_string.is_some() {
            "MATCH (f:File {path: $fpath}) \
             MERGE (f)-[:DEFINES]->(s:Symbol {name: $name, kind: $kind, start_byte: $start}) \
             SET s.end_byte = $end, s.doc_string = $doc"
        } else {
            "MATCH (f:File {path: $fpath}) \
             MERGE (f)-[:DEFINES]->(s:Symbol {name: $name, kind: $kind, start_byte: $start}) \
             SET s.end_byte = $end"
        };
        let mut params: Vec<(&str, Param<'_>)> = vec![
            ("fpath", Param::Str(file_path)),
            ("name", Param::Str(&sym.name)),
            ("kind", Param::Str(&kind)),
            ("start", Param::Int(start)),
            ("end", Param::Int(end)),
        ];
        if let Some(doc) = sym.doc_string.as_deref() {
            params.push(("doc", Param::Str(doc)));
        }
        self.query(cypher, &params).await?;
        Ok(())
    }

    pub async fn upsert_call_edge(
        &mut self,
        from_file_path: &str,
        target_symbol_name: &str,
    ) -> Result<(), CodeGraphError> {
        // Matches every symbol with the target name (consistent with the SQLite
        // backend's name-based resolution).
        self.query(
            "MATCH (src:File {path: $from}), (tgt:Symbol {name: $target}) \
             MERGE (src)-[:CALLS]->(tgt)",
            &[
                ("from", Param::Str(from_file_path)),
                ("target", Param::Str(target_symbol_name)),
            ],
        )
        .await?;
        Ok(())
    }

    // ─────────────────────────────── Tools ─────────────────────────────────────

    pub async fn file_summary(&mut self, path: &str) -> Result<FileSummary, CodeGraphError> {
        let value = self
            .query(
                "MATCH (f:File {path: $path})-[:DEFINES]->(s:Symbol) \
                 RETURN f.language, s.name, s.kind, s.doc_string, s.start_byte, s.end_byte \
                 ORDER BY s.start_byte",
                &[("path", Param::Str(path))],
            )
            .await?;
        let rows = decode_rows(&value)?;

        let mut language = String::new();
        let mut symbols = Vec::new();
        for row in rows {
            if row.len() < 6 {
                continue;
            }
            language = scalar_string(&row[0]).unwrap_or_default();
            symbols.push(SymbolEntry {
                name: scalar_string(&row[1]).unwrap_or_default(),
                kind: scalar_string(&row[2]).unwrap_or_default(),
                doc_string: scalar_string(&row[3]),
                range: (
                    scalar_i64(&row[4]).unwrap_or(0) as usize,
                    scalar_i64(&row[5]).unwrap_or(0) as usize,
                ),
            });
        }
        Ok(FileSummary {
            path: path.to_string(),
            language,
            symbols,
        })
    }

    pub async fn symbol_lookup(
        &mut self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SymbolMatch>, CodeGraphError> {
        let value = self
            .query(
                "MATCH (s:Symbol)<-[:DEFINES]-(f:File) \
                 WHERE s.name = $q OR s.name CONTAINS $q \
                 RETURN s.name, s.kind, f.path, s.start_byte, s.end_byte, \
                        CASE WHEN s.name = $q THEN 0 ELSE 1 END AS rank \
                 ORDER BY rank ASC, size(s.name) ASC \
                 LIMIT $limit",
                &[
                    ("q", Param::Str(query)),
                    ("limit", Param::Int(limit as i64)),
                ],
            )
            .await?;
        let rows = decode_rows(&value)?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                if row.len() < 5 {
                    return None;
                }
                Some(SymbolMatch {
                    name: scalar_string(&row[0])?,
                    kind: scalar_string(&row[1])?,
                    file: scalar_string(&row[2])?,
                    range: (
                        scalar_i64(&row[3])? as usize,
                        scalar_i64(&row[4])? as usize,
                    ),
                })
            })
            .collect())
    }

    pub async fn dependency_traversal(
        &mut self,
        start_file: &str,
        max_depth: u32,
    ) -> Result<Vec<String>, CodeGraphError> {
        // `*1..N` is a path-pattern literal, not a value position — Cypher
        // doesn't allow parameters there. The depth comes from a `u32` so
        // there's no injection vector; we cap it to a sane upper bound to keep
        // the query plan bounded.
        let depth = max_depth.min(64);
        let cypher = format!(
            "MATCH (start:File {{path: $path}})-[:CALLS*1..{depth}]->(:Symbol)<-[:DEFINES]-(target:File) \
             RETURN DISTINCT target.path \
             ORDER BY target.path"
        );
        let value = self
            .query(&cypher, &[("path", Param::Str(start_file))])
            .await?;
        let rows = decode_rows(&value)?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.first().and_then(scalar_string))
            .collect())
    }

    pub async fn impact_analysis(
        &mut self,
        target_file: &str,
        max_depth: u32,
    ) -> Result<Vec<String>, CodeGraphError> {
        let depth = max_depth.min(64);
        let cypher = format!(
            "MATCH (caller:File)-[:CALLS*1..{depth}]->(:Symbol)<-[:DEFINES]-(target:File {{path: $path}}) \
             RETURN DISTINCT caller.path \
             ORDER BY caller.path"
        );
        let value = self
            .query(&cypher, &[("path", Param::Str(target_file))])
            .await?;
        let rows = decode_rows(&value)?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.first().and_then(scalar_string))
            .collect())
    }

    pub async fn find_references(
        &mut self,
        symbol_name: &str,
    ) -> Result<Vec<Reference>, CodeGraphError> {
        let value = self
            .query(
                "MATCH (src:File)-[r:CALLS]->(s:Symbol {name: $name})<-[:DEFINES]-(tgt:File) \
                 RETURN src.path, s.name, tgt.path, 'Calls' AS kind",
                &[("name", Param::Str(symbol_name))],
            )
            .await?;
        let rows = decode_rows(&value)?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                if row.len() < 4 {
                    return None;
                }
                Some(Reference {
                    from_file: scalar_string(&row[0])?,
                    to_symbol: scalar_string(&row[1])?,
                    to_file: scalar_string(&row[2])?,
                    kind: scalar_string(&row[3]).unwrap_or_else(|| "Calls".to_string()),
                })
            })
            .collect())
    }

    pub async fn semantic_search_hydrate(
        &mut self,
        symbol_names: &[String],
        limit: usize,
    ) -> Result<Vec<SearchHit>, CodeGraphError> {
        // FalkorDB doesn't store the embedding vectors; the HNSW lookup runs
        // in-process. Given a list of nearest-symbol names from the HNSW
        // result, hydrate the metadata from FalkorDB.
        if symbol_names.is_empty() {
            return Ok(Vec::new());
        }
        let names: Vec<&str> = symbol_names.iter().take(limit).map(String::as_str).collect();
        let value = self
            .query(
                "MATCH (s:Symbol)<-[:DEFINES]-(f:File) \
                 WHERE s.name IN $names \
                 RETURN s.name, s.kind, f.path, s.start_byte, s.end_byte",
                &[("names", Param::StrList(&names))],
            )
            .await?;
        let rows = decode_rows(&value)?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                if row.len() < 5 {
                    return None;
                }
                let name = scalar_string(&row[0])?;
                let kind = scalar_string(&row[1])?;
                let file = scalar_string(&row[2])?;
                let start = scalar_i64(&row[3])? as usize;
                let end = scalar_i64(&row[4])? as usize;
                let snippet = std::fs::read(&file)
                    .ok()
                    .map(|bytes| {
                        let lo = start.min(bytes.len());
                        let hi = end.min(bytes.len());
                        String::from_utf8_lossy(&bytes[lo..hi]).into_owned()
                    })
                    .unwrap_or_default();
                Some(SearchHit {
                    symbol: name,
                    file,
                    kind,
                    snippet,
                    score: 0.0,
                })
            })
            .collect())
    }
}

// ─────────────────────────── Helper conversions ───────────────────────────────

/// A Cypher value emitted in the `CYPHER name=value` prefix. FalkorDB parses
/// these as values, not Cypher syntax, so the only place untrusted input
/// matters is the literal encoding here.
#[derive(Debug, Clone, Copy)]
enum Param<'a> {
    Str(&'a str),
    Int(i64),
    StrList(&'a [&'a str]),
}

impl Param<'_> {
    fn encode(&self) -> String {
        match self {
            Param::Str(s) => encode_str(s),
            Param::Int(i) => i.to_string(),
            Param::StrList(xs) => {
                let inner = xs.iter().map(|s| encode_str(s)).collect::<Vec<_>>().join(",");
                format!("[{inner}]")
            }
        }
    }
}

/// Encode a Rust string as a double-quoted Cypher string literal. Escapes
/// every character that could otherwise terminate the literal or sneak in a
/// control sequence.
fn encode_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            // Strip other control characters rather than emit them — they
            // have no valid meaning inside a code identifier or path and
            // could carry through to a downstream consumer that mishandles
            // them.
            c if (c as u32) < 0x20 => {}
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Convert a `GRAPH.QUERY` response into its rows array.
///
/// FalkorDB returns `[headers, rows, statistics]`. We only care about `rows`.
fn decode_rows(value: &Value) -> Result<Vec<Vec<Value>>, CodeGraphError> {
    let Value::Array(top) = value else {
        return Err(CodeGraphError::Parse(format!(
            "expected array, got {value:?}"
        )));
    };
    if top.len() < 2 {
        return Ok(Vec::new());
    }
    let Value::Array(rows) = &top[1] else {
        return Ok(Vec::new());
    };
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let Value::Array(cells) = row else {
            continue;
        };
        out.push(cells.clone());
    }
    Ok(out)
}

fn scalar_string(v: &Value) -> Option<String> {
    match v {
        Value::SimpleString(s) => Some(s.clone()),
        Value::BulkString(b) => Some(String::from_utf8_lossy(b).into_owned()),
        Value::VerbatimString { text, .. } => Some(text.clone()),
        _ => None,
    }
}

fn scalar_i64(v: &Value) -> Option<i64> {
    match v {
        Value::Int(i) => Some(*i),
        Value::BulkString(b) => std::str::from_utf8(b).ok()?.parse().ok(),
        Value::SimpleString(s) => s.parse().ok(),
        _ => None,
    }
}

#[allow(dead_code)]
fn unused_witness() -> (Edge, EdgeKind, SymbolKind) {
    (
        Edge {
            from_node: crate::types::NodeId(0),
            to_node: crate::types::NodeId(0),
            kind: EdgeKind::Calls,
        },
        EdgeKind::Calls,
        SymbolKind::Function,
    )
}

// ─────────────────────────────────── Tests ────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{FileId, Language};
    use std::path::PathBuf;

    /// Returns the FalkorDB URL from `FALKORDB_URL` env var, or `None` if unset.
    fn falkor_url() -> Option<String> {
        std::env::var("FALKORDB_URL").ok()
    }

    #[test]
    fn encode_str_quotes_and_escapes_specials() {
        assert_eq!(encode_str("plain"), "\"plain\"");
        assert_eq!(encode_str("with \"quotes\""), "\"with \\\"quotes\\\"\"");
        assert_eq!(encode_str(r"back\slash"), "\"back\\\\slash\"");
        assert_eq!(encode_str("line\nbreak"), "\"line\\nbreak\"");
        // Control characters are stripped, not embedded.
        assert_eq!(encode_str("ctrl\x01char"), "\"ctrlchar\"");
    }

    #[test]
    fn param_encoding() {
        assert_eq!(Param::Int(42).encode(), "42");
        assert_eq!(Param::Str("foo'bar").encode(), "\"foo'bar\"");
        let names = ["a", "b\""];
        assert_eq!(
            Param::StrList(&names[..]).encode(),
            "[\"a\",\"b\\\"\"]"
        );
    }

    /// Real integration test. Skipped unless `FALKORDB_URL` is set.
    /// Run with: `FALKORDB_URL=redis://localhost:6379 cargo test --package sota-codegraph-core -- --ignored falkor_round_trip`
    #[tokio::test]
    #[ignore]
    async fn falkor_round_trip() {
        let Some(url) = falkor_url() else {
            return;
        };
        let mut store = FalkorStore::connect(&url, "test_round_trip")
            .await
            .expect("connect");

        // Clear graph
        let _ = cmd("GRAPH.DELETE")
            .arg("test_round_trip")
            .query_async::<Value>(&mut store.conn)
            .await;

        let file = FileNode {
            path: PathBuf::from("/tmp/a.rs"),
            language: Language::Rust,
            content_hash: 0xdeadbeef,
        };
        store.upsert_file(&file).await.unwrap();

        let sym = SymbolNode {
            name: "alpha".into(),
            kind: SymbolKind::Function,
            file_id: FileId(0),
            range: (10, 42),
            parent_id: None,
            doc_string: Some("docs".into()),
        };
        store.upsert_symbol("/tmp/a.rs", &sym).await.unwrap();
        store
            .upsert_call_edge("/tmp/a.rs", "alpha")
            .await
            .unwrap();

        let summary = store.file_summary("/tmp/a.rs").await.unwrap();
        assert_eq!(summary.language, "Rust");
        assert_eq!(summary.symbols.len(), 1);
        assert_eq!(summary.symbols[0].name, "alpha");

        let hits = store.symbol_lookup("alpha", 10).await.unwrap();
        assert_eq!(hits.len(), 1);

        let refs = store.find_references("alpha").await.unwrap();
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].to_symbol, "alpha");
    }
}
