use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageEncoder};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressOptions {
    pub quality: i32,
    pub max_edge: i32,
    pub format: String,
    pub output_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressResult {
    pub source_path: String,
    pub output_path: String,
    pub before_bytes: u64,
    pub after_bytes: u64,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub saved_ratio: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressBatchResult {
    pub results: Vec<CompressResult>,
    pub errors: Vec<CompressError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompressError {
    pub path: String,
    pub message: String,
}

pub fn is_image_path(path: &str) -> bool {
    let p = Path::new(path);
    match p.extension().and_then(|e| e.to_str()) {
        Some(ext) => {
            let e = ext.to_ascii_lowercase();
            e == "png" || e == "jpg" || e == "jpeg" || e == "webp"
        }
        None => false,
    }
}

fn resolve_format(source: &Path, format: &str) -> String {
    if format != "keep" {
        return format.to_string();
    }
    match source
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
    {
        Some(ext) if ext == "png" => "png".to_string(),
        Some(ext) if ext == "webp" => "webp".to_string(),
        _ => "jpeg".to_string(),
    }
}

fn output_ext(format: &str) -> &'static str {
    if format == "jpeg" {
        ".jpg"
    } else if format == "png" {
        ".png"
    } else {
        ".webp"
    }
}

fn resize_max_edge(img: DynamicImage, max_edge: u32) -> DynamicImage {
    if max_edge == 0 {
        return img;
    }
    let (w, h) = (img.width(), img.height());
    let max_dim = w.max(h);
    if max_dim <= max_edge {
        return img;
    }
    let ratio = max_edge as f32 / max_dim as f32;
    let nw = (w as f32 * ratio).round().max(1.0) as u32;
    let nh = (h as f32 * ratio).round().max(1.0) as u32;
    img.resize(nw, nh, FilterType::Lanczos3)
}

pub(crate) fn write_image(
    img: &DynamicImage,
    format: &str,
    quality: u8,
    dest: &Path,
) -> Result<(u32, u32, u64), String> {
    match format {
        "jpeg" => {
            let rgb = img.to_rgb8();
            let mut buf = Vec::new();
            let enc = JpegEncoder::new_with_quality(&mut buf, quality);
            enc.write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|e| e.to_string())?;
            fs::write(dest, &buf).map_err(|e| e.to_string())?;
            Ok((rgb.width(), rgb.height(), buf.len() as u64))
        }
        "png" => {
            let mut buf = Vec::new();
            let enc = image::codecs::png::PngEncoder::new(&mut buf);
            let rgba = img.to_rgba8();
            enc.write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| e.to_string())?;
            fs::write(dest, &buf).map_err(|e| e.to_string())?;
            Ok((rgba.width(), rgba.height(), buf.len() as u64))
        }
        "webp" => {
            let mut buf = Vec::new();
            let enc = image::codecs::webp::WebPEncoder::new_lossless(&mut buf);
            let rgba = img.to_rgba8();
            enc.write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| e.to_string())?;
            fs::write(dest, &buf).map_err(|e| e.to_string())?;
            Ok((rgba.width(), rgba.height(), buf.len() as u64))
        }
        _ => Err("unsupported format".into()),
    }
}

pub fn compress_image(source_path: &str, options: &CompressOptions) -> Result<CompressResult, String> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(format!("file not found: {}", source_path));
    }
    if !is_image_path(source_path) {
        return Err("only png/jpg/jpeg/webp".into());
    }

    let before_bytes = fs::metadata(&source).map_err(|e| e.to_string())?.len();
    let quality = options.quality.clamp(1, 100) as u8;
    let max_edge = options.max_edge.max(0) as u32;
    let out_format = resolve_format(&source, &options.format);

    let out_dir = options
        .output_dir
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| source.parent().unwrap_or(Path::new(".")).join("compressed"));
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let output_path = out_dir.join(format!("{}{}", stem, output_ext(&out_format)));

    let img = image::open(&source).map_err(|e| e.to_string())?;
    let img = resize_max_edge(img, max_edge);
    let (width, height, after_bytes) = write_image(&img, &out_format, quality, &output_path)?;

    let saved_ratio = if before_bytes > 0 {
        ((before_bytes - after_bytes) as f64 / before_bytes as f64).max(0.0)
    } else {
        0.0
    };

    Ok(CompressResult {
        source_path: source_path.to_string(),
        output_path: output_path.to_string_lossy().to_string(),
        before_bytes,
        after_bytes,
        width,
        height,
        format: out_format,
        saved_ratio,
    })
}

pub fn compress_many(paths: Vec<String>, options: CompressOptions) -> CompressBatchResult {
    let mut results = Vec::new();
    let mut errors = Vec::new();
    for p in paths {
        match compress_image(&p, &options) {
            Ok(r) => results.push(r),
            Err(e) => errors.push(CompressError { path: p, message: e }),
        }
    }
    CompressBatchResult { results, errors }
}

pub fn thumb_data_url(file_path: &str, size: u32) -> Result<String, String> {
    if !is_image_path(file_path) {
        return Err("invalid image".into());
    }
    let img = image::open(file_path).map_err(|e| e.to_string())?;
    let thumb = img.resize(size, size, FilterType::Triangle);
    let rgb = thumb.to_rgb8();
    let mut buf = Vec::new();
    let enc = JpegEncoder::new_with_quality(&mut buf, 72);
    enc.write_image(
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        image::ExtendedColorType::Rgb8,
    )
    .map_err(|e| e.to_string())?;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf)
    ))
}
