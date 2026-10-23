use crate::scene::{valid_blob, Project};
use anyhow::{bail, Context, Result};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
struct Slot {
    checksum: String,
    project: Project,
}
pub struct Session {
    pub dir: PathBuf,
    pub project: Project,
    _lock: File,
    undo: Vec<Project>,
    redo: Vec<Project>,
}

fn sync_dir(dir: &Path) -> Result<()> {
    #[cfg(unix)]
    File::open(dir)?.sync_all()?;
    let _ = dir;
    Ok(())
}
pub fn atomic_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let temp = path.with_extension(format!("{}.tmp", crate::scene::id()));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    // Caller only uses immutable new paths. State slots are replaced separately.
    fs::rename(&temp, path)?;
    sync_dir(path.parent().context("Missing parent")?)?;
    Ok(())
}
fn persist(dir: &Path, project: &Project) -> Result<()> {
    let bytes = serde_json::to_vec(project)?;
    let slot = Slot {
        checksum: blake3::hash(&bytes).to_hex().to_string(),
        project: project.clone(),
    };
    let path = dir.join(format!("state-{}.json", project.revision % 2));
    // The other slot remains valid if Windows cannot replace this slot atomically.
    let temp = dir.join(format!("state-{}.tmp", crate::scene::id()));
    let mut f = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)?;
    f.write_all(&serde_json::to_vec(&slot)?)?;
    f.sync_all()?;
    drop(f);
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(&path)?;
    }
    fs::rename(temp, path)?;
    sync_dir(dir)
}
impl Session {
    pub fn fork_identity(&mut self) -> Result<()> {
        self.check_blobs(&self.project)?;
        let mut next = self.project.clone();
        next.id = crate::scene::id();
        next.revision = 0;
        persist(&self.dir, &next)?;
        next.revision = 1;
        persist(&self.dir, &next)?;
        self.project = next;
        self.undo.clear();
        self.redo.clear();
        Ok(())
    }
    pub fn create(dir: PathBuf, project: Project) -> Result<Self> {
        project.validate()?;
        if dir.exists() {
            bail!("Project directory already exists");
        }
        fs::create_dir(&dir)?;
        fs::create_dir(dir.join("blobs"))?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(dir.join("project.lock"))?;
        lock.try_lock_exclusive()
            .context("Project is already open")?;
        persist(&dir, &project)?;
        Ok(Self {
            dir,
            project,
            _lock: lock,
            undo: vec![],
            redo: vec![],
        })
    }
    pub fn open(dir: PathBuf) -> Result<Self> {
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(dir.join("project.lock"))?;
        lock.try_lock_exclusive()
            .context("Project is already open")?;
        let project = read_project(&dir)?;
        Ok(Self {
            dir,
            project,
            _lock: lock,
            undo: vec![],
            redo: vec![],
        })
    }
    pub fn commit(&mut self, mut next: Project, base: u64) -> Result<()> {
        if base != self.project.revision || next.id != self.project.id {
            bail!("Stale project revision; reload before editing");
        }
        next.validate()?;
        self.check_blobs(&next)?;
        next.revision = base.checked_add(1).context("Revision overflow")?;
        persist(&self.dir, &next)?;
        self.undo.push(std::mem::replace(&mut self.project, next));
        if self.undo.len() > 100 {
            self.undo.remove(0);
        }
        self.redo.clear();
        Ok(())
    }
    pub fn history(&mut self, redo: bool, base: u64) -> Result<()> {
        if base != self.project.revision {
            bail!("Stale project revision");
        }
        let stack = if redo { &self.redo } else { &self.undo };
        let mut next = stack.last().context("No further history")?.clone();
        next.revision = self.project.revision + 1;
        persist(&self.dir, &next)?;
        let previous = std::mem::replace(&mut self.project, next);
        if redo {
            self.redo.pop();
            self.undo.push(previous);
        } else {
            self.undo.pop();
            self.redo.push(previous);
        }
        Ok(())
    }
    pub fn blob(&self, key: &str) -> Result<Vec<u8>> {
        if !valid_blob(key) {
            bail!("Invalid blob reference");
        }
        let path = self.dir.join("blobs").join(key);
        if fs::symlink_metadata(&path)?.file_type().is_symlink() {
            bail!("Project blobs cannot be symbolic links");
        }
        let mut f = File::open(path)?;
        if f.metadata()?.len() > 512 * 1024 * 1024 {
            bail!("Blob exceeds size limit");
        }
        let mut bytes = vec![];
        f.read_to_end(&mut bytes)?;
        if blake3::hash(&bytes).to_hex().as_str() != key {
            bail!("Project blob integrity check failed");
        }
        Ok(bytes)
    }
    pub fn put_blob(&self, bytes: &[u8]) -> Result<String> {
        let key = blake3::hash(bytes).to_hex().to_string();
        let path = self.dir.join("blobs").join(&key);
        if !path.exists() {
            atomic_new(&path, bytes)?;
        } else {
            self.blob(&key)?;
        }
        Ok(key)
    }
    fn check_blobs(&self, project: &Project) -> Result<()> {
        let mut font_bytes = 0;
        for font in &project.fonts {
            let bytes = self.blob(&font.blob)?;
            font_bytes += bytes.len();
            if bytes.len() > 20 * 1024 * 1024 || font_bytes > 80 * 1024 * 1024 {
                bail!("Project fonts exceed their memory budget");
            }
        }
        for page in &project.pages {
            self.blob(&page.blob)?;
            for layer in &page.layers {
                if let Some(cleanup) = &layer.cleanup {
                    self.blob(&cleanup.mask)?;
                    self.blob(&cleanup.source_blob)?;
                }
                if let crate::scene::Content::Raster { blob } = &layer.content {
                    self.blob(blob)?;
                }
            }
        }
        Ok(())
    }
}
pub fn read_project(dir: &Path) -> Result<Project> {
    if dir.join("deleting.marker").exists() {
        bail!("Project deletion is in progress");
    }
    let mut candidates = vec![];
    for n in 0..2 {
        if let Ok(bytes) = fs::read(dir.join(format!("state-{n}.json"))) {
            if let Ok(slot) = serde_json::from_slice::<Slot>(&bytes) {
                if let Ok(payload) = serde_json::to_vec(&slot.project) {
                    if blake3::hash(&payload).to_hex().as_str() == slot.checksum
                        && slot.project.validate().is_ok()
                    {
                        candidates.push(slot.project);
                    }
                }
            }
        }
    }
    candidates
        .into_iter()
        .max_by_key(|p| p.revision)
        .context("Neither project recovery slot is valid")
}

