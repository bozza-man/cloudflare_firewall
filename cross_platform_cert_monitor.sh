#!/bin/bash

# Cross-Platform Certificate Monitor for SimpleMDM
# Compatible with macOS, iOS, iPadOS, and tvOS devices
# Monitors certificate health and compliance across all Apple platforms

set -euo pipefail

# Configuration
SCRIPT_VERSION="2.0.0"
LOG_PREFIX="CertMonitor"

# Logging function
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message"
    logger -t "$LOG_PREFIX" "[$level] $message"
}

# Get OS and device information
get_device_info() {
    OS_NAME=$(uname -s)
    DEVICE_NAME="Unknown"
    SERIAL_NUMBER="Unknown"
    PRODUCT_NAME="Unknown"
    OS_VERSION="Unknown"
    MODEL_NAME="Unknown"
    
    if [[ "$OS_NAME" == "Darwin" ]]; then
        DEVICE_NAME=$(scutil --get ComputerName 2>/dev/null || echo "Unknown")
        SERIAL_NUMBER=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Serial Number" | awk '{print $4}' | head -1 || echo "Unknown")
        PRODUCT_NAME=$(sw_vers -productName 2>/dev/null || echo "Unknown")
        OS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "Unknown")
        MODEL_NAME=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Model Name" | cut -d: -f2 | sed 's/^ *//' || echo "Unknown")
        
        # Detect device type more accurately
        if [[ "$PRODUCT_NAME" == "iPhone OS" ]] || [[ "$PRODUCT_NAME" == "iOS" ]]; then
            DEVICE_TYPE="iOS"
        elif [[ "$PRODUCT_NAME" == "iPadOS" ]]; then
            DEVICE_TYPE="iPadOS"
        elif [[ "$PRODUCT_NAME" == *"tvOS"* ]] || [[ "$MODEL_NAME" == *"Apple TV"* ]]; then
            DEVICE_TYPE="tvOS"
        else
            DEVICE_TYPE="macOS"
        fi
    else
        DEVICE_TYPE="Unknown"
    fi
    
    log_message "INFO" "Device: $DEVICE_NAME ($PRODUCT_NAME $OS_VERSION)"
    log_message "INFO" "Type: $DEVICE_TYPE, Model: $MODEL_NAME, Serial: $SERIAL_NUMBER"
}

# Check macOS certificates (original functionality)
check_macos_certificates() {
    log_message "INFO" "Checking macOS System keychain certificates"
    
    TOTAL_CERTS=0
    EXPIRED_CERTS=0
    CLOUDFLARE_FOUND=false
    
    # Get certificate list
    CERT_LIST=$(security find-certificate -a /Library/Keychains/System.keychain 2>/dev/null | grep -E "(alis|labl)" | grep -E "=\".*\"" | sed 's/.*="\(.*\)".*/\1/' | sort -u || echo "")
    
    if [[ -n "$CERT_LIST" ]]; then
        while IFS= read -r cert_name; do
            [[ -z "$cert_name" ]] && continue
            TOTAL_CERTS=$((TOTAL_CERTS + 1))
            
            # Check for Cloudflare certificate
            if [[ "$cert_name" == *"Cloudflare"* ]] || [[ "$cert_name" == *"Gateway CA"* ]]; then
                CLOUDFLARE_FOUND=true
                log_message "INFO" "Cloudflare Gateway CA: FOUND"
                
                # Get expiration info for Cloudflare cert
                EXPIRY_INFO=$(security find-certificate -c "$cert_name" -p /Library/Keychains/System.keychain 2>/dev/null | openssl x509 -enddate -noout 2>/dev/null || echo "")
                if [[ -n "$EXPIRY_INFO" ]]; then
                    log_message "INFO" "Cloudflare CA expires: $(echo "$EXPIRY_INFO" | sed 's/notAfter=//')"
                fi
            fi
            
            # Check for expired certificates
            EXPIRY_INFO=$(security find-certificate -c "$cert_name" -p /Library/Keychains/System.keychain 2>/dev/null | openssl x509 -enddate -noout 2>/dev/null || echo "")
            if [[ "$EXPIRY_INFO" == *"Jan 01 00:00:00 1970"* ]]; then
                EXPIRED_CERTS=$((EXPIRED_CERTS + 1))
                log_message "WARNING" "Potentially expired certificate: $cert_name"
            fi
        done <<< "$CERT_LIST"
    fi
    
    log_message "INFO" "macOS Keychain: $TOTAL_CERTS total certificates, $EXPIRED_CERTS potentially expired"
    
    if [[ "$CLOUDFLARE_FOUND" != true ]]; then
        log_message "ERROR" "Cloudflare Gateway CA: NOT FOUND in System keychain"
    fi
}

