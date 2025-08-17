#!/bin/bash

# iOS/tvOS Certificate Monitoring Solution for SimpleMDM
# Since SimpleMDM scripts only work on macOS, this uses API-based monitoring
# and alternative approaches for iOS, iPadOS, and tvOS devices

set -euo pipefail

# Configuration
API_KEY="ff9BgV12tadFTvoNLsCPAGJN0bjAMXgTHjPjb0hxmi0umeKi04kv0zjGFTvUmd94"
API_BASE="https://a.simplemdm.com/api/v1"
LOG_FILE="/var/log/ios_certificate_monitor.log"

# Key Profile IDs (from your SimpleMDM setup)
CLOUDFLARE_GATEWAY_PROFILE_ID="207667"
CLOUDFLARE_ORIGIN_PROFILE_ID="207115"

# Logging function
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message"
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE" 2>/dev/null || true
    logger -t "iOS-CertMonitor" "[$level] $message" 2>/dev/null || true
}

# API helper function
api_call() {
    local endpoint="$1"
    curl -s -u "${API_KEY}:" "${API_BASE}${endpoint}" 2>/dev/null || echo '{"error": "API call failed"}'
}

# Get all enrolled iOS/tvOS devices
get_mobile_devices() {
    log_message "INFO" "Fetching iOS/tvOS device list from SimpleMDM"
    
    api_call "/devices" | jq -r '.data[] | select(.attributes.status == "enrolled" and (.attributes.product_name | contains("iPhone") or contains("iPad") or contains("AppleTV"))) | "\(.id)|\(.attributes.name)|\(.attributes.product_name)|\(.attributes.os_version)|\(.attributes.last_seen_at)"' 2>/dev/null || echo ""
}

# Check profile deployment status for a device
check_device_profiles() {
    local device_id="$1"
    local device_name="$2"
    local device_type="$3"
    
    log_message "INFO" "Checking certificate profile deployment for: $device_name ($device_type)"
    
    # Get device details including profile compliance
    DEVICE_DATA=$(api_call "/devices/$device_id")
    
    if [[ "$DEVICE_DATA" == *"error"* ]]; then
        log_message "ERROR" "Failed to get device data for $device_name"
        return 1
    fi
    
    # Extract key device information
    LAST_SEEN=$(echo "$DEVICE_DATA" | jq -r '.data.attributes.last_seen_at // "Unknown"')
    SUPERVISED=$(echo "$DEVICE_DATA" | jq -r '.data.attributes.is_supervised // false')
    
    log_message "INFO" "Device $device_name status:"
    log_message "INFO" "  - Last seen: $LAST_SEEN"
    log_message "INFO" "  - Supervised: $SUPERVISED"
    
    # Check if device is in the group that should have Cloudflare certificate
    GROUPS=$(echo "$DEVICE_DATA" | jq -r '.data.relationships.groups.data[] | .id' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    log_message "INFO" "  - Groups: $GROUPS"
    
    # For iOS devices, we can't directly check certificates, but we can:
    # 1. Verify the device is in the correct group for certificate deployment
    # 2. Check last check-in time (recent = likely compliant)
    # 3. Monitor for any MDM errors
    
    local compliance_status="UNKNOWN"
    
    # Basic compliance checks
    if [[ "$SUPERVISED" == "true" ]]; then
        # Device is supervised, can receive certificates
        if [[ -n "$GROUPS" ]]; then
            # Device is in groups, likely receiving profiles
            compliance_status="LIKELY_COMPLIANT"
            log_message "INFO" "Certificate compliance: LIKELY_COMPLIANT (supervised + group membership)"
        else
            compliance_status="WARNING"
            log_message "WARNING" "Certificate compliance: WARNING (supervised but no groups)"
        fi
    else
        compliance_status="CRITICAL"
        log_message "ERROR" "Certificate compliance: CRITICAL (device not supervised - cannot deploy certificates)"
    fi
    
    echo "$compliance_status"
}

# Monitor certificate profile deployment across devices
monitor_profile_deployment() {
    log_message "INFO" "Monitoring certificate profile deployment status"
    
    # Check Cloudflare Gateway CA profile status
    PROFILE_DATA=$(api_call "/profiles/$CLOUDFLARE_GATEWAY_PROFILE_ID")
    
    if [[ "$PROFILE_DATA" != *"error"* ]]; then
        PROFILE_NAME=$(echo "$PROFILE_DATA" | jq -r '.data.attributes.name')
        GROUP_COUNT=$(echo "$PROFILE_DATA" | jq -r '.data.attributes.group_count')
        DEVICE_COUNT=$(echo "$PROFILE_DATA" | jq -r '.data.attributes.device_count')
        
        log_message "INFO" "Cloudflare Gateway CA Profile Status:"
        log_message "INFO" "  - Name: $PROFILE_NAME"
        log_message "INFO" "  - Assigned to $GROUP_COUNT groups"
        log_message "INFO" "  - Deployed to $DEVICE_COUNT devices"
        
        if [[ "$DEVICE_COUNT" -eq 0 ]]; then
            log_message "WARNING" "Cloudflare Gateway CA profile is not deployed to any devices!"
        fi
    else
        log_message "ERROR" "Failed to get Cloudflare Gateway CA profile information"
    fi
}

# Test network connectivity from macOS to validate Gateway functionality
test_gateway_connectivity() {
    log_message "INFO" "Testing Cloudflare Gateway connectivity from monitoring host"
    
    local test_urls=("https://google.com" "https://apple.com" "https://1.1.1.1" "https://cloudflare.com")
    local success_count=0
    local total_tests=${#test_urls[@]}
    
    for url in "${test_urls[@]}"; do
        if curl -s --max-time 10 --head "$url" >/dev/null 2>&1; then
            success_count=$((success_count + 1))
            log_message "INFO" "Gateway connectivity test successful: $url"
        else
            log_message "WARNING" "Gateway connectivity test failed: $url"
        fi
    done
    
    local success_rate=$((success_count * 100 / total_tests))
    log_message "INFO" "Gateway connectivity: $success_count/$total_tests tests passed ($success_rate%)"
    
    if [[ "$success_rate" -lt 80 ]]; then
        log_message "ERROR" "Gateway connectivity below acceptable threshold"
        return 1
    fi
    
    return 0
}

# Generate compliance report for iOS/tvOS devices
generate_mobile_compliance_report() {
    log_message "INFO" "=== iOS/tvOS CERTIFICATE COMPLIANCE REPORT ==="
    log_message "INFO" "Report generated: $(date)"
    log_message "INFO" "Monitoring method: SimpleMDM API + Profile Deployment Status"
    log_message "INFO" ""
    
    local total_devices=0
    local compliant_devices=0
    local warning_devices=0
    local critical_devices=0
    
    # Process each mobile device
    while IFS='|' read -r device_id device_name product_name os_version last_seen; do
        [[ -z "$device_id" ]] && continue
        
        total_devices=$((total_devices + 1))
        log_message "INFO" "--- Device: $device_name ---"
        log_message "INFO" "Type: $product_name, OS: $os_version"
        
        local status=$(check_device_profiles "$device_id" "$device_name" "$product_name")
        
        case "$status" in
            "LIKELY_COMPLIANT")
                compliant_devices=$((compliant_devices + 1))
                ;;
            "WARNING")
                warning_devices=$((warning_devices + 1))
                ;;
            "CRITICAL")
                critical_devices=$((critical_devices + 1))
                ;;
        esac
        
        log_message "INFO" ""
        
    done <<< "$(get_mobile_devices)"
    
    log_message "INFO" "=== SUMMARY ==="
    log_message "INFO" "Total iOS/tvOS devices: $total_devices"
    log_message "INFO" "Likely compliant: $compliant_devices"
    log_message "INFO" "Warnings: $warning_devices"
    log_message "INFO" "Critical issues: $critical_devices"
    
    # Overall compliance status
    if [[ "$critical_devices" -gt 0 ]]; then
        log_message "ERROR" "Overall Status: CRITICAL - $critical_devices devices have critical compliance issues"
        return 2
    elif [[ "$warning_devices" -gt 0 ]]; then
        log_message "WARNING" "Overall Status: WARNING - $warning_devices devices have compliance warnings"
        return 1
    else
        log_message "INFO" "Overall Status: COMPLIANT - All iOS/tvOS devices appear compliant"
        return 0
    fi
}

