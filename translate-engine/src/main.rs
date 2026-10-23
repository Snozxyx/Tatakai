mod cleanup;
mod export;
mod fonts;
mod import;
mod paint;
mod pipeline;
mod providers;
mod render;
mod restore;
mod scene;
mod storage;
mod vision;

use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use scene::{Credit, Project};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::{self, BufRead, Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use storage::Session;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    id: u64,
    command: String,
    #[serde(default)]
    args: Value,
}
struct State {
    root: PathBuf,
    session: Option<Session>,
    busy: bool,
}
type Shared = Arc<Mutex<State>>;
fn emit(value: Value) {
    let mut out = io::stdout().lock();
    let _ = serde_json::to_writer(&mut out, &value);
    let _ = out.write_all(b"\n");
    let _ = out.flush();
}
fn str_arg<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    args[key].as_str().with_context(|| format!("Missing {key}"))
}
fn revision(args: &Value) -> Result<u64> {
    args["revision"]
        .as_u64()
        .context("Missing project revision")
}
fn session(state: &mut State) -> Result<&mut Session> {
    state
        .session
        .as_mut()
        .context("Open a translation project first")
}
fn project_path(root: &std::path::Path, id: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(id).context("Invalid project ID")?;
    Ok(root.join(format!("{id}.tatakaiproj")))
}
fn dispatch(shared: &Shared, cancel: &Arc<AtomicBool>, request: &Request) -> Result<Value> {
    if request.command == "cancel" {
        cancel.store(true, Ordering::SeqCst);
        return Ok(json!({"stopping":true}));
    }
    let mut state = shared
        .lock()
        .map_err(|_| anyhow::anyhow!("Engine state is unavailable"))?;
    if request.command == "status" {
        return Ok(json!({"project":state.session.as_ref().map(|s|&s.project),"busy":state.busy}));
    }
    if request.command == "resources" {
        let mut system = sysinfo::System::new_all();
        system.refresh_memory();
        return Ok(
            json!({"totalMemory":system.total_memory(),"availableMemory":system.available_memory(),"busy":state.busy,"architecture":std::env::consts::ARCH,"platform":std::env::consts::OS}),
        );
    }
    if state.busy && !["render", "settings", "list"].contains(&request.command.as_str()) {
        bail!("A processing job is running. Stop it before editing the project.");
    }
    let a = &request.args;
    match request.command.as_str() {
        "list" => {
            let mut projects = vec![];
            for entry in fs::read_dir(&state.root)? {
                let path = entry?.path();
                if path.extension().is_some_and(|e| e == "tatakaiproj") {
                    if let Ok(p) = storage::read_project(&path) {
                        projects.push(json!({"id":p.id,"name":p.name,"pages":p.pages.len(),"credit":p.credit,"targetLanguage":p.target_language}));
                    }
                }
            }
            Ok(json!(projects))
        }
        "create" => {
            let credit = serde_json::from_value::<Credit>(a["credit"].clone())?;
            let mut project = Project::new(str_arg(a, "name")?.trim().into(), credit);
            if let Some(mapping) = a.get("mapping").filter(|v| !v.is_null()) {
                project.mapping = Some(serde_json::from_value(mapping.clone())?);
            }
            if let Some(v) = a["targetLanguage"].as_str() {
                project.target_language = v.into();
            }
            let dir = project_path(&state.root, &project.id)?;
            state.session = Some(Session::create(dir, project)?);
            Ok(json!(session(&mut state)?.project))
        }
        "open" => {
            let path = project_path(&state.root, str_arg(a, "id")?)?;
            let opened = Session::open(path)?;
            state.session = Some(opened);
            Ok(json!(session(&mut state)?.project))
        }
        "close" => {
            state.session = None;
            Ok(Value::Null)
        }
        "delete" => {
            let id = str_arg(a, "id")?;
            let dir = project_path(&state.root, id)?;
            if state.session.as_ref().is_some_and(|s| s.project.id == id) {
                bail!("Close the project before deleting it");
            }
            storage::delete_project(&dir, &state.root)?;
            Ok(Value::Null)
        }
        "commit" => {
            let next = serde_json::from_value(a["project"].clone())?;
            let s = session(&mut state)?;
            s.commit(next, revision(a)?)?;
            Ok(json!(s.project))
        }
        "undo" | "redo" => {
            let s = session(&mut state)?;
            s.history(request.command == "redo", revision(a)?)?;
            Ok(json!(s.project))
        }
        "import" => {
            let paths: Vec<PathBuf> = serde_json::from_value(a["paths"].clone())?;
            let s = session(&mut state)?;
            import::import(s, &paths, revision(a)?)?;
            Ok(json!(s.project))
        }
        "render" => {
            let s = session(&mut state)?;
            let page = s
                .project
                .pages
                .iter()
                .find(|p| Some(p.id.as_str()) == a["pageId"].as_str())
                .context("Page not found")?;
            let image = render::composite(s, page)?;
            let image = if let Some(max) = a["maxWidth"].as_u64() {
                let max = max.clamp(64, 4096) as u32;
                if image.width() > max {
                    let h =
                        (image.height() as f64 * max as f64 / image.width() as f64).ceil() as u32;
                    image::imageops::resize(&image, max, h, image::imageops::FilterType::Triangle)
                } else {
                    image
                }
            } else {
                image
            };
            Ok(json!({"png":STANDARD.encode(render::png(&image)?),"revision":s.project.revision}))
        }
        "stroke" => {
            let stroke = serde_json::from_value(a.clone())?;
            let s = session(&mut state)?;
            paint::stroke(s, stroke)?;
            Ok(json!(s.project))
        }
        "importFont" => {
            let s = session(&mut state)?;
            let result = fonts::import(s, &PathBuf::from(str_arg(a, "path")?), revision(a)?)?;
            Ok(json!({"project":s.project,"family":result}))
        }
        "preparePsd" => {
            let s = session(&mut state)?;
            export::prepare_psd(s, str_arg(a, "pageId")?, revision(a)?)
        }
        "export" => {
            let s = session(&mut state)?;
            if revision(a)? != s.project.revision {
                bail!("Stale project revision");
            }
            export::pages(s, a)?;
            Ok(json!({"exported":true}))
        }
        "restore" => {
            let restored = restore::restore(&state.root, &PathBuf::from(str_arg(a, "path")?))?;
            state.session = Some(restored);
            Ok(json!(session(&mut state)?.project))
        }
        "backup" => {
            let s = session(&mut state)?;
            export::backup(s, PathBuf::from(str_arg(a, "path")?))?;
            Ok(json!({"exported":true}))
        }
        "attachLocalModel" => {
            providers::attach_local(
                &state.root,
                str_arg(a, "endpoint")?,
                str_arg(a, "model")?,
                str_arg(a, "key")?,
                a["vision"].as_bool().unwrap_or(false),
            )?;
            Ok(json!({"attached":true}))
        }
        "detachLocalModel" => {
            providers::detach_local();
            Ok(json!({"stopped":true}))
        }
        "settings" => Ok(json!(providers::load(&state.root))),
        "saveSettings" => {
            let settings = serde_json::from_value(a["settings"].clone())?;
            providers::save(&state.root, &settings)?;
            Ok(json!(settings))
        }
        "setKey" => {
            providers::set_key(str_arg(a, "providerId")?, str_arg(a, "key")?)?;
            Ok(json!({"saved":true}))
        }
        "process" | "assistant" => {
            session(&mut state)?;
            if revision(a)? != session(&mut state)?.project.revision {
                bail!("Stale project revision");
            }
            let settings = providers::load(&state.root);
            let args = a.clone();
            let shared = Arc::clone(shared);
            let cancel = Arc::clone(cancel);
            cancel.store(false, Ordering::SeqCst);
            state.busy = true;
            let assistant = request.command == "assistant";
            std::thread::spawn(move || {
                providers::set_cancel(Arc::clone(&cancel));
                let result = if assistant {
                    pipeline::assistant(&shared, &cancel, &settings, &args)
                } else {
                    pipeline::process(&shared, &cancel, &settings, &args)
                };
                if let Ok(mut state) = shared.lock() {
                    state.busy = false;
                }
                match result {
                    Ok(value) => emit(json!({"event":"complete","result":value})),
                    Err(error) => emit(json!({"event":"error","message":error.to_string()})),
                }
            });
            Ok(json!({"started":true}))
        }
        _ => bail!("Unknown translation command"),
    }
}
fn main() -> Result<()> {
    let root = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .context("A project root directory is required")?;
    fs::create_dir_all(&root)?;
    let shared = Arc::new(Mutex::new(State {
        root,
        session: None,
        busy: false,
    }));
    let cancel = Arc::new(AtomicBool::new(false));
    emit(json!({"event":"ready","protocol":1}));
    let mut input = io::stdin().lock();
    let mut bytes = vec![];
    loop {
        bytes.clear();
        let size = input
            .by_ref()
            .take(96 * 1024 * 1024 + 1)
            .read_until(b'\n', &mut bytes)?;
        if size == 0 {
            break;
        }
        if size > 96 * 1024 * 1024 {
            bail!("Command exceeds size limit");
        }
        match serde_json::from_slice::<Request>(&bytes) {
            Ok(request) => match dispatch(&shared, &cancel, &request) {
                Ok(result) => emit(json!({"id":request.id,"ok":true,"result":result})),
                Err(error) => emit(json!({"id":request.id,"ok":false,"error":error.to_string()})),
            },
            Err(_) => emit(json!({"id":null,"ok":false,"error":"Invalid translation command"})),
        }
    }
    cancel.store(true, Ordering::SeqCst);
    Ok(())
}
