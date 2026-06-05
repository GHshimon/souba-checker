# Re-upload Cloudflare Pages secrets from .dev.vars (Windows-safe stdin)
$ErrorActionPreference = "Stop"
$ProjectName = "souba-checker"
$ProductionReferer = "https://souba-checker-88k.pages.dev"
$Root = Split-Path -Parent $PSScriptRoot
$devVarsPath = Join-Path $Root ".dev.vars"

if (-not (Test-Path $devVarsPath)) {
  throw ".dev.vars not found"
}

$secrets = @{}
Get-Content $devVarsPath -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()
  if ($key -and $val) { $secrets[$key] = $val }
}

$secrets["RAKUTEN_REFERER"] = $ProductionReferer

$required = @(
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "RAKUTEN_APP_ID",
  "RAKUTEN_ACCESS_KEY",
  "RAKUTEN_REFERER",
  "YAHOO_CLIENT_ID"
)

foreach ($name in $required) {
  if (-not $secrets.ContainsKey($name) -or -not $secrets[$name]) {
    Write-Warning "Skip $name (empty in .dev.vars)"
    continue
  }
  $tmp = Join-Path $env:TEMP "cf-secret-$name.txt"
  try {
    [System.IO.File]::WriteAllText($tmp, $secrets[$name], [System.Text.UTF8Encoding]::new($false))
    Write-Host "Uploading $name ..."
    Get-Content $tmp -Raw -Encoding UTF8 | npx wrangler pages secret put $name --project-name $ProjectName
    if ($LASTEXITCODE -ne 0) { throw "Failed: $name" }
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
}

Write-Host "Secrets updated."
