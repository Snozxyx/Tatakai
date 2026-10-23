//! Independent, mask-limited cleanup. Diffusion follows the pinned sd.cpp native
//! async API documented at a77d3623180b2bc1886f3dd04c0aa04156a987ef.
use crate::scene::{Content, Layer, Page};
use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{GrayImage, Luma, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::Read,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    pub mode: String,
    pub endpoint: String,
    pub steps: u32,
    pub strength: f32,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            mode: "edge-fill".into(),
            endpoint: "http://127.0.0.1:1234".into(),
            steps: 20,
            strength: 0.9,
        }
    }
}
pub fn validate(options: &Options) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(&options.endpoint)?;
    if !["edge-fill", "diffusion"].contains(&options.mode.as_str())
        || !(1..=100).contains(&options.steps)
        || !options.strength.is_finite()
        || !(0.1..=1.).contains(&options.strength)
    {
        bail!("Invalid cleanup settings");
    }
    if url.scheme() != "http"
        || ![Some("127.0.0.1"), Some("[::1]")].contains(&url.host_str())
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        bail!("Diffusion cleanup requires a local runtime address such as http://127.0.0.1:1234");
    }
    Ok(url)
}
fn stopped(cancel: &AtomicBool) -> Result<()> {
    if cancel.load(Ordering::SeqCst) {
        bail!("Cleanup stopped; completed stages were preserved");
    }
    Ok(())
}
fn json_response(response: reqwest::blocking::Response) -> Result<Value> {
    if !response.status().is_success() {
        bail!("Local diffusion runtime returned HTTP {}. Check that a compatible inpainting model is loaded.",response.status());
    }
    let mut bytes = vec![];
    response
        .take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 32 * 1024 * 1024 {
        bail!("Diffusion response exceeds its size limit");
    }
    Ok(serde_json::from_slice(&bytes).context("Local diffusion runtime returned invalid JSON")?)
}
fn diffusion(
    options: &Options,
    input: &RgbaImage,
    mask: &GrayImage,
    cancel: &AtomicBool,
) -> Result<RgbaImage> {
    let base = validate(options)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()?;
    let encoded_mask =
        crate::render::png(&image::DynamicImage::ImageLuma8(mask.clone()).into_rgba8())?;
    let job=json_response(client.post(base.join("sdcpp/v1/img_gen")?).json(&json!({
        "prompt":"Remove all lettering and text inside the mask. Restore the original comic background, matching the surrounding line art, screentones and colors. Keep unmasked artwork unchanged. No text, symbols, watermark or new objects.",
        "init_image":STANDARD.encode(crate::render::png(input)?),"mask_image":STANDARD.encode(encoded_mask),
        "width":input.width(),"height":input.height(),"strength":options.strength,"batch_count":1,"seed":42,"output_format":"png",
        "sample_params":{"sample_steps":options.steps},"vae_tiling_params":{"enabled":true}
    })).send().context("Cannot reach the local diffusion runtime. Start stable-diffusion.cpp sd-server with an inpainting model, or choose flat-background cleanup.")?)?;
    let id = job["id"]
        .as_str()
        .context("The diffusion runtime did not return a job ID")?;
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        bail!("Invalid diffusion job ID");
    }
    let job_url = base.join(&format!("sdcpp/v1/jobs/{id}"))?;
    let result = (|| -> Result<RgbaImage> {
        let deadline = Instant::now() + Duration::from_secs(900);
        loop {
            stopped(cancel)?;
            if Instant::now() > deadline {
                bail!("Diffusion cleanup timed out. Reduce the model size or sampling steps.");
            }
            let state = json_response(
                client
                    .get(job_url.clone())
                    .send()
                    .context("Lost connection to the local diffusion runtime")?,
            )?;
            match state["status"].as_str() {
                Some("completed")=>{
                    let encoded=state["result"]["images"][0]["b64_json"].as_str().context("Diffusion returned no image")?;
                    let bytes=STANDARD.decode(encoded).context("Diffusion returned an invalid image encoding")?;
                    let bitmap=crate::import::decode(&bytes)?.into_rgba8();
                    if bitmap.dimensions()!=input.dimensions() {bail!("Diffusion output dimensions changed; no cleanup was applied");}
                    return Ok(bitmap);
                },
                Some("failed")=>bail!("The local diffusion job failed. Check model compatibility and available memory."),
                Some("cancelled")=>bail!("The local diffusion job was cancelled"),
                Some("queued"|"generating")=>{},
                _=>bail!("Unknown diffusion job state"),
            }
            for _ in 0..5 {
                stopped(cancel)?;
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    })();
    if result.is_err() {
        let _ = client
            .post(base.join(&format!("sdcpp/v1/jobs/{id}/cancel"))?)
            .json(&json!({}))
            .send();
    }
    result
}

pub fn mask(original: &RgbaImage, page: &Page, ids: &[String]) -> Result<(GrayImage, RgbaImage)> {
    if original.width() as u64 * original.height() as u64 > 32_000_000 {
        bail!("Cleanup is limited to 32 megapixels per page; split long pages before cleanup");
    }
    let mut mask = GrayImage::new(original.width(), original.height());
    let mut fill = RgbaImage::new(original.width(), original.height());
    let mut regions = 0;
    let mut work = 0u64;
    for layer in &page.layers {
        if !matches!(&layer.content,Content::Text{source,..} if !source.trim().is_empty())
            || (!ids.is_empty() && !ids.contains(&layer.id))
        {
            continue;
        }
        regions += 1;
        let region = crate::vision::source_rect(layer);
        let x0 = region.x.floor().max(0.) as u32;
        let y0 = region.y.floor().max(0.) as u32;
        let x1 = (region.x + region.width)
            .ceil()
            .clamp(0., original.width() as f32) as u32;
        let y1 = (region.y + region.height)
            .ceil()
            .clamp(0., original.height() as f32) as u32;
        if x1 <= x0 + 2 || y1 <= y0 + 2 {
            continue;
        }
        work += (x1 - x0) as u64 * (y1 - y0) as u64;
        if work > 100_000_000 {
            bail!("Text regions exceed the cleanup work budget; process fewer selected layers");
        }
        let mut border: Vec<[u8; 4]> = vec![];
        for x in x0..x1 {
            border.push(original[(x, y0)].0);
            border.push(original[(x, y1 - 1)].0);
        }
        for y in y0..y1 {
            border.push(original[(x0, y)].0);
            border.push(original[(x1 - 1, y)].0);
        }
        let mut color = [255u8; 4];
        for channel in 0..3 {
            let mut values: Vec<_> = border.iter().map(|p| p[channel]).collect();
            values.sort_unstable();
            color[channel] = values[values.len() / 2];
        }
        for y in y0..y1 {
            for x in x0..x1 {
                let pixel = original[(x, y)];
                if (0..3).any(|c| pixel[c].abs_diff(color[c]) > 32) {
                    // Include antialiased glyph edges, clipped to the selected region.
                    for py in y.saturating_sub(2).max(y0)..=(y + 2).min(y1 - 1) {
                        for px in x.saturating_sub(2).max(x0)..=(x + 2).min(x1 - 1) {
                            mask[(px, py)] = Luma([255]);
                            fill[(px, py)] = Rgba(color);
                        }
                    }
                }
            }
        }
    }
    if regions == 0 {
        bail!("Cleanup needs detected or transcribed text regions. Run Detection and OCR first.");
    }
    Ok((mask, fill))
}
#[cfg(test)]
pub fn clean(
    original: &RgbaImage,
    page: &Page,
    ids: &[String],
    options: &Options,
    cancel: &AtomicBool,
) -> Result<(RgbaImage, GrayImage)> {
    validate(options)?;
    stopped(cancel)?;
    let (mask, output) = mask(original, page, ids)?;
    clean_prepared(original, mask, output, options, cancel)
}
pub fn clean_prepared(
    original: &RgbaImage,
    mask: GrayImage,
    mut output: RgbaImage,
    options: &Options,
    cancel: &AtomicBool,
) -> Result<(RgbaImage, GrayImage)> {
    validate(options)?;
    stopped(cancel)?;
    if options.mode == "edge-fill" {
        interpolate_background(original, &mask, &mut output, cancel)?;
    } else if options.mode == "diffusion" {
        // Tile with context so long manhwa pages do not exceed model dimensions.
        for y in (0..original.height()).step_by(768) {
            for x in (0..original.width()).step_by(768) {
                stopped(cancel)?;
                let width = (original.width() - x).min(768);
                let height = (original.height() - y).min(768);
                if !(y..y + height).any(|py| (x..x + width).any(|px| mask[(px, py)][0] > 0)) {
                    continue;
                }
                let left = x.saturating_sub(64);
                let top = y.saturating_sub(64);
                let right = (x + width + 64).min(original.width());
                let bottom = (y + height + 64).min(original.height());
                let w = (right - left).div_ceil(64) * 64;
                let h = (bottom - top).div_ceil(64) * 64;
                let mut input = RgbaImage::from_pixel(w, h, Rgba([255, 255, 255, 255]));
                let mut tile_mask = GrayImage::new(w, h);
                for py in top..bottom {
                    for px in left..right {
                        input[(px - left, py - top)] = original[(px, py)];
                        tile_mask[(px - left, py - top)] = mask[(px, py)];
                    }
                }
                let result = diffusion(options, &input, &tile_mask, cancel)?;
                for py in y..y + height {
                    for px in x..x + width {
                        if mask[(px, py)][0] > 0 {
                            let mut pixel = result[(px - left, py - top)];
                            pixel[3] = 255;
                            output[(px, py)] = pixel;
                        }
                    }
                }
            }
        }
    }
    stopped(cancel)?;
    Ok((output, mask))
}
// CPU interpolation follows local known pixels into the mask instead of
// painting every letter with one median color (which leaves visible blotches).
fn interpolate_background(
    original: &RgbaImage,
    mask: &GrayImage,
    output: &mut RgbaImage,
    cancel: &AtomicBool,
) -> Result<()> {
    let width = original.width() as usize;
    let height = original.height() as usize;
    let mut known: Vec<bool> = mask.as_raw().iter().map(|value| *value == 0).collect();
    let mut queued = vec![false; width * height];
    let mut queue = vec![];
    let neighbors = |x: usize, y: usize| {
        [
            (x.wrapping_sub(1), y),
            (x + 1, y),
            (x, y.wrapping_sub(1)),
            (x, y + 1),
            (x.wrapping_sub(1), y.wrapping_sub(1)),
            (x + 1, y + 1),
            (x + 1, y.wrapping_sub(1)),
            (x.wrapping_sub(1), y + 1),
        ]
    };
    for y in 0..height {
        for x in 0..width {
            let index = y * width + x;
            if known[index] {
                continue;
            }
            if neighbors(x, y)
                .iter()
                .any(|(x, y)| *x < width && *y < height && known[*y * width + *x])
            {
                queue.push(index);
                queued[index] = true;
            }
        }
    }
    let mut cursor = 0;
    while cursor < queue.len() {
        if cursor % 1024 == 0 {
            stopped(cancel)?;
        }
        let index = queue[cursor];
        cursor += 1;
        let x = index % width;
        let y = index / width;
        let mut sum = [0u32; 3];
        let mut count = 0;
        for (nx, ny) in neighbors(x, y) {
            if nx >= width || ny >= height || !known[ny * width + nx] {
                continue;
            }
            let pixel = if mask[(nx as u32, ny as u32)][0] == 0 {
                original[(nx as u32, ny as u32)]
            } else {
                output[(nx as u32, ny as u32)]
            };
            for c in 0..3 {
                sum[c] += pixel[c] as u32;
            }
            count += 1;
        }
        if count > 0 {
            output[(x as u32, y as u32)] = Rgba([
                (sum[0] / count) as u8,
                (sum[1] / count) as u8,
                (sum[2] / count) as u8,
                255,
            ]);
            known[index] = true;
        }
        for (nx, ny) in neighbors(x, y) {
            if nx < width && ny < height && !queued[ny * width + nx] && !known[ny * width + nx] {
                queued[ny * width + nx] = true;
                queue.push(ny * width + nx);
            }
        }
    }
    for _ in 0..4 {
        for (position, index) in queue.iter().enumerate() {
            if position % 1024 == 0 {
                stopped(cancel)?;
            }
            let x = index % width;
            let y = index / width;
            let mut sum = [0u32; 3];
            let mut count = 0;
            for (nx, ny) in neighbors(x, y) {
                if nx >= width || ny >= height {
                    continue;
                }
                let pixel = if mask[(nx as u32, ny as u32)][0] == 0 {
                    original[(nx as u32, ny as u32)]
                } else {
                    output[(nx as u32, ny as u32)]
                };
                for c in 0..3 {
                    sum[c] += pixel[c] as u32;
                }
                count += 1;
            }
            if count > 0 {
                output[(x as u32, y as u32)] = Rgba([
                    (sum[0] / count) as u8,
                    (sum[1] / count) as u8,
                    (sum[2] / count) as u8,
                    255,
                ]);
            }
        }
    }
    Ok(())
}

pub fn layer(page: &Page, blob: String) -> Layer {
    Layer {
        id: crate::scene::id(),
        name: "Cleanup".into(),
        visible: true,
        opacity: 1.,
        x: 0.,
        y: 0.,
        width: page.width as f32,
        height: page.height as f32,
        rotation: 0.,
        cleanup: None,
        source_region: None,
        content: Content::Raster { blob },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn background_fill_follows_a_gradient() {
        let mut original = RgbaImage::from_fn(64, 32, |x, _| Rgba([x as u8, 50, 120, 255]));
        let mut mask = GrayImage::new(64, 32);
        let mut output = RgbaImage::new(64, 32);
        for y in 12..20 {
            for x in 24..32 {
                original[(x, y)] = Rgba([0, 0, 0, 255]);
                mask[(x, y)] = Luma([255]);
            }
        }
        interpolate_background(&original, &mask, &mut output, &AtomicBool::new(false)).unwrap();
        assert!(output[(28, 16)][0].abs_diff(28) < 7);
        assert_eq!(output[(0, 0)][3], 0);
    }
    #[test]
    fn only_masked_text_changes() {
        let mut original = RgbaImage::from_pixel(40, 40, Rgba([255, 255, 255, 255]));
        for y in 10..20 {
            for x in 10..20 {
                original[(x, y)] = Rgba([0, 0, 0, 255]);
            }
        }
        original[(35, 35)] = Rgba([32, 64, 128, 255]);
        let mut layer = layer(
            &Page {
                id: "p".into(),
                label: "p".into(),
                blob: "".into(),
                width: 40,
                height: 40,
                layers: vec![],
            },
            "".into(),
        );
        layer.x = 5.;
        layer.y = 5.;
        layer.width = 20.;
        layer.height = 20.;
        layer.content = Content::Text {
            source: "Text".into(),
            translation: "".into(),
            style: Default::default(),
            source_edited: false,
            translation_edited: false,
        };
        layer.source_region = Some(crate::scene::SourceRegion {
            x: 5.,
            y: 5.,
            width: 20.,
            height: 20.,
        });
        // Typesetting may move away from the original lettering; cleanup must not.
        layer.x = 28.;
        layer.y = 28.;
        let page = Page {
            id: "p".into(),
            label: "p".into(),
            blob: "".into(),
            width: 40,
            height: 40,
            layers: vec![layer],
        };
        let (output, mask) = clean(
            &original,
            &page,
            &[],
            &Options::default(),
            &AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(output[(15, 15)], Rgba([255, 255, 255, 255]));
        assert_eq!(mask[(35, 35)][0], 0);
        assert_eq!(output[(35, 35)][3], 0);
        assert!(clean(
            &original,
            &page,
            &[],
            &Options::default(),
            &AtomicBool::new(true)
        )
        .is_err());
        assert!(validate(&Options {
            endpoint: "https://example.com".into(),
            ..Default::default()
        })
        .is_err());
    }
}