pub fn delete_project(dir: &Path, root: &Path) -> Result<()> {
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join("project.lock"))?;
    lock.try_lock_exclusive()
        .context("Project is already open")?;
    let marker = dir.join("deleting.marker");
    if !marker.exists() {
        atomic_new(&marker, b"Project deletion requested")?;
    }
    // Windows cannot rename a directory containing a locked file. The marker
    // rejects all new opens after the exclusive lock is released.
    drop(lock);
    let trash = root.join(format!("{}.deleted", crate::scene::id()));
    fs::rename(dir, &trash)?;
    fs::remove_dir_all(trash)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::Credit;
    #[test]
    fn locks_revisions_history_and_recovery() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("test.tatakaiproj");
        let mut s = Session::create(
            dir.clone(),
            Project::new("Original".into(), Credit::default()),
        )
        .unwrap();
        assert!(Session::open(dir.clone()).is_err());
        let mut next = s.project.clone();
        next.name = "Edited".into();
        s.commit(next.clone(), 0).unwrap();
        assert!(s.commit(next, 0).is_err());
        s.history(false, 1).unwrap();
        assert_eq!(s.project.name, "Original");
        s.history(true, 2).unwrap();
        assert_eq!(s.project.name, "Edited");
        drop(s);
        fs::write(dir.join("state-1.json"), b"interrupted write").unwrap();
        let s = Session::open(dir).unwrap();
        assert_eq!(s.project.revision, 2);
    }
    #[test]
    fn corrupt_blob_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        let s = Session::create(
            root.path().join("a.tatakaiproj"),
            Project::new("A".into(), Credit::default()),
        )
        .unwrap();
        let key = s.put_blob(b"original").unwrap();
        fs::write(s.dir.join("blobs").join(&key), b"modified").unwrap();
        assert!(s.blob(&key).is_err());
        assert!(s.blob("../state-0.json").is_err());
    }
}
