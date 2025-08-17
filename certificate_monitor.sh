#!/bin/bash

# Certificate Monitor for SimpleMDM
# Compatible with macOS, iOS/iPadOS, and tvOS devices
# Monitors certificate health, expiration, and Cloudflare Gateway CA status

set -euo pipefail

# Configuration
SCRIPT_NAME="Certificate Monitor"
SCRIPT_VERSION="1.0.0"
LOG_PREFIX="CertMonitor"
CLOUDFLARE_CA_NAME="Gateway CA - Cloudflare Managed G2"
WARNING_DAYS=30
CRITICAL_DAYS=7

# Logging function
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message"
    logger -t "$LOG_PREFIX" "[$level] $message"
}

# Get OS info
get_os_info() {
    local os_name=$(uname -s)
    local os_version=""
    local product_name=""
    
    case "$os_name" in
        "Darwin")
            os_version=$(sw_vers -productVersion 2>/dev/null || echo "Unknown")
            product_name=$(sw_vers -productName 2>/dev/null || echo "Unknown")
            ;;
        *)
            os_version="Unknown"
            product_name="Unknown"
            ;;
    esac
    
    export OS_NAME="$os_name"
    export OS_VERSION="$os_version"
    export PRODUCT_NAME="$product_name"
}

# Get device info
get_device_info() {
    local device_name="Unknown"
    local serial_number="Unknown"
    local model_name="Unknown"
    
    if [[ "$OS_NAME" == "Darwin" ]]; then
        device_name=$(scutil --get ComputerName 2>/dev/null || echo "Unknown")
        serial_number=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Serial Number" | awk '{print $4}' | head -1 || echo "Unknown")
        model_name=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Model Name" | cut -d: -f2 | sed 's/^ *//' || echo "Unknown")
    fi
    
    export DEVICE_NAME="$device_name"
    export SERIAL_NUMBER="$serial_number"
    export MODEL_NAME="$model_name"
}

# Check if date command supports GNU format
date_supports_gnu() {
    date --version >/dev/null 2>&1
}

# Convert certificate date to epoch
cert_date_to_epoch() {
    local cert_date="$1"
    
    if date_supports_gnu; then
        date -d "$cert_date" +%s 2>/dev/null || echo "0"
    else
        # macOS/BSD date
        date -j -f "%b %d %H:%M:%S %Y %Z" "$cert_date" +%s 2>/dev/null || echo "0"
    fi
}

# Calculate days until expiration
days_until_expiration() {
    local expiry_epoch="$1"
    local current_epoch=$(date +%s)
    local diff_seconds=$((expiry_epoch - current_epoch))
    local diff_days=$((diff_seconds / 86400))
    echo "$diff_days"
}

# Get certificate expiration status
get_cert_expiry_status() {
    local days_left="$1"
    
    if [[ "$days_left" -lt 0 ]]; then
        echo "EXPIRED"
    elif [[ "$days_left" -lt $CRITICAL_DAYS ]]; then
        echo "CRITICAL"
    elif [[ "$days_left" -lt $WARNING_DAYS ]]; then
        echo "WARNING"
    else
        echo "OK"
    fi
}

