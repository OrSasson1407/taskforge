Write-Host "Starting Phase 11 Performance & Chaos Test Suite..." -ForegroundColor Cyan

# This script assumes a running local stack.
# 1. Login to get token
$LoginBody = @{ username = "admin"; password = "admin" } | ConvertTo-Json
$LoginRes = Invoke-RestMethod -Uri "http://localhost:8080/auth/login" -Method Post -Body $LoginBody -ContentType "application/json"
$Token = $LoginRes.token

Write-Host "1. Submitting burst of jobs (Experiment 1)..."
for ($i=0; $i -lt 100; $i++) {
    Invoke-RestMethod -Uri "http://localhost:8080/jobs" -Method Post -Headers @{ Authorization = "Bearer $Token" } -Body '{"payload": {"test": "perf"}}' -ContentType "application/json" -Quiet
}
Write-Host "Burst submitted."

Write-Host "2. Triggering Chaos..."
.\tests\chaos\kill_worker.ps1 -Percent 50 -Token $Token

Write-Host "3. Forcing System Sweep to reclaim jobs (Fault Tolerance)..."
Invoke-RestMethod -Uri "http://localhost:8080/system/sweep" -Method Post -Headers @{ Authorization = "Bearer $Token" } -Quiet

Write-Host "Phase 11 Experiments executed." -ForegroundColor Green