# Check iOS/iPadOS/tvOS certificate compliance
check_ios_certificate_compliance() {
    log_message "INFO" "Checking $DEVICE_TYPE certificate and profile compliance"
    
    PROFILE_COUNT=0
    CERTIFICATE_PROFILES=0
    MDM_PROFILES=0
    CLOUDFLARE_PROFILE_FOUND=false
    
    # Check installed profiles
    if command -v profiles >/dev/null 2>&1; then
        # Get all installed profiles
        PROFILE_OUTPUT=$(profiles -C 2>/dev/null || echo "")
        
        if [[ -n "$PROFILE_OUTPUT" ]]; then
            # Count total profiles
            PROFILE_COUNT=$(echo "$PROFILE_OUTPUT" | grep -c "^[[:space:]]*[0-9]" || echo "0")
            
            # Look for certificate-related profiles
            CERT_PROFILES=$(echo "$PROFILE_OUTPUT" | grep -i -E "(certificate|cert|CA)" || echo "")
            if [[ -n "$CERT_PROFILES" ]]; then
                CERTIFICATE_PROFILES=$(echo "$CERT_PROFILES" | wc -l)
                log_message "INFO" "Found $CERTIFICATE_PROFILES certificate-related profiles"
                
                # Check specifically for Cloudflare profiles
                CLOUDFLARE_PROFILES=$(echo "$CERT_PROFILES" | grep -i "cloudflare\|gateway" || echo "")
                if [[ -n "$CLOUDFLARE_PROFILES" ]]; then
                    CLOUDFLARE_PROFILE_FOUND=true
                    log_message "INFO" "Cloudflare Gateway profile: FOUND"
                    log_message "INFO" "Cloudflare profile details: $CLOUDFLARE_PROFILES"
                fi
            fi
            
            # Check for MDM profiles
            MDM_PROFILES=$(echo "$PROFILE_OUTPUT" | grep -i -E "(MDM|mobile device|simplemdm)" | wc -l || echo "0")
            
            log_message "INFO" "$DEVICE_TYPE Profile Summary:"
            log_message "INFO" "  - Total profiles: $PROFILE_COUNT"
            log_message "INFO" "  - Certificate profiles: $CERTIFICATE_PROFILES"
            log_message "INFO" "  - MDM profiles: $MDM_PROFILES"
        else
            log_message "WARNING" "Unable to retrieve profile information"
        fi
        
        # Detailed profile analysis
        profiles -P 2>/dev/null | while IFS= read -r line; do
            if [[ "$line" == *"Cloudflare"* ]] || [[ "$line" == *"Gateway"* ]] || [[ "$line" == *"Certificate"* ]]; then
                log_message "INFO" "Certificate profile detail: $line"
            fi
        done || true
        
    else
        log_message "WARNING" "Profiles command not available on this device"
    fi
    
    # Check certificate trust settings (iOS 13+)
    if [[ "$DEVICE_TYPE" == "iOS" ]] || [[ "$DEVICE_TYPE" == "iPadOS" ]]; then
        # Try to get certificate trust information
        TRUST_STORE_CHECK=$(security dump-trust-settings 2>/dev/null | grep -i cloudflare || echo "")
        if [[ -n "$TRUST_STORE_CHECK" ]]; then
            log_message "INFO" "Cloudflare certificate found in trust store"
        fi
    fi
    
    # Report compliance status
    if [[ "$CLOUDFLARE_PROFILE_FOUND" == true ]]; then
        log_message "INFO" "Certificate compliance: COMPLIANT (Cloudflare profile installed)"
    elif [[ "$CERTIFICATE_PROFILES" -gt 0 ]]; then
        log_message "WARNING" "Certificate compliance: PARTIAL (certificates present but no Cloudflare profile)"
    else
        log_message "ERROR" "Certificate compliance: NON-COMPLIANT (no certificate profiles found)"
    fi
}

