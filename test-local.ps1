# API Gateway Local Test Suite (PowerShell)
$baseUrl = "http://localhost:3000"

Clear-Host
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   API Gateway Local Test Suite (PowerShell)      " -ForegroundColor Cyan
Write-Host "   Target URL: $baseUrl" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check connectivity
try {
    $res = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 5
    Write-Host "✓ Connected to API Gateway!" -ForegroundColor Green
} catch {
    Write-Host "✗ Cannot reach $baseUrl" -ForegroundColor Red
    Write-Host "Make sure the gateway is running by double-clicking 'run-local.bat' first!" -ForegroundColor Yellow
    Exit
}

Write-Host ""
Write-Host "========== GET /health ==========" -ForegroundColor Gray
try {
    $res = Invoke-WebRequest -Uri "$baseUrl/health" -Method Get
    Write-Host "✓ Health Check (status: $($res.StatusCode))" -ForegroundColor Green
    Write-Host $res.Content -ForegroundColor White
} catch {
    Write-Host "✗ Health Check Failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "========== GET /metrics ==========" -ForegroundColor Gray
try {
    $res = Invoke-WebRequest -Uri "$baseUrl/metrics" -Method Get
    Write-Host "✓ Metrics (status: $($res.StatusCode))" -ForegroundColor Green
    Write-Host $res.Content -ForegroundColor White
} catch {
    Write-Host "✗ Metrics Failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "========== POST /infer - Valid Requests ==========" -ForegroundColor Gray
$payloads = @(
    @{ name = "Minimal Request"; body = @{ prompt = "What is 2+2?" } },
    @{ name = "With max_tokens"; body = @{ prompt = "Explain cloud computing in one sentence."; max_tokens = 50 } },
    @{ name = "With temperature"; body = @{ prompt = "Hello world"; temperature = 0.5 } }
)

foreach ($p in $payloads) {
    try {
        $json = $p.body | ConvertTo-Json
        $res = Invoke-WebRequest -Uri "$baseUrl/infer" -Method Post -Body $json -ContentType "application/json"
        Write-Host "✓ $($p.name) (status: $($res.StatusCode))" -ForegroundColor Green
        Write-Host $res.Content -ForegroundColor White
    } catch {
         Write-Host "✗ $($p.name) Failed: $_" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host ""
Write-Host "========== POST /infer - Validation Errors ==========" -ForegroundColor Gray
$badPayloads = @(
    @{ name = "Empty body"; body = "{}" },
    @{ name = "Empty prompt"; body = '{"prompt": ""}' },
    @{ name = "max_tokens too high"; body = '{"prompt": "Hello", "max_tokens": 513}' },
    @{ name = "temperature too low"; body = '{"prompt": "Hello", "temperature": -0.1}' }
)

foreach ($bp in $badPayloads) {
    try {
        # SkipHttpErrorCheck is supported in newer PS; using try/catch wrapper for compatibility
        $res = Invoke-WebRequest -Uri "$baseUrl/infer" -Method Post -Body $bp.body -ContentType "application/json" -ErrorAction Stop
        Write-Host "✗ $($bp.name) returned unexpected success status $($res.StatusCode)" -ForegroundColor Red
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.Value__
        if ($statusCode -eq 400) {
             Write-Host "✓ $($bp.name) correctly rejected with status 400 (Validation Error)" -ForegroundColor Green
             # Read the error content
             $stream = $_.Exception.Response.GetResponseStream()
             $reader = New-Object System.IO.StreamReader($stream)
             $errText = $reader.ReadToEnd()
             Write-Host "  Response: $errText" -ForegroundColor Yellow
        } else {
             Write-Host "✗ $($bp.name) returned unexpected status code: $statusCode" -ForegroundColor Red
        }
    }
    Write-Host ""
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   Testing Completed!" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
