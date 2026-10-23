param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
[System.IO.Directory]::CreateDirectory($root) | Out-Null
$zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
    [long]$total = 0; [long]$written = 0
    foreach ($entry in $zip.Entries) { $total += $entry.Length }
    foreach ($entry in $zip.Entries) {
        $target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $entry.FullName))
        if (!$target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive entry is outside the runtime directory' }
        if ($entry.Name -eq '') { [System.IO.Directory]::CreateDirectory($target) | Out-Null; continue }
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
        $inputStream = $entry.Open()
        try {
            $outputStream = [System.IO.File]::Open($target, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
            try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
        } finally { $inputStream.Dispose() }
        $written += $entry.Length
        @{ stage='extracting'; receivedBytes=$written; totalBytes=$total } | ConvertTo-Json -Compress
    }
} finally { $zip.Dispose() }
