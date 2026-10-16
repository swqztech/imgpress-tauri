mod compress;

mod merge;

use compress::{thumb_data_url, CompressBatchResult, CompressOptions, is_image_path};

use merge::{merge_images, MergeOptions, MergeResult};

use serde::Serialize;

use tauri::{AppHandle, Emitter, Manager};

use tauri_plugin_dialog::DialogExt;

use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Serialize)]

#[serde(rename_all = "camelCase")]

struct ProgressPayload {

    done: usize,

    total: usize,

    current: String,

}

#[tauri::command]

async fn dialog_pick_images(app: AppHandle) -> Result<Vec<String>, String> {

    let files = app

        .dialog()

        .file()

        .add_filter("Images", &["png", "jpg", "jpeg", "webp"])

        .set_title("选择图片")

        .blocking_pick_files();

    let Some(files) = files else {

        return Ok(vec![]);

    };

    let paths = files

        .into_iter()

        .filter_map(|f| f.into_path().ok())

        .map(|p| p.to_string_lossy().to_string())

        .filter(|p| is_image_path(p))

        .collect();

    Ok(paths)

}

#[tauri::command]

async fn dialog_pick_output_dir(app: AppHandle) -> Result<Option<String>, String> {

    let dir = app

        .dialog()

        .file()

        .set_title("选择输出目录")

        .blocking_pick_folder();

    Ok(dir.map(|d| d.to_string()))

}

#[tauri::command]

async fn compress_run(

    app: AppHandle,

    paths: Vec<String>,

    options: CompressOptions,

) -> Result<CompressBatchResult, String> {

    let total = paths.len();

    let mut results = Vec::new();

    let mut errors = Vec::new();

    for (i, p) in paths.iter().enumerate() {

        let _ = app.emit(

            "compress:progress",

            ProgressPayload {

                done: i,

                total,

                current: p.clone(),

            },

        );

        match compress::compress_image(p, &options) {

            Ok(r) => results.push(r),

            Err(e) => {

                errors.push(compress::CompressError {

                    path: p.clone(),

                    message: e,

                });

            }

        }

    }

    let _ = app.emit(

        "compress:progress",

        ProgressPayload {

            done: total,

            total,

            current: String::new(),

        },

    );

    Ok(CompressBatchResult { results, errors })

}

#[tauri::command]

async fn merge_run(paths: Vec<String>, options: MergeOptions) -> Result<MergeResult, String> {

    merge_images(paths, options)

}

#[tauri::command]

fn show_item_in_folder(app: AppHandle, path: String) -> Result<(), String> {

    app.opener()

        .reveal_item_in_dir(path)

        .map_err(|e| e.to_string())

}

#[tauri::command]

fn image_thumb(file_path: String) -> Result<String, String> {

    thumb_data_url(&file_path, 112)

}

#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {

    tauri::Builder::default()

        .plugin(tauri_plugin_dialog::init())

        .plugin(tauri_plugin_opener::init())

        .setup(|app| {

            if let Some(win) = app.get_webview_window("main") {

                let _ = win.show();

            }

            Ok(())

        })

        .invoke_handler(tauri::generate_handler![

            dialog_pick_images,

            dialog_pick_output_dir,

            compress_run,

            merge_run,

            show_item_in_folder,

            image_thumb

        ])

        .run(tauri::generate_context!())

        .expect("failed to run Imgpress");

}