# Check for devices that haven't checked in recently
check_device_checkin_status() {
    log_message "INFO" "Checking device check-in status"
    
    local current_time=$(date +%s)
    local stale_threshold=$((24 * 60 * 60))  # 24 hours
    local stale_devices=0
    
    while IFS='|' read -r device_id device_name product_name os_version last_seen; do
        [[ -z "$device_id" ]] && continue
        
        if [[ "$last_seen" != "null" ]] && [[ -n "$last_seen" ]]; then
            # Convert last_seen to epoch (SimpleMDM format: "2025-08-17T20:46:23.000+10:00")
            local last_seen_epoch=$(date -d "$last_seen" +%s 2>/dev/null || echo "0")
            local time_diff=$((current_time - last_seen_epoch))
            
            if [[ "$time_diff" -gt "$stale_threshold" ]]; then
                stale_devices=$((stale_devices + 1))
                log_message "WARNING" "Device $device_name has not checked in for $((time_diff / 3600)) hours"
            fi
        else
            log_message "WARNING" "Device $device_name has no recent check-in data"
            stale_devices=$((stale_devices + 1))
        fi
        
    done <<< "$(get_mobile_devices)"
    
    if [[ "$stale_devices" -gt 0 ]]; then
        log_message "WARNING" "$stale_devices devices have stale check-in status"
    else
        log_message "INFO" "All devices have recent check-in status"
    fi
}

# Main monitoring function
main() {
    log_message "INFO" "Starting iOS/tvOS Certificate Monitoring"
    log_message "INFO" "Note: Direct script execution not supported on iOS/tvOS devices"
    log_message "INFO" "Using SimpleMDM API-based monitoring approach"
    
    # Create log file if it doesn't exist
    touch "$LOG_FILE" 2>/dev/null || true
    
    # Monitor certificate profile deployment
    monitor_profile_deployment
    
    # Check device check-in status
    check_device_checkin_status
    
    # Test Gateway connectivity from monitoring host
    test_gateway_connectivity
    
    # Generate comprehensive compliance report
    generate_mobile_compliance_report
    local exit_code=$?
    
    log_message "INFO" "iOS/tvOS certificate monitoring completed"
    exit $exit_code
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
