"""Stage a project-local MSVC/Windows SDK toolchain; no system installation."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / ".cache" / "rtx-toolchain"


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def acquire(item):
    name, url, digest = item
    file = DEST / "downloads" / name
    file.parent.mkdir(parents=True, exist_ok=True)
    if not file.exists():
        print(f"Downloading {name}", flush=True)
        file.write_bytes(fetch(url))
    if digest and hashlib.sha256(file.read_bytes()).hexdigest() != digest:
        raise ValueError(f"Microsoft payload checksum failed: {name}")
    return file


def extract(file, target, prefix=""):
    with zipfile.ZipFile(file) as archive:
        for entry in archive.infolist():
            name = entry.filename.replace("\\", "/")
            if not name.startswith(prefix) or entry.is_dir():
                continue
            relative = Path(name[len(prefix):])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Unsafe toolchain archive path")
            output = target / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            data = archive.read(entry)
            if not output.exists() or output.read_bytes() != data:
                output.write_bytes(data)


if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    channel = json.loads(fetch("https://aka.ms/vs/17/release/channel"))
    manifest_url = next(item for item in channel["channelItems"] if item["id"] == "Microsoft.VisualStudio.Manifests.VisualStudio")["payloads"][0]["url"]
    manifest = json.loads(fetch(manifest_url))
    prefix = "Microsoft.VC.14.44.17.14."
    suffixes = ["Tools.HostX64.TargetX64.base", "Tools.HostX64.TargetX64.Res.base", "CRT.Headers.base", "CRT.x64.Desktop.base", "CRT.x64.Store.base"]
    packages = []
    for suffix in suffixes:
        package = next(item for item in manifest["packages"] if item["id"] == prefix + suffix and item.get("language", "en-US") == "en-US")
        for payload in package["payloads"]:
            packages.append((payload["fileName"], payload["url"], payload["sha256"]))
    sdk_version = "10.0.26100.9169"
    for package in ["microsoft.windows.sdk.cpp", "microsoft.windows.sdk.cpp.x64"]:
        name = f"{package}.{sdk_version}.nupkg"
        packages.append((name, f"https://api.nuget.org/v3-flatcontainer/{package}/{sdk_version}/{name}", None))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        files = list(executor.map(acquire, packages))
    for file in files:
        extract(file, DEST / ("msvc" if file.suffix == ".vsix" else "sdk"), "Contents/" if file.suffix == ".vsix" else "")
    print(f"Local build toolchain ready: {DEST}")
