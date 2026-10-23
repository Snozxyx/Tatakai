use crate::{
    scene::{id, Content, Layer},
    storage::Session,
};
use anyhow::{bail, Context, Result};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stroke {
    pub revision: u64,
    pub page_id: String,
    pub layer_id: Option<String>,
    pub mode: String,
    pub diameter: f32,
    pub color: [u8; 4],
    pub points: Vec<[f32; 2]>,
}
pub fn stroke(session: &mut Session, stroke: Stroke) -> Result<()> {
    if stroke.revision != session.project.revision {
        bail!("Stale project revision");
    }
    if !["brush", "eraser"].contains(&stroke.mode.as_str())
        || !stroke.diameter.is_finite()
        || !(1. ..=300.).contains(&stroke.diameter)
        || stroke.points.is_empty()
        || stroke.points.len() > 100_000
        || !stroke
            .points
            .iter()
            .flatten()
            .all(|v| v.is_finite() && v.abs() < 100_000.)
    {
        bail!("Invalid brush stroke");
    }
    let mut next = session.project.clone();
    let page = next
        .pages
        .iter_mut()
        .find(|p| p.id == stroke.page_id)
        .context("Page not found")?;
    let layer_index = stroke.layer_id.as_ref().and_then(|id| {
        page.layers
            .iter()
            .position(|l| &l.id == id && matches!(l.content, Content::Raster { .. }))
    });
    if stroke.mode == "eraser" && layer_index.is_none() {
        bail!("Select an artwork layer before erasing");
    }
    let (mut bitmap, geometry) = if let Some(index) = layer_index {
        let layer = &page.layers[index];
        let Content::Raster { blob } = &layer.content else {
            unreachable!()
        };
        (
            crate::import::decode(&session.blob(blob)?)?.into_rgba8(),
            [layer.x, layer.y, layer.width, layer.height, layer.rotation],
        )
    } else {
        (
            image::RgbaImage::new(page.width, page.height),
            [0., 0., page.width as f32, page.height as f32, 0.],
        )
    };
    let (s, c) = geometry[4].to_radians().sin_cos();
    let cx = geometry[0] + geometry[2] / 2.;
    let cy = geometry[1] + geometry[3] / 2.;
    let transform = |p: [f32; 2]| {
        let dx = p[0] - cx;
        let dy = p[1] - cy;
        [
            (c * dx + s * dy + geometry[2] / 2.) * bitmap.width() as f32 / geometry[2],
            (-s * dx + c * dy + geometry[3] / 2.) * bitmap.height() as f32 / geometry[3],
        ]
    };
    let points: Vec<_> = stroke.points.into_iter().map(transform).collect();
    let radius = stroke.diameter / 2. * bitmap.width() as f32 / geometry[2];
    let mut work = 0u64;
    for segment in points
        .windows(2)
        .map(|v| (v[0], v[1]))
        .chain(std::iter::once((points[0], points[0])))
    {
        let (a, b) = segment;
        let x0 = (a[0].min(b[0]) - radius - 1.).max(0.) as u32;
        let x1 = (a[0].max(b[0]) + radius + 1.).min(bitmap.width() as f32) as u32;
        let y0 = (a[1].min(b[1]) - radius - 1.).max(0.) as u32;
        let y1 = (a[1].max(b[1]) + radius + 1.).min(bitmap.height() as f32) as u32;
        work = work.saturating_add(x1.saturating_sub(x0) as u64 * y1.saturating_sub(y0) as u64);
        if work > 200_000_000 {
            bail!("Stroke is too large; use shorter strokes");
        }
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        let len = dx * dx + dy * dy;
        for y in y0..y1 {
            for x in x0..x1 {
                let px = x as f32 + 0.5;
                let py = y as f32 + 0.5;
                let t = if len == 0. {
                    0.
                } else {
                    ((px - a[0]) * dx + (py - a[1]) * dy) / len
                }
                .clamp(0., 1.);
                let distance = ((px - a[0] - t * dx).powi(2) + (py - a[1] - t * dy).powi(2)).sqrt();
                let coverage = (radius + 0.5 - distance).clamp(0., 1.);
                if coverage == 0. {
                    continue;
                }
                let pixel = bitmap.get_pixel_mut(x, y);
                if stroke.mode == "eraser" {
                    pixel[3] = (pixel[3] as f32 * (1. - coverage)).round() as u8;
                } else {
                    let alpha = stroke.color[3] as f32 / 255. * coverage;
                    let old = pixel[3] as f32 / 255.;
                    let out = alpha + old * (1. - alpha);
                    if out > 0. {
                        for channel in 0..3 {
                            pixel[channel] = ((stroke.color[channel] as f32 * alpha
                                + pixel[channel] as f32 * old * (1. - alpha))
                                / out)
                                .round() as u8;
                        }
                        pixel[3] = (out * 255.).round() as u8;
                    }
                }
            }
        }
    }
    let blob = session.put_blob(&crate::render::png(&bitmap)?)?;
    if let Some(index) = layer_index {
        page.layers[index].content = Content::Raster { blob };
        if let Some(cleanup) = &mut page.layers[index].cleanup {
            cleanup.edited = Some(true);
        }
    } else {
        page.layers.push(Layer {
            cleanup: None,
            source_region: None,
            id: id(),
            name: "Paint".into(),
            visible: true,
            opacity: 1.,
            x: 0.,
            y: 0.,
            width: page.width as f32,
            height: page.height as f32,
            rotation: 0.,
            content: Content::Raster { blob },
        });
    }
    session.commit(next, stroke.revision)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manual_cleanup_corrections_are_marked_and_undoable() {
        let root = tempfile::tempdir().unwrap();
        let mut s = Session::create(
            root.path().join("cleanup.tatakaiproj"),
            crate::scene::Project::new("Cleanup".into(), Default::default()),
        )
        .unwrap();
        let path = root.path().join("page.png");
        image::RgbaImage::new(20, 20).save(&path).unwrap();
        crate::import::import(&mut s, &[path], 0).unwrap();
        let mut next = s.project.clone();
        let page = &mut next.pages[0];
        let mut layer = crate::cleanup::layer(page, page.blob.clone());
        let id = layer.id.clone();
        layer.cleanup = Some(crate::scene::CleanupRecord {
            edited: None,
            mask: page.blob.clone(),
            source_blob: page.blob.clone(),
            method: "edge-fill".into(),
            runtime: "native-cpu".into(),
        });
        page.layers.push(layer);
        s.commit(next, 1).unwrap();
        let page_id = s.project.pages[0].id.clone();
        stroke(
            &mut s,
            Stroke {
                revision: 2,
                page_id,
                layer_id: Some(id),
                mode: "brush".into(),
                diameter: 4.,
                color: [255, 0, 0, 255],
                points: vec![[10., 10.]],
            },
        )
        .unwrap();
        assert_eq!(
            s.project.pages[0].layers[0]
                .cleanup
                .as_ref()
                .unwrap()
                .edited,
            Some(true)
        );
        s.history(false, 3).unwrap();
        assert_eq!(
            s.project.pages[0].layers[0]
                .cleanup
                .as_ref()
                .unwrap()
                .edited,
            None
        );
    }
    #[test]
    fn paint_erase_undo() {
        let root = tempfile::tempdir().unwrap();
        let mut s = Session::create(
            root.path().join("test.tatakaiproj"),
            crate::scene::Project::new("Test".into(), Default::default()),
        )
        .unwrap();
        let path = root.path().join("page.png");
        image::RgbaImage::new(20, 20).save(&path).unwrap();
        crate::import::import(&mut s, &[path], 0).unwrap();
        let page = s.project.pages[0].id.clone();
        let make = |revision, layer_id, mode: &str| Stroke {
            revision,
            page_id: page.clone(),
            layer_id,
            mode: mode.into(),
            diameter: 8.,
            color: [255, 0, 0, 255],
            points: vec![[10., 10.]],
        };
        stroke(&mut s, make(1, None, "brush")).unwrap();
        let layer = s.project.pages[0].layers[0].id.clone();
        assert_eq!(
            crate::render::composite(&s, &s.project.pages[0])
                .unwrap()
                .get_pixel(10, 10)
                .0,
            [255, 0, 0, 255]
        );
        stroke(&mut s, make(2, Some(layer), "eraser")).unwrap();
        assert_eq!(
            crate::render::composite(&s, &s.project.pages[0])
                .unwrap()
                .get_pixel(10, 10)[3],
            0
        );
        s.history(false, 3).unwrap();
        assert_eq!(
            crate::render::composite(&s, &s.project.pages[0])
                .unwrap()
                .get_pixel(10, 10)[3],
            255
        );
    }
}
