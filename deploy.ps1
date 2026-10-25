# Deploy หน้าเว็บขึ้น Cloudflare (static assets) — ส่งเฉพาะไฟล์เว็บ ไม่รวมโค้ด Worker/ไฟล์ออกแบบ
# วิธีใช้: เปิด PowerShell ที่โฟลเดอร์นี้แล้วรัน  .\deploy.ps1
# เว็บ: https://diewland-portfolio.vasin.workers.dev
$ErrorActionPreference = "Stop"
$dist = Join-Path $env:TEMP "diewland-portfolio-dist"

if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory -Path $dist | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dist "public") | Out-Null
$public = Join-Path $dist "public"

$files = "index.html", "style.css", "script.js", "data.js", "admin.html", "admin.css", "admin.js", "_headers"
foreach ($f in $files) { Copy-Item (Join-Path $PSScriptRoot $f) $public }
Copy-Item -Recurse (Join-Path $PSScriptRoot "assets") $public

# config สำหรับ wrangler (สร้างใน dist เพื่อไม่ให้มีไฟล์ตั้งค่าในโปรเจกต์)
@'
{
  "name": "diewland-portfolio",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./public" }
}
'@ | Set-Content -Encoding utf8 (Join-Path $dist "wrangler.jsonc")

Push-Location $dist
try { npx --yes wrangler deploy }
finally { Pop-Location }
