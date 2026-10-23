use crate::{
    scene::{Content, Page, TextStyle},
    storage::Session,
};
use anyhow::{bail, Result};
use cosmic_text::{
    Align, Attrs, Buffer, Color, Family, FontSystem, Metrics, Shaping, Style, SwashCache, Weight,
    Wrap,
};
use image::{Rgba, RgbaImage};
use std::io::Cursor;

fn blend(dst: &mut Rgba<u8>, src: [u8; 4], opacity: f32) {
    let a = src[3] as f32 / 255. * opacity;
    let da = dst[3] as f32 / 255.;
    let out = a + da * (1. - a);
    if out == 0. {
        return;
    }
    for c in 0..3 {
        dst[c] = ((src[c] as f32 * a + dst[c] as f32 * da * (1. - a)) / out).round() as u8;
    }
    dst[3] = (out * 255.).round() as u8;
}
pub fn png(image: &RgbaImage) -> Result<Vec<u8>> {
    let mut out = Cursor::new(vec![]);
    image.write_to(&mut out, image::ImageFormat::Png)?;
    Ok(out.into_inner())
}
fn text_bitmap(
    width: u32,
    height: u32,
    text: &str,
    style: &TextStyle,
    session: &Session,
) -> Result<RgbaImage> {
    if style.direction == "vertical-rl" {
        bail!(
            "Vertical CJK rendering is not available in this engine build; choose horizontal text"
        );
    }
    let mut fonts = FontSystem::new();
    let mut font_bytes = 0;
    for font in &session.project.fonts {
        let bytes = session.blob(&font.blob)?;
        font_bytes += bytes.len();
        if bytes.len() > 20 * 1024 * 1024 || font_bytes > 80 * 1024 * 1024 {
            bail!("Project fonts exceed their memory budget");
        }
        fonts.db_mut().load_font_data(bytes);
    }
    let padding = (style.stroke_width.ceil() + 2.).min(width.min(height) as f32 / 4.);
    let inner_width = (width as f32 - padding * 2.).max(1.);
    let inner_height = (height as f32 - padding * 2.).max(1.);
    let (buffer, size) = layout_text(&mut fonts, text, style, inner_width, inner_height)?;
    let occupied = buffer.layout_runs().count() as f32 * size * 1.2;
    let offset_y = if style.auto_fit {
        ((inner_height - occupied) / 2.).max(0.)
    } else {
        0.
    };
    let mut cache = SwashCache::new();
    let mut image = RgbaImage::new(width, height);
    let color = Color::rgba(style.fill[0], style.fill[1], style.fill[2], style.fill[3]);
    let mut glyphs = vec![];
    buffer.draw(&mut fonts, &mut cache, color, |x, y, w, h, c| {
        for dy in 0..h {
            for dx in 0..w {
                glyphs.push((
                    x + dx as i32 + padding.round() as i32,
                    y + dy as i32 + (padding + offset_y).round() as i32,
                    c.as_rgba(),
                ));
            }
        }
    });
    let radius = style.stroke_width.ceil() as i32;
    if radius > 0 {
        for (x, y, c) in &glyphs {
            for dy in -radius..=radius {
                for dx in -radius..=radius {
                    if dx * dx + dy * dy > radius * radius {
                        continue;
                    }
                    let (px, py) = (x + dx, y + dy);
                    if px >= 0 && py >= 0 && px < width as i32 && py < height as i32 {
                        let mut stroke = style.stroke;
                        stroke[3] = (stroke[3] as u16 * c[3] as u16 / 255) as u8;
                        blend(image.get_pixel_mut(px as u32, py as u32), stroke, 1.);
                    }
                }
            }
        }
    }
    for (x, y, c) in glyphs {
        if x >= 0 && y >= 0 && x < width as i32 && y < height as i32 {
            blend(image.get_pixel_mut(x as u32, y as u32), c, 1.);
        }
    }
    Ok(image)
}
fn layout_text(
    fonts: &mut FontSystem,
    text: &str,
    style: &TextStyle,
    width: f32,
    height: f32,
) -> Result<(Buffer, f32)> {
    let mut size = style.size;
    let mut buffer = Buffer::new(fonts, Metrics::new(size, size * 1.2));
    // Unicode word boundaries allow CJK wrapping while keeping Latin, Arabic
    // and Indic words intact. An overlong word must shrink, never lose a glyph.
    buffer.set_wrap(fonts, Wrap::Word);
    let directed = if style.direction == "rtl" {
        format!("\u{202b}{text}\u{202c}")
    } else if style.direction == "ltr" {
        format!("\u{202a}{text}\u{202c}")
    } else {
        text.into()
    };
    loop {
        buffer.set_metrics(fonts, Metrics::new(size, size * 1.2));
        buffer.set_size(fonts, Some(width), None);
        let family = match style.family.as_str() {
            "sans-serif" => Family::SansSerif,
            "serif" => Family::Serif,
            "monospace" => Family::Monospace,
            _ => Family::Name(&style.family),
        };
        buffer.set_text(
            fonts,
            &directed,
            &Attrs::new()
                .family(family)
                .weight(Weight(style.weight))
                .style(if style.italic {
                    Style::Italic
                } else {
                    Style::Normal
                }),
            Shaping::Advanced,
        );
        for line in &mut buffer.lines {
            line.set_align(Some(match style.align.as_str() {
                "left" => Align::Left,
                "right" => Align::Right,
                _ => Align::Center,
            }));
        }
        buffer.shape_until_scroll(fonts, false);
        let lines: Vec<_> = buffer.layout_runs().collect();
        let fits = lines.iter().all(|r| r.line_w <= width + 0.5)
            && lines.len() as f32 * size * 1.2 <= height;
        if !style.auto_fit || fits || size <= 5. {
            if style.auto_fit && !fits && !text.trim().is_empty() {
                bail!("Translated text cannot fit this box without clipping. Enlarge the text box or shorten the translation before exporting.");
            }
            return Ok((buffer, size));
        }
        size = (size - 1.).max(5.);
    }
}
pub fn layer_image(session: &Session, layer: &crate::scene::Layer) -> Result<RgbaImage> {
    let w = layer.width.ceil().clamp(1., 30_000.) as u32;
    let h = layer.height.ceil().clamp(1., 30_000.) as u32;
    if w as u64 * h as u64 > 100_000_000 {
        bail!("Layer exceeds render budget");
    }
    match &layer.content {
        Content::Raster { blob } => Ok(image::imageops::resize(
            &crate::import::decode(&session.blob(blob)?)?.into_rgba8(),
            w,
            h,
            image::imageops::FilterType::Lanczos3,
        )),
        Content::Text {
            translation, style, ..
        } => text_bitmap(w, h, translation, style, session),
    }
}
pub fn composite(session: &Session, page: &Page) -> Result<RgbaImage> {
    let mut output = crate::import::decode(&session.blob(&page.blob)?)?.into_rgba8();
    if output.width() != page.width || output.height() != page.height {
        bail!("Page dimensions do not match its original image");
    }
    for layer in &page.layers {
        draw_layer(&mut output, session, layer, 0., 0.)?;
    }
    Ok(output)
}
pub fn draw_layer(
    output: &mut RgbaImage,
    session: &Session,
    layer: &crate::scene::Layer,
    offset_x: f32,
    offset_y: f32,
) -> Result<()> {
    if !layer.visible || layer.opacity == 0. {
        return Ok(());
    }
    let bitmap = layer_image(session, layer)?;
    let angle = layer.rotation.to_radians();
    let (s, c) = angle.sin_cos();
    let cx = layer.x + layer.width / 2. - offset_x;
    let cy = layer.y + layer.height / 2. - offset_y;
    let radius = (layer.width * layer.width + layer.height * layer.height).sqrt() / 2.;
    let x0 = (cx - radius).floor().max(0.) as u32;
    let x1 = (cx + radius).ceil().min(output.width() as f32) as u32;
    let y0 = (cy - radius).floor().max(0.) as u32;
    let y1 = (cy + radius).ceil().min(output.height() as f32) as u32;
    for y in y0..y1 {
        for x in x0..x1 {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let sx = c * dx + s * dy + layer.width / 2.;
            let sy = -s * dx + c * dy + layer.height / 2.;
            if sx >= 0. && sy >= 0. && sx < bitmap.width() as f32 && sy < bitmap.height() as f32 {
                blend(
                    output.get_pixel_mut(x, y),
                    bitmap.get_pixel(sx as u32, sy as u32).0,
                    layer.opacity,
                );
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn long_words_shrink_instead_of_splitting() {
        let mut fonts = FontSystem::new();
        let style = TextStyle {
            size: 40.,
            ..Default::default()
        };
        for text in ["SUBESPACIO", "Hintergrundzeichnung", "transliteration"] {
            let (buffer, size) = layout_text(&mut fonts, text, &style, 100., 100.).unwrap();
            assert_eq!(buffer.layout_runs().count(), 1, "{text} was split");
            assert!(size < style.size);
            assert!(buffer.layout_runs().all(|r| r.line_w <= 100.5));
        }
        assert!(layout_text(&mut fonts, "unbreakableword", &style, 1., 1.).is_err());
    }
    #[test]
    fn unicode_words_and_explicit_lines_survive_fitting() {
        let mut fonts = FontSystem::new();
        let style = TextStyle {
            size: 24.,
            ..Default::default()
        };
        for text in [
            "A natural translated sentence",
            "هذه حقيقة منفصلة",
            "यह एक अलग वास्तविकता है",
        ] {
            let (buffer, _) = layout_text(&mut fonts, text, &style, 100., 180.).unwrap();
            for run in buffer.layout_runs() {
                let end = run.glyphs.iter().map(|g| g.end).max().unwrap_or(0);
                let before = text[..end].chars().next_back();
                let after = text[end..].chars().next();
                assert!(
                    !(before.is_some_and(char::is_alphabetic)
                        && after.is_some_and(char::is_alphabetic)),
                    "split word: {text}"
                );
            }
        }
        let (buffer, _) = layout_text(&mut fonts, "First\nSecond", &style, 200., 100.).unwrap();
        assert_eq!(buffer.layout_runs().count(), 2);
    }
    #[test]
    fn fitted_bitmap_has_stroke_padding_and_vertical_centering() {
        let root = tempfile::tempdir().unwrap();
        let session = Session::create(
            root.path().join("render.tatakaiproj"),
            crate::scene::Project::new("Render".into(), Default::default()),
        )
        .unwrap();
        let style = TextStyle {
            size: 24.,
            stroke_width: 2.,
            ..Default::default()
        };
        let image = text_bitmap(220, 100, "Readable text", &style, &session).unwrap();
        let pixels: Vec<_> = image
            .enumerate_pixels()
            .filter(|(_, _, p)| p[3] > 0)
            .collect();
        assert!(!pixels.is_empty());
        let top = pixels.iter().map(|(_, y, _)| *y).min().unwrap();
        let bottom = pixels.iter().map(|(_, y, _)| *y).max().unwrap();
        assert!(
            top > 20 && bottom < 80,
            "text should be centered: {top}..{bottom}"
        );
        assert!(pixels
            .iter()
            .all(|(x, y, _)| *x > 0 && *x < 219 && *y > 0 && *y < 99));
    }
}
