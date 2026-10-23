use crate::{
    scene::{id, Page},
    storage::Session,
};
use anyhow::{bail, Context, Result};
use image::ImageReader;
use std::{
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
};

const FILE_LIMIT: u64 = 256 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 2 * 1024 * 1024 * 1024;
fn supported(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp"
    )
}
pub fn natural_key(value: &str) -> String {
    let mut key = String::new();
    let mut digits = String::new();
    for c in value.to_lowercase().chars().chain(std::iter::once('\0')) {
        if c.is_ascii_digit() {
            digits.push(c);
        } else {
            if !digits.is_empty() {
                let n = digits.trim_start_matches('0');
                key.push_str(&format!("{:08}{}", n.len(), n));
                digits.clear();
            }
            key.push(c);
        }
    }
    key
}
pub fn decode(bytes: &[u8]) -> Result<image::DynamicImage> {
    let mut reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(30_000);
    limits.max_image_height = Some(30_000);
    limits.max_alloc = Some(400_000_000);
    reader.limits(limits);
    let image = reader.decode().context("Cannot decode page image")?;
    if image.width() as u64 * image.height() as u64 > 100_000_000 {
        bail!("Page exceeds 100 megapixels");
    }
    Ok(image)
}
fn page(session: &Session, name: &str, bytes: &[u8]) -> Result<Page> {
    let image = decode(bytes)?;
    Ok(Page {
        id: id(),
        label: name.into(),
        blob: session.put_blob(bytes)?,
        width: image.width(),
        height: image.height(),
        layers: vec![],
    })
}
pub fn import(session: &mut Session, paths: &[PathBuf], base: u64) -> Result<usize> {
    if session.project.revision != base {
        bail!("Stale project revision");
    }
    let mut inputs = vec![];
    for path in paths {
        if fs::symlink_metadata(path)?.file_type().is_symlink() {
            bail!("Symbolic links cannot be imported");
        }
        if path.is_dir() {
            for entry in walkdir::WalkDir::new(path)
                .follow_links(false)
                .max_depth(32)
            {
                let entry = entry?;
                if entry.file_type().is_file() && supported(entry.path()) {
                    inputs.push(entry.path().to_path_buf());
                }
            }
        } else {
            inputs.push(path.clone());
        }
    }
    inputs.sort_by_key(|p| natural_key(&p.to_string_lossy()));
    let mut next = session.project.clone();
    let initial = next.pages.len();
    let mut total = 0u64;
    for path in inputs {
        if next.pages.len() >= 2000 {
            bail!("Projects are limited to 2,000 pages");
        }
        if fs::metadata(&path)?.len() > FILE_LIMIT {
            bail!("Import exceeds the 256 MiB file limit");
        }
        let ext = path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext == "zip" || ext == "cbz" {
            let mut archive = zip::ZipArchive::new(fs::File::open(&path)?)?;
            if archive.len() > 10_000 {
                bail!("Archive contains too many entries");
            }
            let mut entries = vec![];
            for i in 0..archive.len() {
                let file = archive.by_index(i)?;
                if file.enclosed_name().is_none()
                    || file.name().contains('\\')
                    || file.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
                {
                    bail!("Archive contains an unsafe path or link");
                }
                if !file.is_dir() && supported(Path::new(file.name())) {
                    entries.push((i, file.name().to_string()));
                }
            }
            entries.sort_by_key(|(_, name)| natural_key(name));
            for (i, name) in entries {
                let mut entry = archive.by_index(i)?;
                if entry.size() > FILE_LIMIT {
                    bail!("Archive image exceeds the file limit");
                }
                total = total
                    .checked_add(entry.size())
                    .context("Archive size overflow")?;
                if total > TOTAL_LIMIT || next.pages.len() >= 2000 {
                    bail!("Import exceeds the project budget");
                }
                let mut bytes = vec![];
                (&mut entry).take(FILE_LIMIT + 1).read_to_end(&mut bytes)?;
                if bytes.len() as u64 > FILE_LIMIT {
                    bail!("Archive expands beyond its declared size");
                }
                next.pages.push(page(session, &name, &bytes)?);
            }
        } else if ext == "rar" {
            let mut archive = unrar_ng::Archive::new(&path)
                .open_for_processing()
                .context("Cannot open RAR archive")?;
            let mut rar_pages = vec![];
            let mut entries = 0;
            while let Some(entry) = archive.read_header().context("Cannot read RAR header")? {
                entries += 1;
                if entries > 10_000 {
                    bail!("RAR archive contains too many entries");
                }
                let filename = entry.entry().filename.clone();
                if filename.is_absolute()
                    || filename
                        .components()
                        .any(|c| !matches!(c, std::path::Component::Normal(_)))
                    || filename.to_string_lossy().contains('\\')
                {
                    bail!("RAR contains an unsafe entry path");
                }
                if entry.entry().is_encrypted() || entry.entry().is_split() {
                    bail!("Encrypted or split RAR archives are not supported");
                }
                if entry.entry().is_file() && supported(&filename) {
                    let size = entry.entry().unpacked_size;
                    if size > FILE_LIMIT || next.pages.len() + rar_pages.len() >= 2000 {
                        bail!("RAR image exceeds the project limit");
                    }
                    total = total.checked_add(size).context("RAR size overflow")?;
                    if total > TOTAL_LIMIT {
                        bail!("RAR expands beyond the project budget");
                    }
                    let (bytes, rest) = entry.read().context("Cannot decode RAR image")?;
                    if bytes.len() as u64 > FILE_LIMIT {
                        bail!("RAR image expands beyond its declared size");
                    }
                    rar_pages.push(page(session, &filename.to_string_lossy(), &bytes)?);
                    archive = rest;
                } else {
                    archive = entry.skip().context("Cannot skip RAR entry")?;
                }
            }
            rar_pages.sort_by_key(|p| natural_key(&p.label));
            next.pages.extend(rar_pages);
        } else if ext == "pdf" {
            use hayro::{
                hayro_interpret::InterpreterSettings, hayro_syntax::Pdf, PixmapSettings,
                RenderCache, RenderSettings,
            };
            let pdf = Pdf::new(fs::read(&path)?)
                .map_err(|e| anyhow::anyhow!("Cannot open PDF: {e:?}"))?;
            if pdf.pages().len() + next.pages.len() > 2000 {
                bail!("PDF exceeds the project page limit");
            }
            let cache = RenderCache::new();
            let interpreter = InterpreterSettings::default();
            let settings = PixmapSettings {
                x_scale: 300. / 72.,
                y_scale: 300. / 72.,
                bg_color: hayro::vello_cpu::color::palette::css::WHITE,
            };
            for (index, pdf_page) in pdf.pages().iter().enumerate() {
                let (width, height) = pdf_page.render_dimensions();
                let w = width * settings.x_scale;
                let h = height * settings.y_scale;
                if !w.is_finite()
                    || !h.is_finite()
                    || w < 1.
                    || h < 1.
                    || w > 30_000.
                    || h > 30_000.
                    || w as f64 * h as f64 > 100_000_000.
                {
                    bail!("PDF page exceeds the render budget");
                }
                let rendered = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    hayro::render(
                        pdf_page,
                        &cache,
                        &interpreter,
                        &RenderSettings::default(),
                        &settings,
                    )
                }))
                .map_err(|_| anyhow::anyhow!("The PDF page could not be rendered safely"))?;
                let png = rendered.into_png().context("Cannot encode PDF page")?;
                total += png.len() as u64;
                if total > TOTAL_LIMIT {
                    bail!("Rendered PDF exceeds the project budget");
                }
                next.pages.push(page(
                    session,
                    &format!(
                        "{}-{:04}.png",
                        path.file_stem().unwrap_or_default().to_string_lossy(),
                        index + 1
                    ),
                    &png,
                )?);
            }
        } else if supported(&path) {
            let bytes = fs::read(&path)?;
            total += bytes.len() as u64;
            if total > TOTAL_LIMIT {
                bail!("Import exceeds 2 GiB");
            }
            next.pages.push(page(
                session,
                &path.file_name().unwrap_or_default().to_string_lossy(),
                &bytes,
            )?);
        } else {
            bail!("Unsupported import: {}", path.display());
        }
    }
    let count = next.pages.len() - initial;
    if count == 0 {
        bail!("No supported pages found");
    }
    session.commit(next, base)?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn numeric_order() {
        assert!(natural_key("page2.png") < natural_key("page10.png"));
    }
    #[test]
    fn pdf_pages_render_at_300_dpi_in_document_order() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("chapter.pdf");
        let red = "1 0 0 rg 0 0 72 144 re f";
        let blue = "0 0 1 rg 0 0 72 144 re f";
        let objects=vec!["<< /Type /Catalog /Pages 2 0 R >>".to_string(),"<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>".into(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 144] /Resources << >> /Contents 4 0 R >>".into(),format!("<< /Length {} >>\nstream\n{}\nendstream",red.len(),red),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 144] /Resources << >> /Contents 6 0 R >>".into(),format!("<< /Length {} >>\nstream\n{}\nendstream",blue.len(),blue)];
        let mut pdf = String::from("%PDF-1.4\n");
        let mut offsets = vec![0];
        for (index, object) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            pdf.push_str(&format!("{} 0 obj\n{}\nendobj\n", index + 1, object));
        }
        let start = pdf.len();
        pdf.push_str(&format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len()));
        for offset in offsets.iter().skip(1) {
            pdf.push_str(&format!("{offset:010} 00000 n \n"));
        }
        pdf.push_str(&format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF",
            offsets.len()
        ));
        fs::write(&path, pdf).unwrap();
        let mut session = Session::create(
            root.path().join("test.tatakaiproj"),
            crate::scene::Project::new("PDF".into(), Default::default()),
        )
        .unwrap();
        import(&mut session, &[path], 0).unwrap();
        assert_eq!(session.project.pages.len(), 2);
        for (index, expected) in [[255, 0, 0, 255], [0, 0, 255, 255]].into_iter().enumerate() {
            let page = &session.project.pages[index];
            assert_eq!((page.width, page.height), (300, 600));
            assert_eq!(
                crate::render::composite(&session, page)
                    .unwrap()
                    .get_pixel(150, 300)
                    .0,
                expected
            );
        }
    }
    #[test]
    fn stored_rar_image_import() {
        fn crc(data: &[u8]) -> u32 {
            let mut c = 0xffffffffu32;
            for byte in data {
                c ^= *byte as u32;
                for _ in 0..8 {
                    c = (c >> 1) ^ if c & 1 != 0 { 0xedb88320 } else { 0 };
                }
            }
            !c
        }
        fn block(kind: u8, flags: u16, body: &[u8]) -> Vec<u8> {
            let mut bytes = vec![kind];
            bytes.extend(flags.to_le_bytes());
            bytes.extend(((body.len() + 7) as u16).to_le_bytes());
            bytes.extend(body);
            let mut out = (crc(&bytes) as u16).to_le_bytes().to_vec();
            out.extend(bytes);
            out
        }
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("chapter.rar");
        let image = crate::render::png(&image::RgbaImage::new(16, 16)).unwrap();
        let name = b"page2.png";
        let mut file = Vec::new();
        file.extend((image.len() as u32).to_le_bytes());
        file.extend((image.len() as u32).to_le_bytes());
        file.push(2);
        file.extend(crc(&image).to_le_bytes());
        file.extend(0u32.to_le_bytes());
        file.push(20);
        file.push(0x30);
        file.extend((name.len() as u16).to_le_bytes());
        file.extend(0x20u32.to_le_bytes());
        file.extend(name);
        let mut rar = b"Rar!\x1a\x07\x00".to_vec();
        rar.extend(block(0x73, 0, &[0; 6]));
        rar.extend(block(0x74, 0x8000, &file));
        rar.extend(image);
        rar.extend(block(0x7b, 0, &[]));
        fs::write(&path, rar).unwrap();
        let mut session = Session::create(
            root.path().join("test.tatakaiproj"),
            crate::scene::Project::new("RAR".into(), Default::default()),
        )
        .unwrap();
        import(&mut session, &[path], 0).unwrap();
        assert_eq!(session.project.pages[0].label, "page2.png");
    }
    #[test]
    fn valid_cbz_import_uses_natural_page_order() {
        use std::io::Write;
        let root = tempfile::tempdir().unwrap();
        let archive_path = root.path().join("chapter.cbz");
        let bytes = crate::render::png(&image::RgbaImage::new(16, 16)).unwrap();
        let mut zip = zip::ZipWriter::new(fs::File::create(&archive_path).unwrap());
        for name in ["page10.png", "page2.png"] {
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(&bytes).unwrap();
        }
        zip.finish().unwrap();
        let mut session = Session::create(
            root.path().join("test.tatakaiproj"),
            crate::scene::Project::new("Test".into(), Default::default()),
        )
        .unwrap();
        import(&mut session, &[archive_path], 0).unwrap();
        assert_eq!(session.project.pages[0].label, "page2.png");
        assert_eq!(session.project.pages[1].label, "page10.png");
    }
    #[test]
    fn import_owns_source() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("page.png");
        image::RgbaImage::new(16, 16).save(&source).unwrap();
        let mut session = Session::create(
            root.path().join("test.tatakaiproj"),
            crate::scene::Project::new("Test".into(), Default::default()),
        )
        .unwrap();
        import(&mut session, &[source.clone()], 0).unwrap();
        fs::remove_file(source).unwrap();
        assert!(session.blob(&session.project.pages[0].blob).is_ok());
        session.history(false, 1).unwrap();
        assert!(session.project.pages.is_empty());
    }
    #[test]
    fn archive_traversal_is_rejected_without_committing() {
        use std::io::Write;
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("bad.cbz");
        let mut archive = zip::ZipWriter::new(fs::File::create(&path).unwrap());
        archive
            .start_file("../page.png", zip::write::SimpleFileOptions::default())
            .unwrap();
        archive.write_all(b"bad").unwrap();
        archive.finish().unwrap();
        let mut session = Session::create(
            root.path().join("test.tatakaiproj"),
            crate::scene::Project::new("Test".into(), Default::default()),
        )
        .unwrap();
        assert!(import(&mut session, &[path], 0).is_err());
        assert_eq!(session.project.revision, 0);
    }
}
