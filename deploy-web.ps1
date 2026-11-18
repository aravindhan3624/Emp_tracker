# Publishes the FieldForce 360 web demo to Cloudflare Pages (free): https://fieldforce360.pages.dev
# First time only:  npx.cmd wrangler login
# Then:             powershell -ExecutionPolicy Bypass -File .\deploy-web.ps1
# Site layout:  /        = side-by-side live demo (phone + dashboard)
#               /app     = employee app     /admin = manager dashboard
#               /settings = admin console   /pricing = pricing page

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
# Classic Cloudflare Pages project "fieldforce360" -> https://fieldforce360.pages.dev
npx.cmd --yes wrangler@4 pages deploy $site --project-name fieldforce360 --branch main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { throw 'Deploy failed' }