# Check macOS System keychain certificates
check_macos_system_keychain() {
    log_message "INFO" "Checking macOS System keychain certificates"
    
    local total_certs=0
    local expired_certs=0
    local warning_certs=0
    local critical_certs=0
    local cloudflare_found=false
    local cloudflare_status=""
    
    # Get list of certificates
    local cert_list=$(security find-certificate -a /Library/Keychains/System.keychain 2>/dev/null | grep -E "(alis|labl)" | grep -E "=\".*\"" | sed 's/.*=\"\(.*\)\".*/\1/' | sort -u || echo "")
    
    if [[ -z "$cert_list" ]]; then
        log_message "WARNING" "No certificates found in System keychain"
        return 1
    fi
    
    while IFS= read -r cert_name; do
        [[ -z "$cert_name" ]] && continue
        
        total_certs=$((total_certs + 1))
        
        # Check if this is the Cloudflare certificate
        if [[ "$cert_name" == *"$CLOUDFLARE_CA_NAME"* ]] || [[ "$cert_name" == *"Cloudflare"* ]]; then
            cloudflare_found=true
        fi
        
        # Get certificate expiration
        local expiry_info=$(security find-certificate -c "$cert_name" -p /Library/Keychains/System.keychain 2>/dev/null | openssl x509 -enddate -noout 2>/dev/null || echo "")
        
        if [[ -n "$expiry_info" ]]; then
            local expiry_date=$(echo "$expiry_info" | sed 's/notAfter=//')
            local expiry_epoch=$(cert_date_to_epoch "$expiry_date")
            local days_left=$(days_until_expiration "$expiry_epoch")
            local status=$(get_cert_expiry_status "$days_left")
            
            case "$status" in
                "EXPIRED")
                    expired_certs=$((expired_certs + 1))
                    log_message "ERROR" "EXPIRED: $cert_name (expired $((days_left * -1)) days ago)"
                    ;;
                "CRITICAL")
                    critical_certs=$((critical_certs + 1))
                    log_message "ERROR" "CRITICAL: $cert_name (expires in $days_left days)"
                    ;;
                "WARNING")
                    warning_certs=$((warning_certs + 1))
                    log_message "WARNING" "$cert_name expires in $days_left days"
                    ;;
            esac
            
            # Special handling for Cloudflare certificate
            if [[ "$cert_name" == *"$CLOUDFLARE_CA_NAME"* ]] || [[ "$cert_name" == *"Cloudflare"* ]]; then
                cloudflare_status="$status ($days_left days)"
            fi
        fi
        
    done <<< "$cert_list"
    
    # Summary
    log_message "INFO" "System Keychain Summary: Total=$total_certs, Expired=$expired_certs, Critical=$critical_certs, Warning=$warning_certs"
    
    if [[ "$cloudflare_found" == true ]]; then
        log_message "INFO" "Cloudflare Gateway CA: FOUND ($cloudflare_status)"
    else
        log_message "ERROR" "Cloudflare Gateway CA: NOT FOUND"
    fi
    
    # Export results for MDM reporting
    export SYSTEM_KEYCHAIN_TOTAL="$total_certs"
    export SYSTEM_KEYCHAIN_EXPIRED="$expired_certs"
    export SYSTEM_KEYCHAIN_CRITICAL="$critical_certs"
    export SYSTEM_KEYCHAIN_WARNING="$warning_certs"
    export CLOUDFLARE_CA_FOUND="$cloudflare_found"
    export CLOUDFLARE_CA_STATUS="$cloudflare_status"
}

