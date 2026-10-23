use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn id() -> String {
    Uuid::new_v4().to_string()
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Credit {
    pub name: String,
    pub user_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mapping {
    pub manga_id: String,
    pub chapter_id: String,
    pub source_id: String,
    pub title: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub schema: u32,
    pub id: String,
    pub name: String,
    pub revision: u64,
    pub source_language: String,
    pub target_language: String,
    pub credit: Credit,
    pub mapping: Option<Mapping>,
    pub pages: Vec<Page>,
    #[serde(default)]
    pub fonts: Vec<FontAsset>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FontAsset {
    pub blob: String,
    pub family: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Page {
    pub id: String,
    pub label: String,
    pub blob: String,
    pub width: u32,
    pub height: u32,
    pub layers: Vec<Layer>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub opacity: f32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cleanup: Option<CleanupRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_region: Option<SourceRegion>,
    #[serde(flatten)]
    pub content: Content,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceRegion {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CleanupRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edited: Option<bool>,
    pub mask: String,
    pub source_blob: String,
    pub method: String,
    pub runtime: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Content {
    Text {
        source: String,
        translation: String,
        style: TextStyle,
        #[serde(rename = "sourceEdited")]
        source_edited: bool,
        #[serde(rename = "translationEdited")]
        translation_edited: bool,
    },
    Raster {
        blob: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextStyle {
    pub family: String,
    pub size: f32,
    pub weight: u16,
    pub italic: bool,
    pub fill: [u8; 4],
    pub stroke: [u8; 4],
    pub stroke_width: f32,
    pub align: String,
    pub direction: String,
    pub auto_fit: bool,
}
impl Default for TextStyle {
    fn default() -> Self {
        Self {
            family: "sans-serif".into(),
            size: 28.,
            weight: 400,
            italic: false,
            fill: [0, 0, 0, 255],
            stroke: [255, 255, 255, 255],
            stroke_width: 0.,
            align: "center".into(),
            direction: "auto".into(),
            auto_fit: true,
        }
    }
}
impl Project {
    pub fn new(name: String, credit: Credit) -> Self {
        Self {
            schema: 1,
            id: id(),
            name,
            revision: 0,
            source_language: "auto".into(),
            target_language: "en".into(),
            credit,
            mapping: None,
            pages: vec![],
            fonts: vec![],
        }
    }
    pub fn validate(&self) -> Result<()> {
        if self.fonts.len() > 30
            || self.fonts.iter().any(|font| {
                !valid_blob(&font.blob) || font.family.is_empty() || font.family.len() > 300
            })
        {
            bail!("Invalid project font assets");
        }
        if self.schema != 1 || Uuid::parse_str(&self.id).is_err() {
            bail!("Unsupported project format");
        }
        if self.name.trim().is_empty() || self.name.len() > 200 || self.credit.name.len() > 200 {
            bail!("Project name or credit is invalid");
        }
        if self.source_language.is_empty()
            || self.source_language.len() > 35
            || self.target_language.is_empty()
            || self.target_language.len() > 35
            || self.credit.user_id.as_ref().is_some_and(|v| v.len() > 200)
            || self.mapping.as_ref().is_some_and(|m| {
                [&m.manga_id, &m.chapter_id, &m.source_id, &m.title]
                    .iter()
                    .any(|v| v.len() > 2048)
            })
        {
            bail!("Project language, credit or source mapping exceeds its size limit");
        }
        if self.pages.len() > 2000 {
            bail!("Projects are limited to 2,000 pages");
        }
        let mut ids = std::collections::HashSet::new();
        for page in &self.pages {
            if page.layers.len() > 2000 || page.label.len() > 500 {
                bail!("Page exceeds the layer or label limit");
            }
            if !ids.insert(&page.id)
                || !valid_blob(&page.blob)
                || page.width == 0
                || page.height == 0
                || page.width as u64 * page.height as u64 > 100_000_000
            {
                bail!("Invalid or duplicate page");
            }
            for layer in &page.layers {
                if let Some(r) = &layer.source_region {
                    if ![r.x, r.y, r.width, r.height].iter().all(|v| v.is_finite())
                        || r.x < 0.
                        || r.y < 0.
                        || r.width <= 0.
                        || r.height <= 0.
                        || r.x + r.width > page.width as f32 + 1.
                        || r.y + r.height > page.height as f32 + 1.
                    {
                        bail!("Invalid source text region");
                    }
                }
                if let Some(cleanup) = &layer.cleanup {
                    if !valid_blob(&cleanup.mask)
                        || !valid_blob(&cleanup.source_blob)
                        || !matches!(cleanup.method.as_str(), "edge-fill" | "diffusion")
                        || cleanup.runtime.len() > 2048
                    {
                        bail!("Invalid cleanup provenance");
                    }
                }
                if !ids.insert(&layer.id)
                    || layer.name.len() > 500
                    || ![
                        layer.x,
                        layer.y,
                        layer.width,
                        layer.height,
                        layer.rotation,
                        layer.opacity,
                    ]
                    .iter()
                    .all(|v| v.is_finite())
                    || layer.width <= 0.
                    || layer.height <= 0.
                    || !(0. ..=1.).contains(&layer.opacity)
                {
                    bail!("Invalid layer geometry");
                }
                match &layer.content {
                    Content::Raster { blob } if !valid_blob(blob) => {
                        bail!("Invalid artwork reference")
                    }
                    Content::Text {
                        style,
                        translation,
                        source,
                        ..
                    } => {
                        if !style.size.is_finite()
                            || !(1. ..=1000.).contains(&style.size)
                            || !style.stroke_width.is_finite()
                            || !(0. ..=20.).contains(&style.stroke_width)
                            || translation.len() > 100_000
                            || source.len() > 100_000
                            || !["auto", "ltr", "rtl", "vertical-rl"]
                                .contains(&style.direction.as_str())
                            || !["left", "center", "right"].contains(&style.align.as_str())
                        {
                            bail!("Invalid typography");
                        }
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }
}
pub fn valid_blob(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
