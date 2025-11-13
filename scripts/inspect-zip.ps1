param(
    [Parameter(Mandatory=$true)]
    [string] $ZipPath
)

if (-not (Test-Path $ZipPath)) {
    Write-Error "Zip not found: $ZipPath"
    exit 2
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
    foreach ($entry in $z.Entries) {
        Write-Output $entry.FullName
    }
} finally {
    $z.Dispose()
}

exit 0
