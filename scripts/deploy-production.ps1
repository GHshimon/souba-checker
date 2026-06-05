# Cloudflare Pages 本番デプロイ + シークレット登録
# 事前: npx wrangler login
# 使用: .\scripts\deploy-production.ps1

$ErrorActionPreference = "Stop"
$ProjectName = "souba-checker"
# 初回 create 時のサブドメイン（ダッシュボードの Production URL と一致させる）
$ProductionReferer = "https://souba-checker-88k.pages.dev"
$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root

Write-Host "Checking Wrangler authentication..." -ForegroundColor Cyan
$whoami = npx wrangler whoami 2>&1 | Out-String
if ($whoami -match "not authenticated") {
  Write-Error "Wrangler is not logged in. Run: npx wrangler login"
}

Write-Host "Building..." -ForegroundColor Cyan
npm run build

Write-Host "Deploying to Cloudflare Pages ($ProjectName)..." -ForegroundColor Cyan
$deployOut = npx wrangler pages deploy dist --project-name $ProjectName --commit-dirty=true 2>&1 | Out-String
Write-Host $deployOut
if ($LASTEXITCODE -ne 0) {
  Write-Error "Pages deploy failed."
}

$devVarsPath = Join-Path $Root ".dev.vars"
if (-not (Test-Path $devVarsPath)) {
  Write-Warning ".dev.vars not found. Skip secrets. Copy from .dev.vars.example and re-run."
  exit 0
}

Write-Host "Uploading secrets from .dev.vars (RAKUTEN_REFERER -> production)..." -ForegroundColor Cyan
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
    Write-Warning "Missing $name in .dev.vars — secret not uploaded."
    continue
  }
  Write-Host "  -> $name" -ForegroundColor DarkGray
  $tmp = Join-Path $env:TEMP "cf-secret-$name.txt"
  try {
    [System.IO.File]::WriteAllText($tmp, $secrets[$name], [System.Text.UTF8Encoding]::new($false))
    Get-Content $tmp -Raw -Encoding UTF8 | npx wrangler pages secret put $name --project-name $ProjectName
    if ($LASTEXITCODE -ne 0) {
      Write-Error "Failed to set secret: $name"
    }
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
}

Write-Host ""
Write-Host "Done. Production URL:" -ForegroundColor Green
Write-Host "  $ProductionReferer"
Write-Host "Verify Rakuten Allowed websites includes the pages.dev hostname above."
