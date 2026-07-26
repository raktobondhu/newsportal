<#
.SYNOPSIS
  Facebook Page টোকেন সেটআপ — short-lived token থেকে permanent Page token বের করে।

.DESCRIPTION
  ধাপ ১: short-lived user token  ->  long-lived user token (৬০ দিন)
  ধাপ ২: long-lived user token   ->  Page token (মেয়াদ শেষ হয় না)
  ধাপ ৩: debug_token দিয়ে যাচাই — সত্যিই permanent কিনা
  ধাপ ৪: (ঐচ্ছিক) একটা টেস্ট পোস্ট

.EXAMPLE
  .\fb-token-setup.ps1 -AppId 1234567890 -AppSecret abc123 -ShortToken EAAG...

.EXAMPLE
  .\fb-token-setup.ps1 -AppId 1234567890 -AppSecret abc123 -ShortToken EAAG... -TestPost
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AppId,
    [Parameter(Mandatory = $true)][string]$AppSecret,
    [Parameter(Mandatory = $true)][string]$ShortToken,
    [string]$ApiVersion = "v24.0",
    [switch]$TestPost
)

$ErrorActionPreference = "Stop"
$base = "https://graph.facebook.com/$ApiVersion"

function Write-Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)       { Write-Host "    OK   $msg" -ForegroundColor Green }
function Write-Warn2($msg)    { Write-Host "    WARN $msg" -ForegroundColor Yellow }
function Mask($t) {
    if ([string]::IsNullOrEmpty($t)) { return "(empty)" }
    if ($t.Length -le 14) { return "***" }
    return $t.Substring(0, 8) + "..." + $t.Substring($t.Length - 6) + "  (len=$($t.Length))"
}

# Graph API-র আসল এরর মেসেজ PS 5.1-এ $_.ErrorDetails.Message-এ থাকে,
# $_.Exception.Message-এ শুধু "400 Bad Request" আসে — তাই ওটাই আগে দেখি।
function Show-GraphError($err) {
    $raw = $err.ErrorDetails.Message
    if (-not $raw) { $raw = $err.Exception.Message }

    Write-Host "`n    FACEBOOK ERROR:" -ForegroundColor Red
    try {
        $e = ($raw | ConvertFrom-Json).error
        Write-Host "    message : $($e.message)" -ForegroundColor Red
        Write-Host "    type    : $($e.type)   code: $($e.code)" -ForegroundColor Red
        if ($e.error_user_msg) { Write-Host "    details : $($e.error_user_msg)" -ForegroundColor Red }
    } catch {
        Write-Host "    $raw" -ForegroundColor Red
    }
}

