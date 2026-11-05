use anyhow::{Context, Result, ensure};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, path::Path, sync::Arc};

pub const VALIDATION_VERSION: i32 = 1;
pub const BUFFER_DAYS: i64 = 14;
pub const REUSE_DAYS: i64 = 90;
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct EnglishRule {
    pub pointer: String,
    pub length: usize,
    pub lexicon: String,
    pub avoid_reuse: bool,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct ClueRule {
    pub pointer: String,
    pub answer_pointer: String,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub api_version: u32,
    pub id: String,
    pub version: i32,
    pub title: String,
    pub description: String,
    pub tagline: String,
    pub skill: String,
    pub theme: String,
    pub art: String,
    pub entry: String,
    pub english_rules: Vec<EnglishRule>,
    pub generated_fields: Vec<String>,
    pub clue_rules: Vec<ClueRule>,
    #[serde(default)]
    pub anagram_rules: Vec<ClueRule>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stylesheet: Option<String>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModuleCatalog {
    pub fixtures: Vec<Value>,
    pub lexicons: BTreeMap<String, Vec<String>>,
}
#[derive(Clone)]
pub struct GameModule {
    pub manifest: Manifest,
    pub schema: Value,
    pub catalog: ModuleCatalog,
    validator: Arc<jsonschema::Validator>,
}
pub type Registry = BTreeMap<String, GameModule>;
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct ScheduledPuzzle {
    pub game_id: String,
    pub date: NaiveDate,
    pub number: i64,
    pub module_version: i32,
    pub content: Value,
}

pub fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 48
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && id.as_bytes()[0].is_ascii_lowercase()
}
pub fn is_word(word: &str, length: usize) -> bool {
    word.len() == length && word.bytes().all(|b| b.is_ascii_uppercase())
}
pub fn number(date: NaiveDate) -> i64 {
    (date - NaiveDate::from_ymd_opt(2026, 11, 5).unwrap()).num_days() + 1
}
fn no_external_refs(v: &Value) -> bool {
    match v {
        Value::Object(o) => o.iter().all(|(k, v)| {
            (k != "$ref" || v.as_str().is_some_and(|s| s.starts_with('#'))) && no_external_refs(v)
        }),
        Value::Array(a) => a.iter().all(no_external_refs),
        _ => true,
    }
}
fn values_at<'a>(v: &'a Value, pointer: &str) -> Result<Vec<&'a str>> {
    ensure!(pointer.starts_with('/'), "invalid_word_pointer");
    if let Some(parent) = pointer.strip_suffix("/*") {
        let array = v
            .pointer(parent)
            .and_then(Value::as_array)
            .context("word_array_missing")?;
        ensure!(!array.is_empty(), "empty_word_array");
        array
            .iter()
            .map(|v| v.as_str().context("word_not_string"))
            .collect()
    } else {
        Ok(vec![
            v.pointer(pointer)
                .and_then(Value::as_str)
                .context("word_missing")?,
        ])
    }
}
fn clue_valid(clue: &str, answer: &str) -> Result<()> {
    ensure!((12..=180).contains(&clue.chars().count()), "clue_length");
    ensure!(
        clue == clue.trim() && !clue.chars().any(char::is_control) && !clue.contains(['<', '>']),
        "clue_format"
    );
    let compact: String = clue
        .chars()
        .filter(char::is_ascii_alphabetic)
        .map(|c| c.to_ascii_uppercase())
        .collect();
    ensure!(!compact.contains(answer), "answer_leakage");
    Ok(())
}
impl GameModule {
    pub fn from_parts(manifest: Manifest, schema: Value, catalog: ModuleCatalog) -> Result<Self> {
        ensure!(
            manifest.api_version == 1 && manifest.version > 0 && safe_id(&manifest.id),
            "module_identity"
        );
        ensure!(
            (1..=48).contains(&manifest.title.chars().count())
                && (12..=240).contains(&manifest.description.chars().count())
                && (12..=240).contains(&manifest.tagline.chars().count())
                && (1..=50).contains(&manifest.skill.chars().count())
                && (1..=8).contains(&manifest.art.chars().count()),
            "module_presentation_bounds"
        );
        ensure!(
            manifest.entry == "game.js"
                && ["blue", "yellow", "teal", "purple"].contains(&manifest.theme.as_str()),
            "module_entry_or_theme"
        );
        ensure!(
            !manifest.english_rules.is_empty() && !manifest.generated_fields.is_empty(),
            "module_validation_rules_required"
        );
        ensure!(
            !manifest.clue_rules.is_empty(),
            "module_clue_rules_required"
        );
        ensure!(
            (1..=365).contains(&catalog.fixtures.len()),
            "module_catalog_size"
        );
        ensure!(no_external_refs(&schema), "external_schema_refs_disabled");
        ensure!(
            schema.get("additionalProperties") == Some(&Value::Bool(false)),
            "schema_must_reject_unknown_fields"
        );
        for field in &manifest.generated_fields {
            ensure!(
                manifest.clue_rules.iter().any(|r| &r.pointer == field),
                "generated_fields_must_have_clue_rules"
            );
            ensure!(
                !manifest
                    .english_rules
                    .iter()
                    .any(|r| &r.pointer == field || r.pointer.starts_with(&format!("{field}/"))),
                "cannot_generate_answer_fields"
            );
        }
        for rule in &manifest.english_rules {
            ensure!((1..=32).contains(&rule.length), "word_length_rule");
            let lexicon = catalog
                .lexicons
                .get(&rule.lexicon)
                .context("english_lexicon_missing")?;
            ensure!(
                !lexicon.is_empty() && lexicon.iter().all(|w| is_word(w, rule.length)),
                "english_lexicon_shape"
            );
        }
        ensure!(
            manifest
                .stylesheet
                .as_deref()
                .is_none_or(|s| s == "styles.css"),
            "module_stylesheet_path"
        );
        let validator = Arc::new(
            jsonschema::validator_for(&schema)
                .map_err(|e| anyhow::anyhow!("invalid_module_schema: {e}"))?,
        );
        let module = Self {
            manifest,
            schema,
            catalog,
            validator,
        };
        let mut seen_tokens = std::collections::HashSet::new();
        for fixture in &module.catalog.fixtures {
            module.validate_content(fixture)?;
            for token in module.tokens(fixture)? {
                ensure!(seen_tokens.insert(token), "duplicate_catalog_answer");
            }
            for field in &module.manifest.generated_fields {
                ensure!(fixture.pointer(field).is_some(), "generated_field_missing");
            }
        }
        Ok(module)
    }
    pub fn load(path: &Path) -> Result<Self> {
        fn read<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
            let meta = std::fs::symlink_metadata(path)?;
            ensure!(
                meta.is_file() && !meta.file_type().is_symlink() && meta.len() <= 2_000_000,
                "invalid_module_file"
            );
            Ok(serde_json::from_slice(&std::fs::read(path)?)?)
        }
        let module = Self::from_parts(
            read(&path.join("manifest.json"))?,
            read(&path.join("schema.json"))?,
            read(&path.join("catalog.json"))?,
        )?;
        let entry = std::fs::symlink_metadata(path.join("game.js"))?;
        ensure!(
            entry.is_file() && !entry.file_type().is_symlink(),
            "module_entry_missing"
        );
        if module.manifest.stylesheet.is_some() {
            let style = std::fs::symlink_metadata(path.join("styles.css"))?;
            ensure!(
                style.is_file() && !style.file_type().is_symlink() && style.len() <= 200_000,
                "invalid_module_stylesheet"
            );
        }
        Ok(module)
    }
    pub fn validate_content(&self, v: &Value) -> Result<()> {
        ensure!(serde_json::to_vec(v)?.len() <= 65536, "puzzle_too_large");
        if let Some(error) = self.validator.iter_errors(v).next() {
            anyhow::bail!("content_schema_failed:{}", error.instance_path);
        }
        ensure!(
            v.get("language").and_then(Value::as_str) == Some("en"),
            "language_not_english"
        );
        for rule in &self.manifest.english_rules {
            for word in values_at(v, &rule.pointer)? {
                ensure!(is_word(word, rule.length), "word_length_or_alphabet");
                ensure!(
                    self.catalog.lexicons[&rule.lexicon]
                        .iter()
                        .any(|w| w == word),
                    "word_not_approved_english"
                );
            }
        }
        for rule in &self.manifest.clue_rules {
            let clue = v
                .pointer(&rule.pointer)
                .and_then(Value::as_str)
                .context("clue_missing")?;
            for answer in values_at(v, &rule.answer_pointer)? {
                clue_valid(clue, answer)?;
            }
        }
        for rule in &self.manifest.anagram_rules {
            let answer = v
                .pointer(&rule.answer_pointer)
                .and_then(Value::as_str)
                .context("anagram_answer_missing")?;
            let mut expected = answer.as_bytes().to_vec();
            expected.sort_unstable();
            for word in values_at(v, &rule.pointer)? {
                let mut letters = word.as_bytes().to_vec();
                letters.sort_unstable();
                ensure!(letters == expected, "invalid_anagram");
            }
        }
        Ok(())
    }
    pub fn validate_proposal(&self, candidate: &Value, template: &Value) -> Result<()> {
        self.validate_content(candidate)?;
        let mut locked = candidate.clone();
        for field in &self.manifest.generated_fields {
            let original = template
                .pointer(field)
                .context("template_generated_field_missing")?;
            *locked
                .pointer_mut(field)
                .context("proposal_generated_field_missing")? = original.clone();
        }
        ensure!(locked == *template, "model_changed_locked_content");
        Ok(())
    }
    pub fn tokens(&self, content: &Value) -> Result<Vec<String>> {
        let mut tokens = Vec::new();
        for rule in &self.manifest.english_rules {
            if rule.avoid_reuse {
                tokens.extend(
                    values_at(content, &rule.pointer)?
                        .into_iter()
                        .map(str::to_string),
                );
            }
        }
        Ok(tokens)
    }
    pub fn scheduled(&self, date: NaiveDate, content: Value) -> Result<ScheduledPuzzle> {
        self.validate_content(&content)?;
        // Published content must be derivable from one reviewed fixture, with only
        // declared clue fields changed. This holds at the durable write boundary.
        ensure!(
            self.catalog
                .fixtures
                .iter()
                .any(|template| self.validate_proposal(&content, template).is_ok()),
            "content_not_from_reviewed_fixture"
        );
        Ok(ScheduledPuzzle {
            game_id: self.manifest.id.clone(),
            date,
            number: number(date),
            module_version: self.manifest.version,
            content,
        })
    }
    pub fn validate_scheduled(&self, p: &ScheduledPuzzle) -> Result<()> {
        ensure!(
            p.game_id == self.manifest.id
                && p.module_version == self.manifest.version
                && p.number == number(p.date),
            "scheduled_identity_mismatch"
        );
        self.scheduled(p.date, p.content.clone())?;
        Ok(())
    }
}
pub fn load_registry(root: &Path) -> Result<Registry> {
    let mut registry = Registry::new();
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let metadata = std::fs::symlink_metadata(entry.path())?;
        if !metadata.is_dir() {
            continue;
        }
        ensure!(
            !metadata.file_type().is_symlink(),
            "symlink_modules_not_allowed"
        );
        let module = GameModule::load(&entry.path()).with_context(|| {
            format!(
                "invalid game package {}",
                entry.file_name().to_string_lossy()
            )
        })?;
        ensure!(
            entry.file_name().to_string_lossy() == module.manifest.id,
            "module_directory_id_mismatch"
        );
        ensure!(
            registry
                .insert(module.manifest.id.clone(), module)
                .is_none(),
            "duplicate_module_id"
        );
    }
    ensure!(!registry.is_empty(), "no_games_installed");
    Ok(registry)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn games() -> Registry {
        load_registry(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../games")
                .as_path(),
        )
        .unwrap()
    }
    #[test]
    fn invalid_model_words_and_shapes_cannot_publish() {
        let registry = games();
        let m = &registry["fivefold"];
        let fixture = &m.catalog.fixtures[0];
        for word in [
            "PLAN",
            "PLANET",
            "plANT",
            "PLÁNT",
            "PL4NT",
            "ZZZZZ",
            "PERRO",
            "你好世界啊",
            " PLANT",
        ] {
            let mut c = fixture.clone();
            c["answer"] = word.into();
            assert!(m.validate_proposal(&c, fixture).is_err(), "accepted {word}");
        }
        let mut c = fixture.clone();
        c["language"] = "es".into();
        assert!(m.validate_proposal(&c, fixture).is_err());
        let mut c = fixture.clone();
        c["extra"] = true.into();
        assert!(m.validate_proposal(&c, fixture).is_err());
        let mut c = fixture.clone();
        c.as_object_mut().unwrap().remove("answer");
        assert!(m.validate_proposal(&c, fixture).is_err());
        let mut c = fixture.clone();
        c["answer"] = serde_json::json!(["P", "L", "A", "N", "T"]);
        assert!(m.validate_proposal(&c, fixture).is_err());
        let m = &registry["unjumble"];
        for word in ["GARDE", "GARDENS", "JARDIN", "GARDÉN", "garden"] {
            let mut c = m.catalog.fixtures[0].clone();
            c["answer"] = word.into();
            assert!(m.validate_proposal(&c, &m.catalog.fixtures[0]).is_err());
        }
    }
    #[test]
    fn locked_answers_definitions_and_clue_boundaries_are_enforced() {
        let r = games();
        let m = &r["fivefold"];
        let f = &m.catalog.fixtures[0];
        for (field, text) in [
            ("answer", "CRANE".to_string()),
            ("note", "An unreviewed definition.".into()),
            ("clue", "The answer is PLANT here.".into()),
            ("clue", "Try P L A N T today.".into()),
            ("clue", "x".repeat(181)),
            ("clue", "short".into()),
            ("clue", "A rooted\nthing.".into()),
            ("clue", "<b>A rooted thing</b>".into()),
        ] {
            let mut c = f.clone();
            c[field] = text.into();
            assert!(m.validate_proposal(&c, f).is_err());
        }
        let mut c = f.clone();
        c["clue"] = "Think of roots and green leaves.".into();
        assert!(m.validate_proposal(&c, f).is_ok());
    }
    #[test]
    fn new_module_identity_needs_no_game_specific_backend_code() {
        let r = games();
        let m = &r["fivefold"];
        let mut manifest = m.manifest.clone();
        manifest.id = "third-game".into();
        manifest.title = "Third game".into();
        let installed =
            GameModule::from_parts(manifest, m.schema.clone(), m.catalog.clone()).unwrap();
        let p = installed
            .scheduled(
                NaiveDate::from_ymd_opt(2026, 11, 5).unwrap(),
                installed.catalog.fixtures[0].clone(),
            )
            .unwrap();
        assert_eq!(p.game_id, "third-game");
    }
    #[test]
    fn schemas_cannot_fetch_remote_references_and_catalogs_cannot_self_admit_foreign_words() {
        let r = games();
        let m = &r["fivefold"];
        let mut schema = m.schema.clone();
        schema["$ref"] = "https://example.com/schema".into();
        assert!(GameModule::from_parts(m.manifest.clone(), schema, m.catalog.clone()).is_err());
        let mut duplicate = m.catalog.clone();
        duplicate.fixtures[1] = duplicate.fixtures[0].clone();
        assert!(GameModule::from_parts(m.manifest.clone(), m.schema.clone(), duplicate).is_err());
        let mut cat = m.catalog.clone();
        cat.fixtures[0]["answer"] = "PERRO".into();
        assert!(GameModule::from_parts(m.manifest.clone(), m.schema.clone(), cat).is_err());
    }
}
