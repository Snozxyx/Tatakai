use crate::{
    scene::valid_blob,
    storage::{self, Session},
};
use anyhow::{bail, Context, Result};
use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub fn restore(root: &Path, archive: &Path) -> Result<Session> {
    if fs::metadata(archive)?.len() > 2 * 1024 * 1024 * 1024 {
        bail!("Project backup exceeds 2 GiB");
    }
    let temporary = root.join(format!("{}.restoring", crate::scene::id()));
    fs::create_dir(&temporary)?;
    fs::create_dir(temporary.join("blobs"))?;
    let outcome = (|| -> Result<PathBuf> {
        let mut zip = zip::ZipArchive::new(fs::File::open(archive)?)?;
        if zip.len() > 20_000 {
            bail!("Backup contains too many files");
        }
        let mut names = HashSet::new();
        let mut total = 0u64;
        for index in 0..zip.len() {
            let mut file = zip.by_index(index)?;
            let name = file.name().to_string();
            if file.enclosed_name().is_none()
                || name.contains('\\')
                || file
                    .unix_mode()
                    .is_some_and(|mode| mode & 0o170000 == 0o120000)
            {
                bail!("Backup contains an unsafe path or link");
            }
            if file.is_dir() {
                if name != "blobs/" {
                    bail!("Backup contains an unexpected directory");
                }
                continue;
            }
            let is_state = name == "state-0.json" || name == "state-1.json";
            let is_blob = name.strip_prefix("blobs/").is_some_and(valid_blob);
            if !is_state && !is_blob {
                bail!("This ZIP is not a portable Tatakai project backup");
            }
            if !names.insert(name.clone()) {
                bail!("Backup contains duplicate files");
            }
            let limit = if is_state {
                96 * 1024 * 1024
            } else {
                512 * 1024 * 1024
            };
            if file.size() > limit {
                bail!("Backup file exceeds its size limit");
            }
            total = total
                .checked_add(file.size())
                .context("Backup size overflow")?;
            if total > 2 * 1024 * 1024 * 1024 {
                bail!("Backup expands beyond 2 GiB");
            }
            let mut bytes = vec![];
            (&mut file).take(limit + 1).read_to_end(&mut bytes)?;
            if bytes.len() as u64 > limit {
                bail!("Backup expands beyond its declared size");
            }
            storage::atomic_new(&temporary.join(name), &bytes)?;
        }
        let mut restored = Session::open(temporary.clone())?;
        restored.fork_identity()?;
        let destination = root.join(format!("{}.tatakaiproj", restored.project.id));
        if destination.exists() {
            bail!("Restore destination already exists");
        }
        drop(restored);
        fs::rename(&temporary, &destination)?;
        Ok(destination)
    })();
    match outcome {
        Ok(path) => Session::open(path),
        Err(error) => {
            let _ = fs::remove_dir_all(&temporary);
            Err(error)
        }
    }
}
