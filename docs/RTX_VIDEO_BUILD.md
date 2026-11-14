# RTX Video desktop build

Windows x64 builds include Tatakai's native video helper, the unmodified NVIDIA VSR runtime, and their license notices. An RTX GPU alone does not provide these app files.

Download the official [NVIDIA RTX Video SDK](https://developer.nvidia.com/rtx-video-sdk/getting-started) after signing in and extract its `include`, `lib`, and `bin` folders into `.cache/rtx-video-sdk`. Alternatively set `RTX_VIDEO_SDK` to the extracted SDK directory.

Use a Visual Studio x64 Developer shell, or the project-local compiler prepared by `python scripts/prepare-rtx-toolchain.py`, then run:

```powershell
npm run rtx:build
.\resources\bin\rtx-video\tatakai-rtx-video.exe --probe
```

`build` and `electron:build` compile the runtime first on Windows x64. `build:dev` and `electron:dev` also stage it when the SDK is present. The final desktop package check verifies all runtime files and notices, so a Windows release cannot silently omit RTX support.

Windows Application Control may require a trusted signed helper before allowing GPU initialization. Compile success and an RTX adapter do not establish that the OS permits the helper to run. Keep that failure visible in the compatibility panel; use a properly signed distribution on devices with that policy.
