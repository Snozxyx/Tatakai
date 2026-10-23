fn main() {
    // Rust's Windows GNU standard library links winpthreads statically. UnRAR
    // also asks for -lpthread, which newer MinGW toolchains otherwise resolve
    // to the DLL import library first. Keep both on the same static library.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu")
    {
        let compiler = std::env::var("CC").unwrap_or_else(|_| "gcc".into());
        let output = std::process::Command::new(compiler)
            .arg("-print-file-name=libpthread.a")
            .output()
            .expect("A MinGW C compiler is required");
        let archive = std::path::PathBuf::from(
            String::from_utf8(output.stdout)
                .expect("Compiler path must be UTF-8")
                .trim(),
        );
        assert!(
            output.status.success() && archive.is_file(),
            "MinGW static pthread library is missing"
        );
        let directory =
            std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("static-pthread");
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::copy(archive, directory.join("libpthread.a")).unwrap();
        println!("cargo:rustc-link-search=native={}", directory.display());
    }
    println!("cargo:rerun-if-env-changed=CC");
}