# Test network connectivity (works on all platforms)
test_network_connectivity() {
    log_message "INFO" "Testing network connectivity"
    
    HTTPS_SUCCESS=0
    HTTPS_TOTAL=5
    
    # Test URLs that should work through Cloudflare Gateway
    TEST_URLS=("https://google.com" "https://apple.com" "https://github.com" "https://cloudflare.com" "https://1.1.1.1")
    
    for url in "${TEST_URLS[@]}"; do
        if curl -s --max-time 10 --head "$url" >/dev/null 2>&1; then
            HTTPS_SUCCESS=$((HTTPS_SUCCESS + 1))
            log_message "INFO" "Connectivity test successful: $url"
        else
            log_message "WARNING" "Connectivity test failed: $url"
        fi
    done
    
    SUCCESS_RATE=$((HTTPS_SUCCESS * 100 / HTTPS_TOTAL))
    log_message "INFO" "Network connectivity: $HTTPS_SUCCESS/$HTTPS_TOTAL tests passed ($SUCCESS_RATE%)"
    
    # Additional DNS resolution test
    if command -v nslookup >/dev/null 2>&1; then
        DNS_TEST=$(nslookup google.com 2>/dev/null | grep -c "Address:" || echo "0")
        if [[ "$DNS_TEST" -gt 0 ]]; then
            log_message "INFO" "DNS resolution: WORKING"
        else
            log_message "WARNING" "DNS resolution: ISSUES DETECTED"
        fi
    fi
}

# Check device compliance and security
check_device_security() {
    log_message "INFO" "Checking device security and compliance"
    
    # Check if device is supervised (important for certificate deployment)
    if [[ -f "/var/db/ConfigurationProfiles/Settings/.cloudConfigHasActivationRecord" ]]; then
        log_message "INFO" "Device supervision: SUPERVISED"
    elif [[ -f "/Library/Apple/System/Library/Configuration Profiles" ]]; then
        log_message "INFO" "Device supervision: LIKELY SUPERVISED"
    else
        log_message "WARNING" "Device supervision: UNKNOWN/UNSUPERVISED"
    fi
    
    # Check system time (important for certificate validation)
    CURRENT_TIME=$(date "+%s")
    if [[ "$CURRENT_TIME" -gt 1600000000 ]]; then  # After 2020
        log_message "INFO" "System time: VALID ($(date))"
    else
        log_message "ERROR" "System time: INVALID - may affect certificate validation"
    fi
    
    # Check available storage (low storage can affect profile installation)
    if command -v df >/dev/null 2>&1; then
        STORAGE_INFO=$(df -h / 2>/dev/null | tail -1 | awk '{print $4}' || echo "Unknown")
        log_message "INFO" "Available storage: $STORAGE_INFO"
    fi
}