function Invoke-Graph($url) {
    try {
        return Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
    } catch {
        Show-GraphError $_
        Write-Host "`n    থেমে গেল। উপরের মেসেজটা আমাকে পাঠান।" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "===========================================" -ForegroundColor White
Write-Host " Facebook Page Token Setup" -ForegroundColor White
Write-Host " API version: $ApiVersion" -ForegroundColor DarkGray
Write-Host "===========================================" -ForegroundColor White

# ---------------------------------------------------------------
Write-Step 1 "Short-lived token -> Long-lived user token"

$url = "$base/oauth/access_token?grant_type=fb_exchange_token" +
       "&client_id=$AppId&client_secret=$AppSecret&fb_exchange_token=$ShortToken"
$resp = Invoke-Graph $url
$longUserToken = $resp.access_token

if (-not $longUserToken) { throw "long-lived token পাওয়া যায়নি।" }
Write-Ok "long-lived user token: $(Mask $longUserToken)"
if ($resp.expires_in) {
    $days = [math]::Round($resp.expires_in / 86400, 1)
    Write-Ok "মেয়াদ: ~$days দিন (এটা মাঝের ধাপ, শেষ টোকেন না)"
}

# ---------------------------------------------------------------
Write-Step 2 "আপনার Page-গুলো আর তাদের Page token আনছি"

$resp = Invoke-Graph "$base/me/accounts?fields=id,name,access_token,tasks&access_token=$longUserToken"
$pages = @($resp.data)

if ($pages.Count -eq 0) {
    Write-Warn2 "কোনো Page পাওয়া যায়নি!"
    Write-Host @"

    সম্ভাব্য কারণ:
      - টোকেন নেওয়ার সময় pages_show_list পারমিশন দেননি
      - Graph Explorer-এ পেজটা সিলেক্ট করেননি ('Opt in to all' বেছে নিন)
      - আপনি ঐ পেজের admin না
"@ -ForegroundColor Yellow
    exit 1
}

Write-Ok "$($pages.Count) টা Page পাওয়া গেছে:"
$i = 0
foreach ($p in $pages) {
    $i++
    $canPost = $false
    if ($p.tasks -and ($p.tasks -contains "CREATE_CONTENT")) { $canPost = $true }
    $flag = "  <-- পোস্ট করার অনুমতি নেই"
    if ($canPost) { $flag = "" }
    Write-Host "      $i. $($p.name)   (id: $($p.id))$flag" -ForegroundColor White
}

# একাধিক পেজ থাকলে প্রথম যেটায় পোস্ট করা যায় সেটা নিই
$target = $pages | Where-Object { $_.tasks -contains "CREATE_CONTENT" } | Select-Object -First 1
if (-not $target) {
    Write-Warn2 "কোনো পেজেই CREATE_CONTENT পারমিশন নেই — pages_manage_posts দেওয়া হয়নি।"
    exit 1
}
Write-Ok "বেছে নেওয়া হলো: $($target.name)  (id: $($target.id))"
$pageToken = $target.access_token

# ---------------------------------------------------------------
Write-Step 3 "Page token যাচাই — সত্যিই permanent কিনা?"

$dbg = Invoke-Graph "$base/debug_token?input_token=$pageToken&access_token=$AppId|$AppSecret"
$d = $dbg.data

Write-Host "    type       : $($d.type)"
Write-Host "    app_id     : $($d.app_id)"
Write-Host "    is_valid   : $($d.is_valid)"
Write-Host "    scopes     : $($d.scopes -join ', ')"

$isPermanent = $false
if ($null -eq $d.expires_at -or $d.expires_at -eq 0) { $isPermanent = $true }

if ($isPermanent) {
    Write-Ok "expires_at = 0  ->  এই টোকেনের মেয়াদ শেষ হবে না. একদম যা চেয়েছিলাম।"
} else {
    $exp = ([datetimeoffset]::FromUnixTimeSeconds($d.expires_at)).LocalDateTime
    Write-Warn2 "মেয়াদ শেষ হবে: $exp  — permanent হয়নি, নিচের নোট দেখুন।"
}

# pages_manage_engagement ছাড়া পোস্টের নিচে কমেন্ট করা যায় না (403, code 200),
# আর সাইটের লিংক ওই কমেন্টেই যায়। আগে এটা তালিকায় ছিল না, ফলে স্ক্রিপ্ট
# "সব পারমিশন আছে" বলে দিত অথচ কমেন্ট কোনোদিন যেত না।
$needed = @("pages_manage_posts", "pages_read_engagement", "pages_show_list", "pages_manage_engagement")
$missing = $needed | Where-Object { $d.scopes -notcontains $_ }
if ($missing.Count -gt 0) {
    Write-Warn2 "যেসব পারমিশন নেই: $($missing -join ', ')"
} else {
    Write-Ok "দরকারি সব পারমিশন আছে।"
}

# ---------------------------------------------------------------
Write-Step 4 ".env.local ফাইলে সেভ করছি"

$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env.local"

# ফাইলটা নতুন করে লেখা যাবে না — এখানে Gemini, Groq, Supabase-এর key-ও
# থাকে। আগে পুরো ফাইল ওভাররাইট করা হতো, ফলে টোকেন নবায়ন করলেই বাকি সব
# মুছে যেত আর পাইপলাইন "কোনো LLM key নেই" বলে থেমে যেত।
# তাই কেবল FB_* লাইনগুলো বদলাই, বাকিটা যেমন আছে তেমন রাখি।
$existing = @()
if (Test-Path $envPath) {
    $existing = [System.IO.File]::ReadAllLines($envPath, [System.Text.Encoding]::UTF8) |
        Where-Object { $_ -notmatch '^(FB_PAGE_ID|FB_PAGE_NAME|FB_PAGE_TOKEN|FB_API_VERSION)=' -and
                       $_ -notmatch '^# Facebook Page - generated by' -and
                       $_ -notmatch '^# WARNING: never commit' }
}

$fbLines = @(
    # .env ফাইলের কমেন্ট ইংরেজিতে রাখছি — অনেক এডিটর/টুল ANSI ধরে পড়ে,
    # তখন বাংলা কমেন্ট ভাঙা দেখায়।
    "# Facebook Page - generated by fb-token-setup.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    "# WARNING: never commit this file to git, never share it.",
    "FB_PAGE_ID=$($target.id)",
    "FB_PAGE_NAME=$($target.name)",
    "FB_PAGE_TOKEN=$pageToken",
    "FB_API_VERSION=$ApiVersion"
)

$lines = $fbLines + $existing
# BOM ছাড়া লিখতে হবে — নাহলে dotenv প্রথম key-টা '﻿FB_PAGE_ID' হিসেবে পড়বে
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($envPath, $lines, $utf8NoBom)

$kept = ($existing | Where-Object { $_ -match '^[A-Z_]+=' }).Count
Write-Ok "সেভ হয়েছে: $envPath  (অন্য $kept টি সেটিং অক্ষত রাখা হয়েছে)"

# ---------------------------------------------------------------
if ($TestPost) {
    Write-Step 5 "টেস্ট পোস্ট পাঠাচ্ছি"

    $msg = "টেস্ট পোস্ট — অটোমেশন সেটআপ যাচাই করা হচ্ছে। $(Get-Date -Format 'HH:mm')"
    $body = @{ message = $msg; access_token = $pageToken }
    try {
        $r = Invoke-RestMethod -Uri "$base/$($target.id)/feed" -Method Post -Body $body -TimeoutSec 30
        Write-Ok "পোস্ট সফল! post id: $($r.id)"
        Write-Host "    দেখুন: https://facebook.com/$($r.id)" -ForegroundColor White
        Write-Host "`n    (টেস্ট পোস্টটা পেজ থেকে মুছে ফেলতে ভুলবেন না)" -ForegroundColor DarkGray
    } catch {
        Write-Host "    POST ব্যর্থ।" -ForegroundColor Red
        Show-GraphError $_
    }
} else {
    Write-Host "`n    টেস্ট পোস্ট দিতে আবার চালান -TestPost দিয়ে।" -ForegroundColor DarkGray
}

Write-Host "`n===========================================" -ForegroundColor White
Write-Host " শেষ।" -ForegroundColor White
Write-Host "===========================================" -ForegroundColor White
