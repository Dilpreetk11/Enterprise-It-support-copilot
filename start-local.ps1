param([int]$ApiPort = 8080, [int]$FrontendPort = 3000)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'frontend'
$pythonExe = $null
foreach ($candidate in @('.venv/Scripts/python.exe', 'venv/Scripts/python.exe')) {
    $candidatePath = Join-Path $projectRoot $candidate
    if (Test-Path -LiteralPath $candidatePath) { $pythonExe = $candidatePath; break }
}
if (-not $pythonExe) { $pythonExe = (Get-Command python -ErrorAction Stop).Source }
$npmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
$backendProcess = $null
$previousApiBase = $env:NEXT_PUBLIC_API_BASE_URL
$apiUrl = "http://127.0.0.1:$ApiPort"
function Test-CopilotApi {
    try {
        $health = Invoke-RestMethod "$apiUrl/api/health" -TimeoutSec 2
        return $health.status -eq 'ok'
    } catch { return $false }
}
try {
    if (-not (Test-CopilotApi)) {
        Write-Host "Starting Python API on $apiUrl ..." -ForegroundColor Cyan
        $backendProcess = Start-Process -FilePath $pythonExe -WorkingDirectory $projectRoot -ArgumentList @('-m','uvicorn','app.frontend_api:app','--host','127.0.0.1','--port',"$ApiPort") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.local-backend.stdout.log') -RedirectStandardError (Join-Path $projectRoot '.local-backend.stderr.log')
        $deadline = (Get-Date).AddSeconds(120)
        while (-not (Test-CopilotApi)) {
            $backendProcess.Refresh()
            if ($backendProcess.HasExited) {
                Get-Content (Join-Path $projectRoot '.local-backend.stderr.log') -Tail 25
                throw 'Backend startup failed. Install Python requirements with: python -m pip install -r requirements.txt'
            }
            if ((Get-Date) -gt $deadline) { throw 'Backend did not become ready. Check .local-backend.stderr.log.' }
            Start-Sleep -Seconds 1
        }
    }
    Write-Host "API connected: $apiUrl" -ForegroundColor Green
    if (-not (Test-Path -LiteralPath (Join-Path $frontendRoot 'node_modules/next/package.json'))) {
        Push-Location $frontendRoot
        try { & $npmExe ci; if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' } } finally { Pop-Location }
    }
    $env:NEXT_PUBLIC_API_BASE_URL = $apiUrl
    Write-Host "Frontend: http://localhost:$FrontendPort (Ctrl+C stops services started here)" -ForegroundColor Cyan
    $frontendRunning = $false
    try { $frontendRunning = (Invoke-WebRequest "http://127.0.0.1:$FrontendPort" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { }
    if ($frontendRunning) {
        Write-Host 'Frontend is already running. Refresh the browser.' -ForegroundColor Green
        if ($backendProcess) {
            while (-not $backendProcess.HasExited) { Start-Sleep -Seconds 2; $backendProcess.Refresh() }
        }
        return
    }
    Push-Location $frontendRoot
    try { & $npmExe run dev -- --port $FrontendPort; if ($LASTEXITCODE -ne 0) { throw 'Frontend failed to start. Stop any existing server on the selected port.' } } finally { Pop-Location }
} finally {
    $env:NEXT_PUBLIC_API_BASE_URL = $previousApiBase
    if ($backendProcess -and -not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id }
}