# Generate comprehensive report
generate_compliance_report() {
    log_message "INFO" "=== CERTIFICATE COMPLIANCE REPORT ==="
    log_message "INFO" "Device: $DEVICE_NAME ($DEVICE_TYPE $OS_VERSION)"
    log_message "INFO" "Serial: $SERIAL_NUMBER, Model: $MODEL_NAME"
    log_message "INFO" "Scan Date: $(date)"
    log_message "INFO" ""
    
    if [[ "$DEVICE_TYPE" == "macOS" ]]; then
        log_message "INFO" "macOS Results:"
        log_message "INFO" "  - System certificates: ${TOTAL_CERTS:-0} total, ${EXPIRED_CERTS:-0} expired"
        log_message "INFO" "  - Cloudflare Gateway CA: ${CLOUDFLARE_FOUND:-false}"
    else
        log_message "INFO" "$DEVICE_TYPE Results:"
        log_message "INFO" "  - Configuration profiles: ${PROFILE_COUNT:-0} total"
        log_message "INFO" "  - Certificate profiles: ${CERTIFICATE_PROFILES:-0}"
        log_message "INFO" "  - Cloudflare profile: ${CLOUDFLARE_PROFILE_FOUND:-false}"
        log_message "INFO" "  - MDM profiles: ${MDM_PROFILES:-0}"
    fi
    
    log_message "INFO" "Network connectivity: ${HTTPS_SUCCESS:-0}/${HTTPS_TOTAL:-0} tests passed (${SUCCESS_RATE:-0}%)"
    log_message "INFO" "=== END REPORT ==="
}

# Determine overall compliance status
get_compliance_status() {
    CRITICAL_ISSUES=0
    WARNING_ISSUES=0
    
    # Platform-specific critical checks
    if [[ "$DEVICE_TYPE" == "macOS" ]]; then
        if [[ "${EXPIRED_CERTS:-0}" -gt 0 ]]; then
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
        fi
        if [[ "${CLOUDFLARE_FOUND:-false}" != "true" ]]; then
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
        fi
    else
        # iOS/iPadOS/tvOS checks
        if [[ "${CLOUDFLARE_PROFILE_FOUND:-false}" != "true" ]]; then
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
        fi
        if [[ "${CERTIFICATE_PROFILES:-0}" -eq 0 ]]; then
            WARNING_ISSUES=$((WARNING_ISSUES + 1))
        fi
    fi
    
    # Common checks for all platforms
    if [[ "${SUCCESS_RATE:-100}" -lt 70 ]]; then
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    elif [[ "${SUCCESS_RATE:-100}" -lt 90 ]]; then
        WARNING_ISSUES=$((WARNING_ISSUES + 1))
    fi
    
    # Return status
    if [[ "$CRITICAL_ISSUES" -gt 0 ]]; then
        echo "CRITICAL"
    elif [[ "$WARNING_ISSUES" -gt 0 ]]; then
        echo "WARNING"
    else
        echo "COMPLIANT"
    fi
}

# Main execution
main() {
    log_message "INFO" "Starting Cross-Platform Certificate Monitor v$SCRIPT_VERSION"
    
    # Get device information
    get_device_info
    
    # Platform-specific certificate checks
    case "$DEVICE_TYPE" in
        "macOS")
            check_macos_certificates
            ;;
        "iOS"|"iPadOS"|"tvOS")
            check_ios_certificate_compliance
            ;;
        *)
            log_message "WARNING" "Unsupported or unknown device type: $DEVICE_TYPE"
            ;;
    esac
    
    # Common checks for all platforms
    test_network_connectivity
    check_device_security
    
    # Generate compliance report
    generate_compliance_report
    
    # Determine overall compliance status
    COMPLIANCE_STATUS=$(get_compliance_status)
    log_message "INFO" "Overall Compliance Status: $COMPLIANCE_STATUS"
    
    # Exit with appropriate code for MDM monitoring
    case "$COMPLIANCE_STATUS" in
        "CRITICAL")
            log_message "ERROR" "Certificate compliance check completed with CRITICAL issues"
            exit 2
            ;;
        "WARNING")
            log_message "WARNING" "Certificate compliance check completed with warnings"
            exit 1
            ;;
        "COMPLIANT")
            log_message "INFO" "Certificate compliance check completed successfully - device is compliant"
            exit 0
            ;;
        *)
            log_message "ERROR" "Unknown compliance status: $COMPLIANCE_STATUS"
            exit 3
            ;;
    esac
}

# Execute main function
main "$@"
