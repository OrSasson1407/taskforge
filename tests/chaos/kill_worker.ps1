# Chaos Test: Simulates sudden worker death mid-execution[cite: 3]
Write-Host "Initiating Chaos Test: Killing a worker container..." -ForegroundColor Yellow

$workers = docker ps -q -f "name=worker"
if (-not $workers) {
    Write-Host "No active workers found." -ForegroundColor Red
    exit 1
}

# Pick the first worker to kill
$target = $workers[0]
Write-Host "Killing worker container: $target"
docker kill $target | Out-Null

Write-Host "Worker killed. Monitor dashboard to verify Failure Detector reclaims its jobs within the 10s timeout + 15s suspicion window." -ForegroundColor Green
