# Critical Rules Protection

## 🚨 Rules That Must Never Be Moved by Auto-Fix

### 1. CRITICAL INFRASTRUCTURE: Essential Services (DNS)
- **ID:** `13cc67a0-b26b-4e8c-9960-45ba24301531`
- **Current Precedence:** 500 (MUST be low number - high priority)
- **Position:** FIRST rule (position #1)
- **Critical Function:** Ensures essential DNS services always work (84 domains including Warp.dev, Anthropic, ChatGPT/OpenAI, Google Workspace, Google Cloud, Apple, Cloudflare, SimpleMDM, Ubiquiti, Microsoft, Google & Apple Mail services)
- **⚠️ WARNING:** This rule MUST be evaluated FIRST or critical services may be blocked

### 2. CRITICAL INFRASTRUCTURE: Essential Services (HTTP)
- **ID:** `0ff5bbfa-88cb-46cc-a860-4b34091198e8`
- **Current Precedence:** 501 (MUST be low number - high priority)
- **Position:** SECOND rule (position #2)
- **Critical Function:** Ensures essential HTTP/HTTPS services always work (same 84 domains as DNS rule including Google & Apple Mail services)
- **⚠️ WARNING:** This rule MUST be evaluated early or critical web services may be blocked

### 3. Security: Block Unknown DNS Queries
- **ID:** `0519eb6f-0e60-4713-8213-19da74e501f9`
- **Current Precedence:** 63000 (MUST be highest number)
- **Position:** LAST rule (catch-all)
- **Critical Function:** Blocks all DNS queries not explicitly allowed by other rules
- **⚠️ WARNING:** This rule MUST always be the last rule or it will break the entire DNS filtering system

## 🔒 Implementation Needed: Protected Rules List

### Current Problem
The `rules analyze --auto-fix` process moved the DNS blocking rule from its correct position (last) to position #8, breaking the catch-all functionality.

### Solution: Add Protected Rules Logic

**File to modify:** `src/rules/rule-optimizer.ts`

```typescript
// Add at the top of the class
private readonly PROTECTED_RULES = {
  // Critical Infrastructure DNS - MUST be first
  '13cc67a0-b26b-4e8c-9960-45ba24301531': {
    name: 'CRITICAL INFRASTRUCTURE: Essential Services',
    position: 'FIRST',
    requiredPrecedence: 500,
    reason: 'Critical infrastructure DNS must be evaluated first'
  },
  // Critical Infrastructure HTTP - MUST be second  
  '0ff5bbfa-88cb-46cc-a860-4b34091198e8': {
    name: 'CRITICAL INFRASTRUCTURE: Essential Services (HTTP)',
    position: 'SECOND',
    requiredPrecedence: 501,
    reason: 'Critical infrastructure HTTP must be evaluated second'
  },
  // DNS Catch-all rule - MUST be last
  '0519eb6f-0e60-4713-8213-19da74e501f9': {
    name: 'Security: Block Unknown DNS Queries',
    position: 'LAST',
    reason: 'Catch-all DNS blocking rule must be evaluated last'
  }
};

// Modify proposeOptimalOrder method to respect protected rules
private proposeOptimalOrder(rules: GatewayRule[], analysis: RuleAnalysis): void {
  const enabledRules = rules.filter(r => r.enabled);
  
  // Separate protected rules from regular rules
  const protectedRules: GatewayRule[] = [];
  const regularRules = enabledRules.filter(rule => {
    if (this.PROTECTED_RULES[rule.id]) {
      protectedRules.push(rule);
      return false;
    }
    return true;
  });
  
  // Sort regular rules normally
  const sortedRegularRules = [...regularRules].sort((a, b) => {
    // ... existing sorting logic
  });
  
  // Add protected rules in their required positions
  protectedRules.forEach(rule => {
    const protection = this.PROTECTED_RULES[rule.id];
    if (protection.position === 'LAST') {
      // Ensure this rule has the highest precedence
      const maxPrecedence = Math.max(...sortedRegularRules.map(r => r.precedence));
      const requiredPrecedence = maxPrecedence + 1000;
      
      if (rule.precedence < requiredPrecedence) {
        analysis.proposedOrder.push({
          rule,
          suggestedPrecedence: requiredPrecedence,
          reason: `${protection.reason} - Protected rule`
        });
      }
    }
  });
  
  // ... rest of method
}
```

### Alternative: Exclusion List Approach

**Simpler implementation:** Add exclusion list for auto-fix

```typescript
// In processLocalAnalysisFindings method
private readonly AUTO_FIX_EXCLUSIONS = new Set([
  '13cc67a0-b26b-4e8c-9960-45ba24301531', // Critical Infrastructure DNS
  '0ff5bbfa-88cb-46cc-a860-4b34091198e8', // Critical Infrastructure HTTP
  '0519eb6f-0e60-4713-8213-19da74e501f9'  // DNS catch-all rule
]);

// Skip protected rules in reordering
if (this.AUTO_FIX_EXCLUSIONS.has(ruleId)) {
  console.log(`⚠️ Skipping protected rule: ${rule.name}`);
  continue;
}
```

## 📋 Verification After Auto-Fix

After running `rules analyze --auto-fix`, always verify ALL critical rules:

```bash
# Check that Critical Infrastructure DNS rule is still first
npm start -- rules list | head -10
# Should show:
# 1. ✅ CRITICAL INFRASTRUCTURE: Essential Services
#    Precedence: 500

# Check that Critical Infrastructure HTTP rule is still second  
npm start -- rules list | grep "CRITICAL INFRASTRUCTURE.*HTTP" -A 3
# Should show:
# 2. ✅ CRITICAL INFRASTRUCTURE: Essential Services (HTTP)
#    Precedence: 501

# Check that DNS blocking rule is still last
npm start -- rules list | grep "Block Unknown DNS" -A 4
# Should show:
# Position: 65 (last)
# Precedence: 63000+ (highest number)
# Action: BLOCK
```

## 🛡️ Emergency Fix Script

Keep the fix script available for quick repairs:

```bash
# If the DNS rule gets moved again, run:
node fix-dns-rule.js
```

## 📝 Notes for Future Development

1. **Auto-Fix Enhancement:** The rule optimizer should be updated to recognize and protect critical infrastructure rules
2. **Rule Categories:** Consider adding rule categories/tags to identify critical infrastructure rules
3. **Validation:** Add post-optimization validation to ensure critical rules maintain correct positions

## ⚠️ Critical Rules Checklist

Before approving any auto-fix changes:

**Critical Infrastructure Rules:**
- [ ] Critical Infrastructure DNS rule is still position #1 (precedence 500)
- [ ] Critical Infrastructure HTTP rule is still position #2 (precedence 501)
- [ ] Both critical infrastructure rules are ENABLED
- [ ] Critical infrastructure rules include all essential domains (Warp.dev, Anthropic, ChatGPT/OpenAI, Google Workspace, Google Cloud, Apple, Cloudflare, SimpleMDM, Ubiquiti, Microsoft, Google & Apple Mail services)

**DNS Catch-All Rule:**
- [ ] DNS blocking rule is still LAST position (#65)
- [ ] DNS blocking rule has highest precedence number (63000+)
- [ ] DNS blocking rule is ENABLED and set to BLOCK

**General Security:**
- [ ] Security blocking rules are still before allow rules
- [ ] No critical infrastructure rules were moved inappropriately
- [ ] Essential services can still resolve and connect

**Remember:** 
1. **Critical Infrastructure rules** ensure essential services always work, even if other rules fail
2. **DNS catch-all rule** is the most critical - if it's not last, DNS filtering breaks entirely
