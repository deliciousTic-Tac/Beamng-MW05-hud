$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$output = Join-Path (Split-Path $root -Parent) 'MW05BeamNG.zip'
$staging = $output + '.building'
$runtime = [System.IO.File]::ReadAllText((Join-Path $root 'lib/runtime.js'))
Add-Type -AssemblyName System.IO.Compression
$file = [System.IO.File]::Open($staging, 'CreateNew', 'ReadWrite', 'None')
$archive = [System.IO.Compression.ZipArchive]::new($file, 'Create', $false)
try {
  # Explicit package scope: never include Git, local settings, tests or backups.
  $files = Get-ChildItem -LiteralPath (Join-Path $root 'ui') -File -Recurse |
    Where-Object { $_.Extension -in @('.js', '.css', '.json', '.png', '.svg', '.otf', '.ttf') } |
    Sort-Object FullName
  foreach ($source in $files) {
    $relative = $source.FullName.Substring($root.Length + 1).Replace('\', '/')
    $entry = $archive.CreateEntry($relative, 'Optimal')
    $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
    $target = $entry.Open()
    try {
      if ($source.Name -eq 'app.js') {
        $content = $runtime + "`n" + [System.IO.File]::ReadAllText($source.FullName)
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($content)
        $target.Write($bytes, 0, $bytes.Length)
      } else {
        $inputFile = $source.OpenRead()
        try { $inputFile.CopyTo($target) } finally { $inputFile.Dispose() }
      }
    } finally { $target.Dispose() }
  }
} finally { $archive.Dispose(); $file.Dispose() }
[System.IO.File]::Move($staging, $output, $true)
Write-Output "Created $output"
