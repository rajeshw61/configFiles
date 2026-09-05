#!/usr/bin/env bash
# =========================================================================
# OpsHardener.dev — Production Docker Container Smoke Test
# Validates container build, execution, HTTP responses, assets, and security
# =========================================================================

set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "[-] ERROR: 'docker' command is not available in PATH on this system."
  echo "    Cannot execute live Docker image build or container smoke test."
  exit 1
fi

IMAGE_NAME="opshardener-dev:smoke-test"
CONTAINER_NAME="opshardener-smoke-instance"
HOST_PORT="${HOST_PORT:-8080}"
MAX_WAIT_SECONDS=20

cleanup() {
  echo "[*] Cleaning up smoke test container..."
  docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true
}
trap cleanup EXIT

echo "=========================================================="
echo "Step 1: Building Docker Image (${IMAGE_NAME})"
echo "=========================================================="
docker build -t "${IMAGE_NAME}" .

echo "=========================================================="
echo "Step 2: Starting Container on host port ${HOST_PORT}"
echo "=========================================================="
docker run -d \
  --name "${CONTAINER_NAME}" \
  -p "${HOST_PORT}:8080" \
  "${IMAGE_NAME}"

echo "[*] Waiting for container to become healthy..."
READY=0
for i in $(seq 1 "${MAX_WAIT_SECONDS}"); do
  if curl -s -f "http://127.0.0.1:${HOST_PORT}/healthz" > /dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "${READY}" -ne 1 ]; then
  echo "[-] Container failed to respond within ${MAX_WAIT_SECONDS} seconds!"
  docker logs "${CONTAINER_NAME}"
  exit 1
fi
echo "[+] Health check endpoint (/healthz) responded with HTTP 200 OK."

echo "=========================================================="
echo "Step 3: Validating Root Application Request (/)"
echo "=========================================================="
ROOT_RESPONSE=$(curl -s "http://127.0.0.1:${HOST_PORT}/")
if echo "${ROOT_RESPONSE}" | grep -q "OpsHardener.dev"; then
  echo "[+] Root request successfully served application HTML."
else
  echo "[-] Root request did not return expected application content!"
  exit 1
fi

echo "=========================================================="
echo "Step 4: Validating Client-Side SPA Route Fallback (/audit/nginx)"
echo "=========================================================="
SPA_HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${HOST_PORT}/audit/nginx")
SPA_RESPONSE=$(curl -s "http://127.0.0.1:${HOST_PORT}/audit/nginx")

if [ "${SPA_HTTP_STATUS}" -eq 200 ] && echo "${SPA_RESPONSE}" | grep -q "OpsHardener.dev"; then
  echo "[+] SPA client-side route (/audit/nginx) returned HTTP 200 with index.html fallback."
else
  echo "[-] SPA route returned HTTP status ${SPA_HTTP_STATUS} instead of 200 fallback!"
  exit 1
fi

echo "=========================================================="
echo "Step 5: Validating Security Headers on SPA Route"
echo "=========================================================="
HEADERS=$(curl -s -I "http://127.0.0.1:${HOST_PORT}/audit/nginx")
if echo "${HEADERS}" | grep -i -q "X-Frame-Options: DENY" && \
   echo "${HEADERS}" | grep -i -q "X-Content-Type-Options: nosniff"; then
  echo "[+] Security headers verified on SPA route: X-Frame-Options and X-Content-Type-Options present."
else
  echo "[-] Expected security headers missing from SPA response!"
  echo "${HEADERS}"
  exit 1
fi

echo "=========================================================="
echo "Step 6: Validating Static Asset Serving & Security Headers (/assets/*)"
echo "=========================================================="
FIRST_ASSET=$(docker exec "${CONTAINER_NAME}" ls /usr/share/nginx/html/assets | grep -E '\.(js|css)$' | head -n 1 || true)
if [ -n "${FIRST_ASSET}" ]; then
  ASSET_HEADERS=$(curl -s -I "http://127.0.0.1:${HOST_PORT}/assets/${FIRST_ASSET}")
  if echo "${ASSET_HEADERS}" | grep -i -q "Cache-Control:.*immutable" && \
     echo "${ASSET_HEADERS}" | grep -i -q "X-Frame-Options: DENY" && \
     echo "${ASSET_HEADERS}" | grep -i -q "X-Content-Type-Options: nosniff"; then
    echo "[+] Static asset (/assets/${FIRST_ASSET}) served with immutable caching and security headers."
  else
    echo "[-] Asset response missing required caching or security headers!"
    echo "${ASSET_HEADERS}"
    exit 1
  fi
fi

echo "=========================================================="
echo "Step 7: Verifying Non-Root Execution & Port 8080"
echo "=========================================================="
RUNNING_USER=$(docker exec "${CONTAINER_NAME}" id -u 2>/dev/null || echo "unknown")
if [ "${RUNNING_USER}" = "101" ] || ([ "${RUNNING_USER}" != "0" ] && [ "${RUNNING_USER}" != "unknown" ]); then
  echo "[+] Process confirmed running as unprivileged non-root user (UID: ${RUNNING_USER}) on port 8080."
else
  echo "[-] Warning: Process is running as root (UID: ${RUNNING_USER})!"
  exit 1
fi

echo "=========================================================="
echo "[SUCCESS] All container smoke tests passed successfully!"
echo "=========================================================="
