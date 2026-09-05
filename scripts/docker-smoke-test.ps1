# =========================================================================
# OpsHardener.dev — Production Docker Container Smoke Test (PowerShell)
# Validates container build, execution, HTTP responses, assets, and security
# =========================================================================

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[-] ERROR: 'docker' command is not available in PATH on this system." -ForegroundColor Red
    Write-Host "    Cannot execute live Docker image build or container smoke test." -ForegroundColor Red
    exit 1
}

$ImageName = "opshardener-dev:smoke-test"
$ContainerName = "opshardener-smoke-instance"
$HostPort = if ($env:HOST_PORT) { $env:HOST_PORT } else { 8080 }
$MaxWaitSeconds = 20

function Cleanup {
    Write-Host "[*] Cleaning up smoke test container..." -ForegroundColor Yellow
    docker rm -f $ContainerName 2>$null | Out-Null
}

try {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Step 1: Building Docker Image ($ImageName)" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    docker build -t $ImageName .

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Step 2: Starting Container on host port $HostPort" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    docker run -d --name $ContainerName -p "${HostPort}:8080" $ImageName

    Write-Host "[*] Waiting for container to become healthy (up to $MaxWaitSeconds s)..." -ForegroundColor Yellow
    $ready = $false
    for ($i = 1; $i -le $MaxWaitSeconds; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$HostPort/healthz" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200 -and $resp.Content -match "healthy") {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $ready) {
        Write-Host "[-] Container failed to become healthy within $MaxWaitSeconds seconds!" -ForegroundColor Red
        docker logs $ContainerName
        exit 1
    }
    Write-Host "[+] Health check endpoint (/healthz) responded with HTTP 200 OK." -ForegroundColor Green

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Step 3: Validating Root Application Request (/)" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    $root = Invoke-WebRequest -Uri "http://127.0.0.1:$HostPort/" -UseBasicParsing
    if ($root.Content -match "OpsHardener.dev") {
        Write-Host "[+] Root application HTML served successfully (Status 200)." -ForegroundColor Green
    } else {
        throw "Root page did not contain expected OpsHardener.dev title."
    }

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Step 4: Validating SPA Route Fallback (/audit/nginx)" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    $spa = Invoke-WebRequest -Uri "http://127.0.0.1:$HostPort/audit/nginx" -UseBasicParsing
    if ($spa.StatusCode -eq 200 -and $spa.Content -match "OpsHardener.dev") {
        Write-Host "[+] SPA route fallback succeeded: Status 200 with index.html content." -ForegroundColor Green
    } else {
        throw "SPA fallback failed. Status: $($spa.StatusCode)"
    }

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Step 5: Validating Security Headers on SPA Route" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    $xfo = $spa.Headers["X-Frame-Options"]
    $xcto = $spa.Headers["X-Content-Type-Options"]
    if (($xfo -join "") -match "DENY" -and ($xcto -join "") -match "nosniff") {
        Write-Host "[+] Security headers verified on SPA route: X-Frame-Options=DENY, X-Content-Type-Options=nosniff" -ForegroundColor Green
    } else {
        throw "Security headers missing from SPA response"
    }

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Step 6: Validating Static Asset Serving & Security Headers (/assets/*)" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    $assetList = docker exec $ContainerName ls /usr/share/nginx/html/assets
    $firstAsset = ($assetList -split "\s+" | Where-Object { $_ -match "\.(js|css)$" } | Select-Object -First 1).Trim()
    if ($firstAsset) {
        $assetResp = Invoke-WebRequest -Uri "http://127.0.0.1:$HostPort/assets/$firstAsset" -UseBasicParsing
        $cc = $assetResp.Headers["Cache-Control"]
        $assetXfo = $assetResp.Headers["X-Frame-Options"]
        $assetXcto = $assetResp.Headers["X-Content-Type-Options"]

        if ($assetResp.StatusCode -eq 200 -and ($cc -join "") -match "immutable") {
            Write-Host "[+] Static asset /assets/$firstAsset served with immutable caching." -ForegroundColor Green
        } else {
            throw "Static asset caching header missing on /assets/$firstAsset"
        }

        if (($assetXfo -join "") -match "DENY" -and ($assetXcto -join "") -match "nosniff") {
            Write-Host "[+] Security headers verified on /assets/$firstAsset: X-Frame-Options and X-Content-Type-Options present." -ForegroundColor Green
        } else {
            throw "Security headers missing from static asset response!"
        }
    } else {
        Write-Host "[!] No static assets found in /usr/share/nginx/html/assets" -ForegroundColor Yellow
    }

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Step 7: Verifying Non-Root Execution & Port 8080" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    $uid = (docker exec $ContainerName id -u 2>$null).Trim()
    if ($uid -eq "101" -or ($uid -ne "0" -and $uid -ne "")) {
        Write-Host "[+] Process confirmed running as unprivileged non-root user (UID: $uid) on port 8080." -ForegroundColor Green
    } else {
        throw "Container process is running as root (UID: $uid)"
    }

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "[SUCCESS] All container smoke tests passed successfully!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
}
finally {
    Cleanup
}
