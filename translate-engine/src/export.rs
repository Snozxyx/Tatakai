use crate::{render, storage::Session};
use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
};

pub fn prepare_psd(session: &Session, page_id: &str, revision: u64) -> Result<Value> {
    if session.project.revision != revision {
        bail!("Stale project revision");
    }
    let page = session
        .project
        .pages
        .iter()
        .find(|p| p.id == page_id)
        .context("Page not found")?;
    if page.width > 30_000 || page.height > 30_000 {
        bail!("PSD dimensions cannot exceed 30,000 pixels");
    }
    let original = crate::import::decode(&session.blob(&page.blob)?)?.into_rgba8();
    let original_png = render::png(&original)?;
    let merged = render::png(&render::composite(session, page)?)?;
    let mut payload = original_png.len() + merged.len();
    let mut raw_pixels = page.width as u64 * page.height as u64 * 2;
    let mut layers = vec![];
    for layer in &page.layers {
        let (s, c) = layer.rotation.to_radians().sin_cos();
        let cx = layer.x + layer.width / 2.;
        let cy = layer.y + layer.height / 2.;
        let ex = c.abs() * layer.width / 2. + s.abs() * layer.height / 2.;
        let ey = s.abs() * layer.width / 2. + c.abs() * layer.height / 2.;
        let left = (cx - ex).floor().clamp(0., page.width as f32) as u32;
        let top = (cy - ey).floor().clamp(0., page.height as f32) as u32;
        let right = (cx + ex).ceil().clamp(0., page.width as f32) as u32;
        let bottom = (cy + ey).ceil().clamp(0., page.height as f32) as u32;
        let width = right.saturating_sub(left).max(1);
        let height = bottom.saturating_sub(top).max(1);
        raw_pixels += width as u64 * height as u64;
        if raw_pixels > 64 * 1024 * 1024 {
            bail!("This page exceeds the layered PSD memory budget");
        }
        let mut bitmap = image::RgbaImage::new(width, height);
        let mut visible = layer.clone();
        visible.opacity = 1.;
        visible.visible = true;
        render::draw_layer(&mut bitmap, session, &visible, left as f32, top as f32)?;
        let bytes = render::png(&bitmap)?;
        payload += bytes.len();
        if payload > 64 * 1024 * 1024 {
            bail!("PSD preview payload exceeds the export budget");
        }
        layers.push(json!({"layer":layer,"png":STANDARD.encode(bytes),"left":left,"top":top}));
    }
    Ok(
        json!({"width":page.width,"height":page.height,"label":page.label,"pageId":page.id,"original":STANDARD.encode(original_png),"merged":STANDARD.encode(merged),"layers":layers,
        "metadata":{"schema":1,"projectId":session.project.id,"revision":session.project.revision,"title":session.project.name,"sourceLanguage":session.project.source_language,"targetLanguage":session.project.target_language,"translator":session.project.credit,"mapping":session.project.mapping,"fonts":session.project.fonts}}),
    )
}

fn safe_name(value: &str) -> String {
    let s: String = value
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(120)
        .collect();
    let s = s.trim_matches(|c| c == '.' || c == ' ');
    if s.is_empty() {
        "page".into()
    } else {
        s.into()
    }
}
pub fn pages(session: &Session, args: &Value) -> Result<()> {
    let path = PathBuf::from(crate::str_arg(args, "path")?);
    if !path.is_dir() {
        bail!("Choose an existing output folder");
    }
    let format = crate::str_arg(args, "format")?;
    if format != "png" {
        bail!("Editable layered PSD export is not available in this engine build");
    }
    let ids: Vec<String> = serde_json::from_value(args["pageIds"].clone())?;
    if ids.is_empty() {
        bail!("Select at least one page");
    }
    let mut outputs = vec![];
    for (i, id) in ids.iter().enumerate() {
        let page = session
            .project
            .pages
            .iter()
            .find(|p| &p.id == id)
            .context("Page not found")?;
        let name = format!("{:04}_{}.png", i + 1, safe_name(&page.label));
        if path.join(&name).exists() {
            bail!("Export would overwrite {name}. Choose an empty folder.");
        }
        outputs.push((name, render::png(&render::composite(session, page)?)?));
    }
    if path.join("tatakai-translation.json").exists() {
        bail!("An export manifest already exists in this folder. Choose an empty folder.");
    }
    let manifest = json!({"schema":1,"projectId":session.project.id,"revision":session.project.revision,"title":session.project.name,
        "sourceLanguage":session.project.source_language,"targetLanguage":session.project.target_language,"translator":session.project.credit,
        "mapping":session.project.mapping,"fonts":session.project.fonts,"pages":ids,"files":outputs.iter().map(|(name,_)|name).collect::<Vec<_>>()});
    for (name, bytes) in &outputs {
        let mut f = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path.join(name))?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    let mut f = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path.join("tatakai-translation.json"))?;
    f.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
    f.sync_all()?;
    Ok(())
}
pub fn backup(session: &Session, path: PathBuf) -> Result<()> {
    // Write a complete portable archive to a unique temporary file, then publish it.
    if path.exists() {
        bail!("Backup destination already exists");
    }
    let parent = path.parent().context("Invalid backup path")?;
    let temp = parent.join(format!(".tatakai-backup-{}.tmp", crate::scene::id()));
    let file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)?;
    let result = (|| -> Result<()> {
        let mut zip = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for entry in walkdir::WalkDir::new(&session.dir).follow_links(false) {
            let entry = entry?;
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry.path().strip_prefix(&session.dir)?;
            if relative == std::path::Path::new("project.lock")
                || relative.starts_with("vision-cache")
                || entry.path().extension().is_some_and(|s| s == "tmp")
            {
                continue;
            }
            zip.start_file(relative.to_string_lossy().replace('\\', "/"), opts)?;
            let mut f = fs::File::open(entry.path())?;
            let mut buf = [0u8; 65536];
            loop {
                let n = f.read(&mut buf)?;
                if n == 0 {
                    break;
                }
                zip.write_all(&buf[..n])?;
            }
        }
        zip.finish()?.sync_all()?;
        fs::rename(&temp, &path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_contains_credit_and_same_render() {
        let root = tempfile::tempdir().unwrap();
        let mut s = Session::create(
            root.path().join("a.tatakaiproj"),
            crate::scene::Project::new(
                "Test".into(),
                crate::scene::Credit {
                    name: "Translator".into(),
                    user_id: Some("user-1".into()),
                },
            ),
        )
        .unwrap();
        let src = root.path().join("page.png");
        image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 255, 255, 255]))
            .save(&src)
            .unwrap();
        crate::import::import(&mut s, &[src], 0).unwrap();
        let out = root.path().join("out");
        fs::create_dir(&out).unwrap();
        pages(
            &s,
            &json!({"path":out,"format":"png","pageIds":[s.project.pages[0].id]}),
        )
        .unwrap();
        let manifest: Value =
            serde_json::from_slice(&fs::read(out.join("tatakai-translation.json")).unwrap())
                .unwrap();
        assert_eq!(manifest["translator"]["userId"], "user-1");
        assert_eq!(
            fs::read(out.join(manifest["files"][0].as_str().unwrap())).unwrap(),
            render::png(&render::composite(&s, &s.project.pages[0]).unwrap()).unwrap()
        );
        assert!(pages(
            &s,
            &json!({"path":out,"format":"png","pageIds":[s.project.pages[0].id]})
        )
        .is_err());
    }
}
