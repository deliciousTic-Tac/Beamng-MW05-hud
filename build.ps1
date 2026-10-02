param(
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$output = if ($OutputPath) { [System.IO.Path]::GetFullPath($OutputPath) } else { Join-Path (Split-Path -Parent $root) 'MW05BeamNG.zip' }
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($output, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  # Package only reviewed mod assets; never include Git data or local configuration.
  $appFiles = Get-ChildItem -LiteralPath (Join-Path $root 'ui/modules/apps') -Recurse | Where-Object { -not $_.PSIsContainer -and ($_.Name -in @('app.js', 'app.css', 'app.json') -or $_.Extension -eq '.png') }
  $rootImages = Get-Item -LiteralPath (Join-Path $root 'cover.png'), (Join-Path $root 'icon-96.png')
  @($appFiles) + @($rootImages) | ForEach-Object {
    $relative = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
    $input = [System.IO.File]::OpenRead($_.FullName)
    try { $stream = $entry.Open(); try { $input.CopyTo($stream) } finally { $stream.Dispose() } } finally { $input.Dispose() }
  }
} finally { $archive.Dispose() }
Write-Output "Created $output"
