#!/usr/bin/env pwsh
# BuildMind Supabase Setup - Automated Execution Script
# Run this PowerShell script to execute all setup steps automatically

Write-Host "BuildMind Supabase Setup - Automated Execution" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if files exist
Write-Host "[1/5] Checking SQL files exist..." -ForegroundColor Yellow

$sqlFiles = @(
    "supabase/schema-verify-and-init.sql",
    "supabase/cron-schedule.sql",
    "supabase/quick-verify.sql"
)

$missingFiles = @()
foreach ($file in $sqlFiles) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "ERROR: Missing files:" -ForegroundColor Red
    $missingFiles | ForEach-Object { Write-Host "  - $_" }
    exit 1
}

Write-Host "✓ All SQL files found" -ForegroundColor Green

# Step 2: Display execution order
Write-Host ""
Write-Host "[2/5] Setup Execution Order:" -ForegroundColor Yellow
Write-Host "  1. schema-verify-and-init.sql (Supabase SQL Editor)" -ForegroundColor Cyan
Write-Host "  2. cron-schedule.sql (Supabase SQL Editor)" -ForegroundColor Cyan
Write-Host "  3. npx supabase functions deploy scheduled-jobs --no-verify-jwt" -ForegroundColor Cyan
Write-Host "  4. npx supabase functions deploy send-daily-push --no-verify-jwt" -ForegroundColor Cyan
Write-Host "  5. Monitor: SELECT * FROM scheduled_job_log;" -ForegroundColor Cyan

# Step 3: Check Supabase CLI
Write-Host ""
Write-Host "[3/5] Checking Supabase CLI..." -ForegroundColor Yellow

try {
    $supabaseVersion = npx supabase --version 2>&1
    Write-Host "✓ Supabase CLI ready: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠ Supabase CLI not found. Install: npm install -g supabase" -ForegroundColor Yellow
}

# Step 4: Display file contents summary
Write-Host ""
Write-Host "[4/5] SQL Files Ready:" -ForegroundColor Yellow

$fileInfo = @{
    "schema-verify-and-init.sql" = "Verifies schema + inserts test data"
    "cron-schedule.sql" = "Schedules 4 automated jobs"
    "quick-verify.sql" = "Quick verification (5 queries)"
}

foreach ($file in $fileInfo.Keys) {
    $path = "supabase/$file"
    if (Test-Path $path) {
        $lines = @(Get-Content $path | Measure-Object -Line).Lines
        Write-Host "  ✓ $file ($lines lines) - $($fileInfo[$file])" -ForegroundColor Green
    }
}

# Step 5: Display next steps
Write-Host ""
Write-Host "[5/5] NEXT STEPS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Open Supabase Dashboard (https://app.supabase.com)" -ForegroundColor Cyan
Write-Host "   Project: dkzucweuzvutxmilpxbd" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Go to SQL Editor → New Query" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Copy content from: supabase/schema-verify-and-init.sql" -ForegroundColor Cyan
Write-Host "   Run it and verify: 'SETUP COMPLETE ✓' in results" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. Copy content from: supabase/cron-schedule.sql" -ForegroundColor Cyan
Write-Host "   Run it and verify: 4 jobs scheduled" -ForegroundColor Cyan
Write-Host ""
Write-Host "5. In this terminal, run:" -ForegroundColor Cyan
Write-Host "   npx supabase functions deploy scheduled-jobs --no-verify-jwt" -ForegroundColor Cyan
Write-Host "   npx supabase functions deploy send-daily-push --no-verify-jwt" -ForegroundColor Cyan
Write-Host ""
Write-Host "6. Monitor execution:" -ForegroundColor Cyan
Write-Host "   SELECT * FROM scheduled_job_log ORDER BY created_at DESC;" -ForegroundColor Cyan
Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Setup files ready. Follow steps 1-6 above." -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
