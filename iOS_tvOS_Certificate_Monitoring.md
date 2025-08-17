# iOS/tvOS Certificate Monitoring with SimpleMDM

## 🎯 **The Challenge**

iOS, iPadOS, and tvOS devices have significant security restrictions that prevent direct keychain access via command line. However, we can still monitor certificate compliance through:

- **Configuration Profile Analysis**
- **MDM Compliance Reporting**
- **Network Connectivity Testing**
- **Certificate Trust Verification**

## 📱 **Enhanced Cross-Platform Script**

The new `cross_platform_cert_monitor.sh` detects device types and runs appropriate checks:

### **macOS Devices:**
- ✅ Full keychain certificate inspection
- ✅ Direct Cloudflare Gateway CA verification
- ✅ Certificate expiration analysis
- ✅ Trust store validation

### **iOS/iPadOS/tvOS Devices:**
- ✅ Configuration profile enumeration
- ✅ Certificate profile detection
- ✅ Cloudflare Gateway profile verification
- ✅ MDM compliance status
- ✅ Network connectivity validation
- ✅ Device supervision status

## 🔍 **What the iOS/tvOS Script Actually Checks**

### 1. **Configuration Profiles**
```bash
profiles -C  # Lists all installed configuration profiles
profiles -P  # Shows profile details including certificates
```

### 2. **Certificate Profiles Detection**
- Searches for certificate-related profiles
- Specifically looks for "Cloudflare" or "Gateway" profiles
- Counts total certificate profiles installed

### 3. **MDM Profile Verification**
- Confirms SimpleMDM profiles are active
- Verifies device supervision status
- Checks profile deployment compliance

### 4. **Network Connectivity**
- Tests HTTPS connections to verify certificate chain
- DNS resolution verification  
- Cloudflare Gateway connectivity tests

### 5. **Device Security Status**
- Device supervision verification
- System time validation (critical for certificates)
- Available storage check

## 📋 **Sample iOS Output**

Expected output on iOS/iPadOS devices:

```
[2025-08-17 20:57:15] [INFO] Starting Cross-Platform Certificate Monitor v2.0.0
[2025-08-17 20:57:16] [INFO] Device: Boz iPhone 15 Pro (iOS 18.0)
[2025-08-17 20:57:16] [INFO] Type: iOS, Model: iPhone 15 Pro, Serial: HMV3K41HCV
[2025-08-17 20:57:16] [INFO] Checking iOS certificate and profile compliance
[2025-08-17 20:57:16] [INFO] Found 2 certificate-related profiles
[2025-08-17 20:57:16] [INFO] Cloudflare Gateway profile: FOUND
[2025-08-17 20:57:16] [INFO] iOS Profile Summary:
[2025-08-17 20:57:16] [INFO]   - Total profiles: 8 total
[2025-08-17 20:57:16] [INFO]   - Certificate profiles: 2
[2025-08-17 20:57:16] [INFO]   - Cloudflare profile: true
[2025-08-17 20:57:16] [INFO]   - MDM profiles: 3
[2025-08-17 20:57:17] [INFO] Certificate compliance: COMPLIANT (Cloudflare profile installed)
[2025-08-17 20:57:17] [INFO] Network connectivity: 5/5 tests passed (100%)
[2025-08-17 20:57:17] [INFO] Overall Compliance Status: COMPLIANT
```

## 🚀 **Deployment Steps**

### Step 1: Upload Enhanced Script

1. **Login to SimpleMDM** → **Scripts** → **New Script**
2. **Name:** `Cross-Platform Certificate Monitor`
3. **Content:** Copy the entire `cross_platform_cert_monitor.sh` script
4. **Variable Support:** ✅ Enabled

### Step 2: Create Device Group Targeting

Create separate automations for different device types:

#### **macOS Automation:**
- **Name:** `macOS Certificate Health Check`
- **Target:** Dynamic Group (macOS devices only)
- **Schedule:** Weekly (Sundays 2 AM)

#### **iOS/iPadOS Automation:**  
- **Name:** `iOS Certificate Compliance Check`
- **Target:** Dynamic Group (iOS + iPadOS devices)
- **Schedule:** Daily (6 AM) - more frequent due to profile changes

#### **tvOS Automation:**
- **Name:** `tvOS Certificate Compliance Check`  
- **Target:** Dynamic Group (tvOS devices)
- **Schedule:** Weekly (Sundays 3 AM)

### Step 3: Set Up Compliance Alerting

Create alerts for different compliance states:

#### **Critical Issues:**
- Missing Cloudflare Gateway profiles
- Network connectivity failures
- Device supervision problems

#### **Warning Issues:**
- Partial certificate compliance
- Low network connectivity success rates
- Storage or time issues

## 📊 **iOS/tvOS Compliance Criteria**

### ✅ **COMPLIANT Status:**
- Cloudflare Gateway profile installed and active
- Network connectivity ≥90% success rate
- Device properly supervised
- Valid system time and sufficient storage

### ⚠️ **WARNING Status:**
- Some certificate profiles present but no Cloudflare profile
- Network connectivity 70-89% success rate
- Minor device compliance issues

### ❌ **CRITICAL Status:**
- No Cloudflare Gateway profile found
- Network connectivity <70% success rate
- Device supervision issues
- System time problems

## 🔧 **Advanced iOS/tvOS Monitoring**

### Additional Profile Verification

For enhanced monitoring, the script can be extended to check:

```bash
# Check specific profile payloads
profiles -P | grep -A 10 -B 5 "Certificate"

# Verify trust settings (iOS 13+)
security dump-trust-settings 2>/dev/null | grep -i cloudflare

# Check network routing through Gateway
nslookup google.com
traceroute -n 8.8.8.8 | head -5
```

### Certificate Trust Validation

On iOS devices with user-installed certificates:

```bash
# List user trust settings
security dump-trust-settings -s | grep -i gateway

# Check certificate validity
openssl s_client -connect google.com:443 -showcerts < /dev/null | grep "Cloudflare"
```

## 🎯 **Your Device Fleet Status**

Based on your SimpleMDM device list:

### **macOS Devices (4):**
- Daniel's MacBook Pro ✅ (Currently COMPLIANT)
- MacBook Air 
- Mac Studio
- iMac (unenrolled)

### **iOS Devices (2):**
- iPhone 15 Pro
- iPhone 11 Pro  

### **iPadOS Devices (1):**
- iPad Air M2

### **tvOS Devices (3):**
- Apple TV 4K (Lounge Room)
- Apple TV 4K (Control Room)
- Apple TV (unenrolled)

## 🚨 **Important iOS/tvOS Limitations**

### **What We CAN'T Do:**
- Direct keychain certificate inspection
- Individual certificate expiration checking
- Trust store manipulation
- Certificate installation via script

### **What We CAN Do:**
- Profile compliance verification
- Network connectivity validation
- Certificate deployment confirmation
- MDM compliance reporting

## 🔄 **Testing the Script**

### Manual Testing on iOS Device:
```bash
# Connect to device via SSH (if jailbroken) or use SimpleMDM
# Or test via SimpleMDM's "Run Script" feature

# Expected behavior:
# 1. Device type detection (iOS/iPadOS/tvOS)  
# 2. Profile enumeration
# 3. Cloudflare profile detection
# 4. Network connectivity tests
# 5. Compliance status reporting
```

### Monitoring Results:
- **SimpleMDM Dashboard** → **Device Activity**
- **System logs** on each device  
- **Email/Slack alerts** for non-compliance

This enhanced approach provides comprehensive certificate monitoring across your entire Apple device fleet, working within the security constraints of each platform while maintaining consistent compliance reporting.
