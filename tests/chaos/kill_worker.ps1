param (
    [int] = 50,
    [string]
)

if (-not $Token) {
    Write-Host "Please provide a valid Admin JWT token." -ForegroundColor Red
    exit 1
}

Write-Host "Running Chaos Experiment: Killing $Percent% of workers..." -ForegroundColor Yellow

$Headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}

$Body = @{
    percent = $Percent
} | ConvertTo-Json

try {
    $Response = Invoke-RestMethod -Uri "http://localhost:8080/simulation/chaos/kill-workers" -Method Post -Headers $Headers -Body $Body
    Write-Host "Killed $($Response.killedCount) workers successfully." -ForegroundColor Green
    Write-Host ($Response.killedIds | Out-String)
} catch {
    Write-Host "Chaos injection failed: $(_)" -ForegroundColor Red
}
