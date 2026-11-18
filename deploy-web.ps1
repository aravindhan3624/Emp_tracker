# Publishes the FieldForce 360 web demo (free hosting):
#   Cloudflare Pages -> https://fieldforce360.pages.dev
#   Netlify          -> https://fieldforce360-demo.netlify.app
# First time only on a computer:  npx.cmd wrangler login   and   npx.cmd netlify-cli login
# Then:  powershell -ExecutionPolicy Bypass -File .\deploy-web.ps1 [-Target both|cloudflare|netlify]
# Site layout:  /        = side-by-side live demo (phone + dashboard)
#               /app     = employee app     /admin = manager dashboard
#               /settings = admin console   /pricing = pricing page
param([ValidateSet('both', 'cloudflare', 'netlify')][string]$Target = 'both')

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$site = Join-Path $PSScriptRoot 'site'
if (Test-Path $site) { Remove-Item -Recurse -Force $site }
Copy-Item -Recurse www $site
Remove-Item (Join-Path $site 'vendor\*.map'), (Join-Path $site 'vendor\leaflet-src*') -ErrorAction SilentlyContinue

# The phone app lives at /app.html on the web (index.html stays the app inside the APK).
Move-Item (Join-Path $site 'index.html') (Join-Path $site 'app.html')
$demo = [IO.File]::ReadAllText((Join-Path $site 'demo.html'), [Text.Encoding]::UTF8) -replace 'src="index.html"', 'src="app.html"'
[IO.File]::WriteAllText((Join-Path $site 'demo.html'), $demo)
[IO.File]::WriteAllText((Join-Path $site 'index.html'), $demo)

$ErrorActionPreference = 'Continue'
$failed = @()
if ($Target -in 'both', 'cloudflare') {
  # Classic Cloudflare Pages project "fieldforce360"
  npx.cmd --yes wrangler@4 pages deploy $site --project-name fieldforce360 --branch main --commit-dirty=true
  if ($LASTEXITCODE -ne 0) { $failed += 'Cloudflare' }
}
if ($Target -in 'both', 'netlify') {
  # Netlify site "fieldforce360-demo" (named explicitly so any computer can deploy without a linked folder)
  npx.cmd --yes netlify-cli deploy --dir $site --prod --no-build --site fieldforce360-demo
  if ($LASTEXITCODE -ne 0) { $failed += 'Netlify' }
}
if ($failed) { throw "Deploy failed: $($failed -join ', ')" }
Write-Host 'Live: https://fieldforce360.pages.dev  |  https://fieldforce360-demo.netlify.app'
