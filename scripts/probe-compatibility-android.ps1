param(
    [string]$Sdk = "$env:LOCALAPPDATA/Android/Sdk",
    [string]$Serial = 'emulator-5580',
    [string]$Avd = 'TatakaiCompatPhone_20261019',
    [ValidateSet('mobile', 'tv')][string]$Flavor = 'mobile',
    [string]$RepositoryUrl = 'https://github.com/keiyoushi/extensions/raw/repo/index.pb',
    [string]$TestClass = 'app.tatakai.me.compatibility.NativeCompatibilityTest',
    [string]$LiveFlag = 'nativeCompatibilityLive'
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = Join-Path $workspace '.cache/extension-feasibility'
$adb = Join-Path $Sdk 'platform-tools/adb.exe'
$package = if ($Flavor -eq 'tv') { 'app.tatakai.me.tv' } else { 'app.tatakai.me' }
$started = $false
function Invoke-Adb([string[]]$Arguments) {
    $response = & $adb -s $Serial @Arguments
    if ($LASTEXITCODE -ne 0) { throw "ADB failed: $Arguments" }
    return $response
}
try {
    $devices = & $adb devices
    if (!($devices -match "^$([regex]::Escape($Serial))\s+device$")) {
        if ($devices -match "^$([regex]::Escape($Serial))\s+") { throw 'Selected emulator is already starting or offline; it was left untouched' }
        if ($Serial -notmatch '^emulator-(\d+)$') { throw 'Connect the selected physical device first' }
        Start-Process -FilePath (Join-Path $Sdk 'emulator/emulator.exe') -ArgumentList '-avd',$Avd,'-port',$Matches[1],'-no-window','-no-audio','-no-boot-anim','-no-snapshot','-memory','1536','-cores','2','-gpu','swiftshader' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $output "emulator-$Flavor.log") -RedirectStandardError (Join-Path $output "emulator-$Flavor-error.log")
        $started = $true
        $deadline = (Get-Date).AddMinutes(4)
        do {
            Start-Sleep -Seconds 3
            try { $ready = & $adb -s $Serial shell getprop sys.boot_completed 2>$null } catch { $ready = '' }
            if ((Get-Date) -gt $deadline) { throw 'Emulator boot timed out' }
        } until ($ready -eq '1')
        if ($Flavor -eq 'tv') { Invoke-Adb @('shell','wm','size','1280x720') | Out-Null }
    }
    Invoke-Adb @('install','--streaming','-r',(Join-Path $workspace "android/app/build/outputs/apk/$Flavor/debug/app-$Flavor-debug.apk"))
    Invoke-Adb @('install','--streaming','-r',(Join-Path $workspace "android/app/build/outputs/apk/androidTest/$Flavor/debug/app-$Flavor-debug-androidTest.apk"))
    $runner = if ($Flavor -eq 'tv') { 'app.tatakai.me.player.TvPlayerPreviewRunner' } else { 'androidx.test.runner.AndroidJUnitRunner' }
    $result = Invoke-Adb @('shell','am','instrument','-w','-r','-e',$LiveFlag,'true','-e','repositoryUrl',$RepositoryUrl,'-e','class',$TestClass,"$package.test/$runner")
    $result | Set-Content -LiteralPath (Join-Path $output "device-$Flavor-test.log")
    $result
    try {
        $evidence = Invoke-Adb @('shell','run-as',$package,'cat','cache/compatibility-device-evidence.json')
        $evidence | Set-Content -LiteralPath (Join-Path $output "device-$Flavor-evidence.json")
    } catch { Write-Warning 'The device did not produce an evidence file' }
    foreach ($kind in @('aniyomi', 'mihon')) {
        try {
            $nativeEvidence = Invoke-Adb @('shell','run-as',$package,'cat',"cache/compatibility-$kind-evidence.json")
            $nativeEvidence | Set-Content -LiteralPath (Join-Path $output "device-$Flavor-$kind-evidence.json")
        } catch { }
    }
    if (($result -join "`n") -notmatch 'OK \([1-9][0-9]* tests?\)') { throw 'Original-APK instrumentation did not pass; see device test log' }
} finally {
    if ($started) { & $adb -s $Serial emu kill | Out-Null }
}