# Check macOS Login keychain certificates
check_macos_login_keychain() {
    log_message "INFO" "Checking macOS Login keychain certificates"
    
    local login_keychain="$HOME/Library/Keychains/login.keychain-db"
    
    if [[ ! -f "$login_keychain" ]]; then
        log_message "WARNING" "Login keychain not found"
        return 1
    fi
    
    local total_certs=0
    local expired_certs=0
    local warning_certs=0
    local critical_certs=0
    
    # Get list of certificates
    local cert_list=$(security find-certificate -a "$login_keychain" 2>/dev/null | grep -E "(alis|labl)" | grep -E "=\".*\"" | sed 's/.*=\"\(.*\)\".*/\1/' | sort -u || echo "")
    
    if [[ -z "$cert_list" ]]; then
        log_message "INFO" "No certificates found in Login keychain"
        return 0
    fi
    
    while IFS= read -r cert_name; do
        [[ -z "$cert_name" ]] && continue
        
        total_certs=$((total_certs + 1))
        
        # Get certificate expiration
        local expiry_info=$(security find-certificate -c "$cert_name" -p "$login_keychain" 2>/dev/null | openssl x509 -enddate -noout 2>/dev/null || echo "")
        
        if [[ -n "$expiry_info" ]]; then
            local expiry_date=$(echo "$expiry_info" | sed 's/notAfter=//')
            local expiry_epoch=$(cert_date_to_epoch "$expiry_date")
            local days_left=$(days_until_expiration "$expiry_epoch")
            local status=$(get_cert_expiry_status "$days_left")
            
            case "$status" in
                "EXPIRED")
                    expired_certs=$((expired_certs + 1))
                    log_message "WARNING" "LOGIN EXPIRED: $cert_name"
                    ;;
                "CRITICAL")
                    critical_certs=$((critical_certs + 1))
                    log_message "WARNING" "LOGIN CRITICAL: $cert_name"
                    ;;
                "WARNING")
                    warning_certs=$((warning_certs + 1))
                    log_message "INFO" "LOGIN WARNING: $cert_name"
                    ;;
            esac
        fi
        
    done <<< "$cert_list"
    
    log_message "INFO" "Login Keychain Summary: Total=$total_certs, Expired=$expired_certs, Critical=$critical_certs, Warning=$warning_certs"
    
    # Export results for MDM reporting
    export LOGIN_KEYCHAIN_TOTAL="$total_certs"
    export LOGIN_KEYCHAIN_EXPIRED="$expired_certs"
    export LOGIN_KEYCHAIN_CRITICAL="$critical_certs"
    export LOGIN_KEYCHAIN_WARNING="$warning_certs"
}

