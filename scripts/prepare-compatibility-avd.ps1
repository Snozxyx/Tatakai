param([ValidateSet('phone','tv')][string]$Device = 'phone')
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$templateName = if ($Device -eq 'tv') { 'Television_4K' } else { 'Pixel_8' }
$name = if ($Device -eq 'tv') { 'TatakaiCompatTV_20261019' } else { 'TatakaiCompatPhone_20261019' }
$root = [System.IO.Path]::GetFullPath((Join-Path $workspace ".cache/extension-feasibility/avd-$Device"))
$allowed = [System.IO.Path]::GetFullPath((Join-Path $workspace '.cache/extension-feasibility')) + [System.IO.Path]::DirectorySeparatorChar
if (!$root.StartsWith($allowed, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'AVD path is outside the test workspace' }
$avds = Join-Path $env:USERPROFILE '.android/avd'
$metadata = Join-Path $avds "$name.ini"
$marker = Join-Path $root '.tatakai-test-avd'
if ((Test-Path -LiteralPath $root) -and !(Test-Path -LiteralPath $marker)) { throw 'Existing directory is not owned by this test' }
if (Test-Path -LiteralPath $metadata) {
    if ((Get-Content -LiteralPath $metadata) -notcontains "path=$root") { throw 'An unrelated AVD already uses this name' }
}
[System.IO.Directory]::CreateDirectory($root) | Out-Null
$values = [ordered]@{}
foreach ($line in Get-Content -LiteralPath (Join-Path $avds "$templateName.avd/config.ini")) {
    $pair = $line.Split('=', 2); if ($pair.Length -eq 2) { $values[$pair[0]] = $pair[1] }
}
$values['AvdId'] = $name; $values['avd.ini.displayname'] = "Tatakai compatibility $Device"
$values['disk.dataPartition.size'] = '12G'
$values['fastboot.forceColdBoot'] = 'yes'; $values['fastboot.forceFastBoot'] = 'no'
$values['hw.camera.front'] = 'none'; $values['hw.camera.back'] = 'none'
$values['hw.cpu.ncore'] = '2'; $values['hw.lcd.width'] = '720'; $values['hw.lcd.height'] = '1280'; $values['hw.lcd.density'] = '320'
if ($Device -eq 'tv') { $values['hw.lcd.width'] = '1280'; $values['hw.lcd.height'] = '720' }
$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $root 'config.ini'), (($values.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n") + "`n", $encoding)
[System.IO.File]::WriteAllText($marker, "Owned compatibility test AVD; no existing emulator data copied.`n", $encoding)
$target = Get-Content -LiteralPath (Join-Path $avds "$templateName.ini") | Where-Object { $_.StartsWith('target=') }
[System.IO.File]::WriteAllText($metadata, "avd.ini.encoding=UTF-8`npath=$root`n$target`n", $encoding)
Write-Output "Prepared $name at $root; existing emulator data is untouched."
