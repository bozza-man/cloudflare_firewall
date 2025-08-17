#!/bin/bash

# Certificate Monitor for SimpleMDM
# Monitors certificate health on macOS, iOS, and tvOS devices

set -euo pipefail

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1: $2"
    logger -t CertMonitor "$1: $2"
}

log_message "INFO" "Starting Certificate Health Monitor"

# Get device info
OS_NAME=$(uname -s)
if [[ "$OS_NAME" == "Darwin" ]]; then
    DEVICE_NAME=$(scutil --get ComputerName 2>/dev/null || echo "Unknown")
    SERIAL_NUMBER=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Serial Number" | awk '{print $4}' | head -1 || echo "Unknown")
    PRODUCT_NAME=$(sw_vers -productName 2>/dev/null || echo "Unknown")
    OS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "Unknown")
fi

log_message "INFO" "Device: $DEVICE_NAME ($PRODUCT_NAME $OS_VERSION)"

# Check System keychain certificates
if [[ "$PRODUCT_NAME" == *"macOS"* ]]; then
    log_message "INFO" "Checking System keychain certificates"
    
    TOTAL_CERTS=0
    EXPIRED_CERTS=0
    CLOUDFLARE_FOUND=false
    
    # Count certificates
    CERT_LIST=$(security find-certificate -a /Library/Keychains/System.keychain 2>/dev/null | grep -E "(alis|labl)" | grep -E "=\".*\"" | sed 's/.*="\(.*\)".*/\1/' | sort -u || echo "")
    
    if [[ -n "$CERT_LIST" ]]; then
        while IFS= read -r cert_name; do
            [[ -z "$cert_name" ]] && continue
            TOTAL_CERTS=$((TOTAL_CERTS + 1))
            
            # Check for Cloudflare certificate
            if [[ "$cert_name" == *"Cloudflare"* ]]; then
                CLOUDFLARE_FOUND=true
                log_message "INFO" "Cloudflare Gateway CA: FOUND"
            fi
            
            # Check expiration
            EXPIRY_INFO=$(security find-certificate -c "$cert_name" -p /Library/Keychains/System.keychain 2>/dev/null | openssl x509 -enddate -noout 2>/dev/null || echo "")
            if [[ "$EXPIRY_INFO" == *"Jan 01 00:00:00 1970"* ]] || [[ "$EXPIRY_INFO" == *"Dec 31"* ]]; then
                EXPIRED_CERTS=$((EXPIRED_CERTS + 1))
                log_message "WARNING" "Certificate may be expired: $cert_name"
            fi
        done <<< "$CERT_LIST"
    fi
    
    log_message "INFO" "System Keychain: $TOTAL_CERTS total certificates, $EXPIRED_CERTS potentially expired"
    
    if [[ "$CLOUDFLARE_FOUND" != true ]]; then
        log_message "ERROR" "Cloudflare Gateway CA: NOT FOUND"
    fi
    
    # Test HTTPS connectivity
    log_message "INFO" "Testing HTTPS connectivity"
    HTTPS_SUCCESS=0
    HTTPS_TOTAL=3
    
    for url in "https://google.com" "https://apple.com" "https://github.com"; do
        if curl -s --max-time 10 --head "$url" >/dev/null 2>&1; then
            HTTPS_SUCCESS=$((HTTPS_SUCCESS + 1))
            log_message "INFO" "HTTPS test successful: $url"
        else
            log_message "WARNING" "HTTPS test failed: $url"
        fi
    done
    
    SUCCESS_RATE=$((HTTPS_SUCCESS * 100 / HTTPS_TOTAL))
    log_message "INFO" "HTTPS connectivity: $HTTPS_SUCCESS/$HTTPS_TOTAL tests passed ($SUCCESS_RATE%)"
else
    log_message "INFO" "iOS/iPadOS/tvOS detected - checking profiles"
    if command -v profiles >/dev/null 2>&1; then
        PROFILE_COUNT=$(profiles -C 2>/dev/null | wc -l || echo "0")
        log_message "INFO" "Configuration profiles installed: $PROFILE_COUNT"
    fi
fi

# Determine health status
HEALTH_STATUS="HEALTHY"
if [[ "${EXPIRED_CERTS:-0}" -gt 0 ]] || [[ "${CLOUDFLARE_FOUND:-true}" != "true" ]] || [[ "${SUCCESS_RATE:-100}" -lt 80 ]]; then
    HEALTH_STATUS="CRITICAL"
fi

log_message "INFO" "Overall Certificate Health: $HEALTH_STATUS"
log_message "INFO" "Certificate monitoring completed"

if [[ "$HEALTH_STATUS" == "CRITICAL" ]]; then
    exit 1
else
    exit 0
fi