# Test HTTPS connectivity through Cloudflare Gateway
test_cloudflare_connectivity() {
    log_message "INFO" "Testing HTTPS connectivity through Cloudflare Gateway"
    
    local test_urls=("https://google.com" "https://apple.com" "https://github.com")
    local successful_tests=0
    local total_tests=${#test_urls[@]}
    
    for url in "${test_urls[@]}"; do
        if curl -s --max-time 10 --head "$url" >/dev/null 2>&1; then
            successful_tests=$((successful_tests + 1))
            log_message "INFO" "HTTPS test successful: $url"
        else
            log_message "WARNING" "HTTPS test failed: $url"
        fi
    done
    
    local success_rate=$((successful_tests * 100 / total_tests))
    log_message "INFO" "HTTPS connectivity: $successful_tests/$total_tests tests passed ($success_rate%)"
    
    export HTTPS_SUCCESS_RATE="$success_rate"
    export HTTPS_SUCCESSFUL_TESTS="$successful_tests"
    export HTTPS_TOTAL_TESTS="$total_tests"
}

# Check iOS/iPadOS/tvOS certificates (profile-based)
check_ios_certificates() {
    log_message "INFO" "iOS/iPadOS/tvOS certificate checking not directly available via command line"
    log_message "INFO" "Certificate status must be checked through MDM profile compliance"
    
    # We can check if profiles are installed
    if command -v profiles >/dev/null 2>&1; then
        local profile_count=$(profiles -C 2>/dev/null | grep -c "^[[:space:]]*[0-9]" || echo "0")
        log_message "INFO" "Configuration profiles installed: $profile_count"
        export PROFILE_COUNT="$profile_count"
    else
        log_message "INFO" "Profiles command not available"
        export PROFILE_COUNT="N/A"
    fi
}

# Generate certificate health report
generate_report() {
    log_message "INFO" "=== CERTIFICATE HEALTH REPORT ==="
    log_message "INFO" "Device: $DEVICE_NAME ($SERIAL_NUMBER)"
    log_message "INFO" "Model: $MODEL_NAME"
    log_message "INFO" "OS: $PRODUCT_NAME $OS_VERSION"
    log_message "INFO" "Scan Date: $(date)"
    log_message "INFO" ""
    
    if [[ "$OS_NAME" == "Darwin" ]]; then
        log_message "INFO" "System Keychain: ${SYSTEM_KEYCHAIN_TOTAL:-0} total, ${SYSTEM_KEYCHAIN_EXPIRED:-0} expired, ${SYSTEM_KEYCHAIN_CRITICAL:-0} critical"
        log_message "INFO" "Login Keychain: ${LOGIN_KEYCHAIN_TOTAL:-0} total, ${LOGIN_KEYCHAIN_EXPIRED:-0} expired, ${LOGIN_KEYCHAIN_CRITICAL:-0} critical"
        log_message "INFO" "Cloudflare Gateway CA: ${CLOUDFLARE_CA_FOUND:-false} (${CLOUDFLARE_CA_STATUS:-N/A})"
        log_message "INFO" "HTTPS Connectivity: ${HTTPS_SUCCESSFUL_TESTS:-0}/${HTTPS_TOTAL_TESTS:-0} tests passed (${HTTPS_SUCCESS_RATE:-0}%)"
    else
        log_message "INFO" "Profile Count: ${PROFILE_COUNT:-N/A}"
    fi
    
    log_message "INFO" "=== END REPORT ==="
}

# Determine overall health status
get_health_status() {
    local critical_issues=0
    local warning_issues=0
    
    # Check for critical issues
    if [[ "${SYSTEM_KEYCHAIN_EXPIRED:-0}" -gt 0 ]] || [[ "${SYSTEM_KEYCHAIN_CRITICAL:-0}" -gt 0 ]]; then
        critical_issues=$((critical_issues + 1))
    fi
    
    if [[ "${CLOUDFLARE_CA_FOUND:-false}" != "true" ]]; then
        critical_issues=$((critical_issues + 1))
    fi
    
    if [[ "${HTTPS_SUCCESS_RATE:-100}" -lt 80 ]]; then
        critical_issues=$((critical_issues + 1))
    fi
    
    # Check for warning issues
    if [[ "${SYSTEM_KEYCHAIN_WARNING:-0}" -gt 0 ]] || [[ "${LOGIN_KEYCHAIN_EXPIRED:-0}" -gt 0 ]]; then
        warning_issues=$((warning_issues + 1))
    fi
    
    if [[ "$critical_issues" -gt 0 ]]; then
        echo "CRITICAL"
    elif [[ "$warning_issues" -gt 0 ]]; then
        echo "WARNING"
    else
        echo "HEALTHY"
    fi
}

# Main function
main() {
    log_message "INFO" "Starting $SCRIPT_NAME v$SCRIPT_VERSION"
    
    # Get system information
    get_os_info
    get_device_info
    
    log_message "INFO" "Device: $DEVICE_NAME ($PRODUCT_NAME $OS_VERSION)"
    
    # Platform-specific certificate checks
    if [[ "$OS_NAME" == "Darwin" ]]; then
        if [[ "$PRODUCT_NAME" == *"macOS"* ]] || [[ "$PRODUCT_NAME" == *"Mac OS X"* ]]; then
            # macOS
            check_macos_system_keychain
            check_macos_login_keychain
            test_cloudflare_connectivity
        else
            # iOS/iPadOS/tvOS
            check_ios_certificates
        fi
    else
        log_message "WARNING" "Unsupported platform: $OS_NAME"
        exit 1
    fi
    
    # Generate report
    generate_report
    
    # Determine overall health status
    local health_status=$(get_health_status)
    export CERTIFICATE_HEALTH_STATUS="$health_status"
    
    log_message "INFO" "Overall Certificate Health: $health_status"
    
    # Exit with appropriate code for MDM monitoring
    case "$health_status" in
        "CRITICAL")
            log_message "ERROR" "Certificate monitoring completed with CRITICAL issues"
            exit 2
            ;;
        "WARNING")
            log_message "WARNING" "Certificate monitoring completed with warnings"
            exit 1
            ;;
        "HEALTHY")
            log_message "INFO" "Certificate monitoring completed successfully - all systems healthy"
            exit 0
            ;;
        *)
            log_message "ERROR" "Unknown health status: $health_status"
            exit 3
            ;;
    esac
}

# Execute main function
main "$@"
