use crate::{scene::FontAsset, storage::Session};
use anyhow::{bail, Context, Result};
use std::{fs::File, io::Read, path::Path};

pub fn import(session: &mut Session, path: &Path, revision: u64) -> Result<String> {
    if revision != session.project.revision {
        bail!("Stale project revision");
    }
    let file = File::open(path)?;
    if !file.metadata()?.is_file() || file.metadata()?.len() > 20 * 1024 * 1024 {
        bail!("Choose a TTF, OTF or TTC font smaller than 20 MB");
    }
    let mut bytes = vec![];
    file.take(20 * 1024 * 1024 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > 20 * 1024 * 1024 {
        bail!("Font exceeds size limit");
    }
    let mut fonts = cosmic_text::FontSystem::new();
    let before: std::collections::HashSet<_> = fonts.db().faces().map(|face| face.id).collect();
    fonts.db_mut().load_font_data(bytes.clone());
    let family = fonts
        .db()
        .faces()
        .find(|face| !before.contains(&face.id))
        .and_then(|face| face.families.first())
        .map(|(name, _)| name.clone())
        .context("This file does not contain a supported font")?;
    let blob = session.put_blob(&bytes)?;
    if !session.project.fonts.iter().any(|font| font.blob == blob) {
        let mut project = session.project.clone();
        project.fonts.push(FontAsset {
            blob,
            family: family.clone(),
        });
        session.commit(project, revision)?;
    }
    Ok(family)
}
