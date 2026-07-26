<#
.SYNOPSIS
  নিউজ কার্ড ইমেজ বানায় (1080x1080) — headless Edge দিয়ে HTML রেন্ডার করে।

.DESCRIPTION
  Pillow/ImageMagick ব্যবহার করা হয়নি ইচ্ছাকৃতভাবে: ওগুলোতে HarfBuzz shaping
  না থাকলে বাংলা যুক্তাক্ষর ভেঙে যায় (ক্ষ -> ক্‌ষ)। ব্রাউজার রেন্ডারিং-ই
  বাংলার জন্য একমাত্র নির্ভরযোগ্য পথ।

.EXAMPLE
  .\make-card.ps1 -Headline "শিরোনাম" -Category "জাতীয়" -Source "প্রথম আলো" `
                  -ImageUrl "https://..." -Out card.png
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Headline,
    [string]$Category = "সংবাদ",
    [string]$Source   = "",
    [string]$ImageUrl = "",              # খালি রাখলে টেক্সট-অনলি কার্ড হবে
    [string]$Accent   = "#d11d4d",       # লোগোর ক্রিমসন
    [string]$LogoPath = "",              # খালি হলে assets\logo-tight.svg
    [Parameter(Mandatory = $true)][string]$Out
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$UA   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

function Find-Edge {
    $paths = @(
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    )
    $e = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $e) { throw "Edge পাওয়া যায়নি — কার্ড রেন্ডার করা সম্ভব না।" }
    return $e
}

# HTML-এ বসানোর আগে escape — শিরোনামে <, >, & থাকলে লেআউট ভেঙে যেত
function Escape-Html($s) {
    if ($null -eq $s) { return "" }
    return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}

# শিরোনাম যত লম্বা, ফন্ট তত ছোট — নাহলে লেখা কার্ডের বাইরে চলে যায়
function Get-FontSize($text) {
    $n = $text.Length
    if ($n -le 45)  { return 74 }
    if ($n -le 65)  { return 66 }
    if ($n -le 85)  { return 58 }
    if ($n -le 110) { return 51 }
    return 45
}

# BBC-র og:image URL-এ 'branded_bengali' থাকে — ওতে BBC-র নিজস্ব জলছাপ
# ছবির গায়ে বসানো থাকে, যা আমাদের কার্ডে বসালে দৃষ্টিকটু ও বিভ্রান্তিকর।
# 'ace/ws/1024/cpsprodpb/' রূপটি একই ছবির জলছাপহীন সংস্করণ দেয়।
function Normalize-ImageUrl($url) {
    if ($url -match 'ichef\.bbci\.co\.uk/.*?([0-9a-f]{4}/live/[0-9a-f\-]+\.(?:jpg|jpeg|png|webp))') {
        return "https://ichef.bbci.co.uk/ace/ws/1024/cpsprodpb/" + $Matches[1]
    }
    return $url
}

# ছবি data URI হিসেবে বসাই — হেডলেস ব্রাউজারকে নেটওয়ার্কে যেতে দিলে
# hotlink-ব্লক বা ধীর লোডে খালি কার্ড রেন্ডার হয়ে যায়
function Get-ImageDataUri($url) {
    try {
        $r = Invoke-WebRequest $url -UseBasicParsing -Headers @{ "User-Agent" = $UA } -TimeoutSec 30
        $bytes = $r.Content
        if ($bytes -isnot [byte[]]) { $bytes = [System.Text.Encoding]::UTF8.GetBytes($bytes) }
        if ($bytes.Length -lt 3000) { return $null }   # ১x১ ট্র্যাকিং পিক্সেল/প্লেসহোল্ডার বাদ

        $ct = $r.Headers["Content-Type"]
        if (-not $ct -or $ct -notlike "image/*") {
            $ct = "image/jpeg"
            if ($url -match '\.png(\?|$)')  { $ct = "image/png" }
            if ($url -match '\.webp(\?|$)') { $ct = "image/webp" }
        }
        $ct = ($ct -split ';')[0].Trim()
        return "data:$ct;base64," + [Convert]::ToBase64String($bytes)
    } catch {
        Write-Host "    ছবি নামানো গেল না ($($_.Exception.Message)) — টেক্সট কার্ডে ফিরে যাচ্ছি" -ForegroundColor Yellow
        return $null
    }
}

# ---------------------------------------------------------------
$dataUri = $null
if ($ImageUrl) { $dataUri = Get-ImageDataUri (Normalize-ImageUrl $ImageUrl) }

$usephoto = [bool]$dataUri
$tplName  = "card-text.html"
if ($usephoto) { $tplName = "card-photo.html" }

$tplPath = Join-Path $root "templates\$tplName"
if (-not (Test-Path $tplPath)) { throw "টেমপ্লেট নেই: $tplPath" }

$html = [System.IO.File]::ReadAllText($tplPath, [System.Text.Encoding]::UTF8)

# লোগো SVG data URI হিসেবে — বাইরের ফাইল রেফারেন্স করলে
# হেডলেস রেন্ডারে টাইমিংয়ের কারণে মাঝে মাঝে লোড হওয়ার আগেই স্ক্রিনশট হয়ে যায়
if (-not $LogoPath) { $LogoPath = Join-Path $root "assets\logo-tight.svg" }
if (-not (Test-Path $LogoPath)) { throw "লোগো পাওয়া যায়নি: $LogoPath" }
$logoSvg = [System.IO.File]::ReadAllText($LogoPath, [System.Text.Encoding]::UTF8)
$logoUri = "data:image/svg+xml;base64," + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($logoSvg))

$bnDate = (Get-Date).ToString("dd/MM/yyyy")
$repl = @{
    "{{IMAGE}}"    = $dataUri
    "{{LOGO}}"     = $logoUri
    "{{CATEGORY}}" = (Escape-Html $Category)
    "{{HEADLINE}}" = (Escape-Html $Headline)
    "{{SOURCE}}"   = (Escape-Html $Source)
    "{{DATE}}"     = $bnDate
    "{{ACCENT}}"   = $Accent
    "{{FONTSIZE}}" = (Get-FontSize $Headline)
}
foreach ($k in $repl.Keys) { $html = $html.Replace($k, [string]$repl[$k]) }

# রেন্ডারের জন্য অস্থায়ী HTML
$tmp = Join-Path $env:TEMP ("card-" + [guid]::NewGuid().ToString("N") + ".html")
[System.IO.File]::WriteAllText($tmp, $html, (New-Object System.Text.UTF8Encoding($false)))

$outFull = $Out
if (-not [System.IO.Path]::IsPathRooted($outFull)) { $outFull = Join-Path (Get-Location) $Out }
$outDir = Split-Path -Parent $outFull
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
if (Test-Path $outFull) { Remove-Item $outFull -Force }

$edge = Find-Edge
$fileUrl = "file:///" + ($tmp -replace '\\', '/')

# Start-Process ব্যবহার করছি, `& $edge ... 2>&1` নয়:
# PS 5.1-এ native exe-র stderr রিডাইরেক্ট করলে সফল রানও NativeCommandError
# হিসেবে থ্রো করে (Edge স্ক্রিনশটের বার্তা stderr-এ লেখে)।
$edgeArgs = @(
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--window-size=1080,1080",
    "--screenshot=`"$outFull`"", "`"$fileUrl`""
)
Start-Process -FilePath $edge -ArgumentList $edgeArgs -Wait -NoNewWindow | Out-Null

# Edge স্ক্রিনশট অ্যাসিঙ্ক্রোনাসভাবে লেখে — ফাইল আসা পর্যন্ত অপেক্ষা
$waited = 0
while (-not (Test-Path $outFull) -and $waited -lt 20) { Start-Sleep -Milliseconds 400; $waited++ }
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $outFull)) { throw "কার্ড রেন্ডার হয়নি: $outFull" }

$style = "text-only"
if ($usephoto) { $style = "photo" }
$size = (Get-Item $outFull).Length
Write-Host "    কার্ড তৈরি [$style]  $([math]::Round($size/1KB))KB  ->  $outFull" -ForegroundColor Green
return $outFull
