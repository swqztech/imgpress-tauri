use crate::compress::{is_image_path, write_image};
use image::imageops::FilterType;
use image::{DynamicImage, Rgba, RgbaImage};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeOptions {
    pub direction: String,
    pub columns: Option<u32>,
    pub gap: i32,
    pub cell_max_edge: i32,
    pub background: String,
    pub format: String,
    pub quality: i32,
    pub output_dir: Option<String>,
    pub file_name: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub output_path: String,
    pub bytes: u64,
    pub width: u32,
    pub height: u32,
    pub count: usize,
    pub format: String,
}

struct Prepared {
    img: DynamicImage,
    width: u32,
    height: u32,
}

fn prepare_one(path: &str, cell_max_edge: i32) -> Result<Prepared, String> {
    if !Path::new(path).exists() || !is_image_path(path) {
        return Err(format!("无效图片：{}", path));
    }
    let max_edge = if cell_max_edge > 0 {
        cell_max_edge as u32
    } else {
        2048
    };
    let img = image::open(path).map_err(|e| e.to_string())?;
    let (w, h) = (img.width(), img.height());
    let max_dim = w.max(h);
    let resized = if max_dim > max_edge {
        let ratio = max_edge as f32 / max_dim as f32;
        let nw = (w as f32 * ratio).round().max(1.0) as u32;
        let nh = (h as f32 * ratio).round().max(1.0) as u32;
        img.resize(nw, nh, FilterType::Lanczos3)
    } else {
        img
    };
    let width = resized.width();
    let height = resized.height();
    Ok(Prepared {
        img: resized,
        width,
        height,
    })
}

fn parse_bg(color: &str) -> Rgba<u8> {
    let c = color.trim();
    if c.eq_ignore_ascii_case("transparent") {
        return Rgba([0, 0, 0, 0]);
    }
    let hex = c.trim_start_matches('#');
    if hex.len() == 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&hex[0..2], 16),
            u8::from_str_radix(&hex[2..4], 16),
            u8::from_str_radix(&hex[4..6], 16),
        ) {
            return Rgba([r, g, b, 255]);
        }
    }
    Rgba([255, 255, 255, 255])
}

struct LayoutPos {
    left: u32,
    top: u32,
    item: Prepared,
}

fn layout(
    items: Vec<Prepared>,
    direction: &str,
    columns: u32,
    gap: u32,
) -> (u32, u32, Vec<LayoutPos>) {
    if direction == "horizontal" {
        let height = items.iter().map(|i| i.height).max().unwrap_or(0);
        let mut left = 0u32;
        let mut positions = Vec::new();
        for item in items {
            let w = item.width;
            let top = (height - item.height) / 2;
            positions.push(LayoutPos { left, top, item });
            left += w + gap;
        }
        let width = if left > gap { left - gap } else { 0 };
        return (width, height, positions);
    }

    if direction == "vertical" {
        let width = items.iter().map(|i| i.width).max().unwrap_or(0);
        let mut top = 0u32;
        let mut positions = Vec::new();
        for item in items {
            let h = item.height;
            let left = (width - item.width) / 2;
            positions.push(LayoutPos { left, top, item });
            top += h + gap;
        }
        let height = if top > gap { top - gap } else { 0 };
        return (width, height, positions);
    }

    let cols = columns.max(1);
    let cell_w = items.iter().map(|i| i.width).max().unwrap_or(0);
    let cell_h = items.iter().map(|i| i.height).max().unwrap_or(0);
    let rows = (items.len() + cols as usize - 1) / cols as usize;
    let width = cols * cell_w + gap * (cols - 1);
    let height = rows as u32 * cell_h + gap * (rows as u32 - 1);
    let positions = items
        .into_iter()
        .enumerate()
        .map(|(index, item)| {
            let col = (index as u32) % cols;
            let row = (index as u32) / cols;
            let left = col * (cell_w + gap) + (cell_w - item.width) / 2;
            let top = row * (cell_h + gap) + (cell_h - item.height) / 2;
            LayoutPos { left, top, item }
        })
        .collect();
    (width, height, positions)
}

pub fn merge_images(paths: Vec<String>, options: MergeOptions) -> Result<MergeResult, String> {
    if paths.len() < 2 {
        return Err("至少选择 2 张图片才能合成".into());
    }

    let prepared: Vec<Prepared> = paths
        .iter()
        .map(|p| prepare_one(p, options.cell_max_edge))
        .collect::<Result<Vec<_>, _>>()?;

    let cols = if options.direction == "grid" {
        options
            .columns
            .unwrap_or((prepared.len() as f64).sqrt().ceil() as u32)
            .max(1)
    } else {
        1
    };
    let gap = options.gap.max(0) as u32;
    let (width, height, positions) = layout(prepared, &options.direction, cols, gap);

    if width == 0 || height == 0 {
        return Err("合成尺寸无效".into());
    }

    let bg = parse_bg(&options.background);
    let mut canvas = RgbaImage::from_pixel(width, height, bg);

    for p in positions {
        image::imageops::overlay(
            &mut canvas,
            &p.item.img.to_rgba8(),
            p.left as i64,
            p.top as i64,
        );
    }

    let format = if options.format.is_empty() {
        "png"
    } else {
        options.format.as_str()
    };
    let quality = options.quality.clamp(1, 100) as u8;

    let first = PathBuf::from(&paths[0]);
    let out_dir = options
        .output_dir
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| first.parent().unwrap_or(Path::new(".")).join("merged"));
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let stamp = chrono_lite_stamp();
    let ext = if format == "jpeg" { "jpg" } else { format };
    let default_name = format!("merge-{}", stamp);
    let base = options
        .file_name
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&default_name)
        .replace(|c: char| c == '.' || c == '/', "_");
    let base = base
        .trim_end_matches(".png")
        .trim_end_matches(".jpg")
        .trim_end_matches(".jpeg")
        .trim_end_matches(".webp");
    let output_path = out_dir.join(format!("{}.{}", base, ext));

    let dyn_img = DynamicImage::ImageRgba8(canvas);
    let (_, _, bytes) = write_image(&dyn_img, format, quality, &output_path)?;

    Ok(MergeResult {
        output_path: output_path.to_string_lossy().to_string(),
        bytes,
        width,
        height,
        count: paths.len(),
        format: format.to_string(),
    })
}

fn chrono_lite_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", secs)
}
