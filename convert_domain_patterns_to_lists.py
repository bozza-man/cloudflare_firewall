#!/usr/bin/env python3
"""
Convert Domain Regex Patterns to Gateway Lists
============================================

This script converts domain-matching regex patterns to Gateway Lists for better
performance. It:

1. Identifies rules using domain matching patterns
2. Extracts domains from these patterns
3. Groups domains by category
4. Creates Gateway Lists for each group
5. Updates rules to use list references

Author: Assistant
Date: 2025-08-17
"""

import json
import re
from typing import Dict, List, Set, Any, Tuple
from datetime import datetime
from dataclasses import dataclass
from collections import defaultdict

@dataclass
class DomainGroup:
    """A group of related domains."""
    name: str
    description: str
    domains: Set[str]
    
@dataclass
class GatewayList:
    """A Cloudflare Gateway List."""
    id: str
    name: str
    description: str
    domains: Set[str]

class DomainPatternConverter:
    def __init__(self):
        # Common domain patterns to look for
        self.domain_patterns = [
            r'\"\^?[^/\\\\]+\\.([a-zA-Z0-9-]+\\.[a-zA-Z]{2,})\$?\"',  # Basic domain pattern
            r'\"\^?[^/\\\\]+\\.([a-zA-Z0-9-]+\\.[a-zA-Z0-9-]+\\.[a-zA-Z]{2,})\$?\"',  # Subdomain pattern
            r'\"\^?([a-zA-Z0-9-]+\\.[a-zA-Z]{2,})\$?\"',  # Root domain pattern
            r'\"([^\"]+\\.(?:com|net|org|io|ai|dev|cloud))\"'  # Direct domain in quotes
        ]
        
        # Common domain categories
        self.categories = {
            'cloud': ['aws', 'amazon', 'azure', 'gcp', 'google', 'cloudflare'],
            'email': ['gmail', 'outlook', 'hotmail', 'mail', 'smtp', 'imap'],
            'social': ['facebook', 'twitter', 'instagram', 'linkedin'],
            'security': ['sentry', 'datadog', 'auth0', 'okta'],
            'development': ['github', 'gitlab', 'bitbucket', 'npm', 'docker'],
            'streaming': ['netflix', 'prime', 'youtube', 'spotify'],
            'productivity': ['slack', 'zoom', 'teams', 'office365'],
            'cdn': ['akamai', 'fastly', 'cloudfront', 'cdn'],
            'ai': ['openai', 'anthropic', 'claude', 'chatgpt', 'huggingface'],
            'gaming': ['steam', 'epic', 'blizzard', 'xbox'],
            'payment': ['stripe', 'paypal', 'square', 'visa'],
            'analytics': ['google-analytics', 'mixpanel', 'segment'],
            'infrastructure': ['dns', 'ntp', 'ocsp', 'crl']
        }
        
    def extract_domains_from_pattern(self, pattern: str) -> Set[str]:
        """Extract domain names from a regex pattern."""
        domains = set()
        
        # Handle direct domain list patterns in "domain.com" format
        domain_list = re.findall(r'"([^"]+\.[a-zA-Z]{2,})"', pattern)
        domains.update(domain_list)

        # Handle domain patterns in lists like {"domain1.com" "domain2.com"}
        if ' in {' in pattern:
            list_contents = re.findall(r'{([^}]+)}', pattern)
            for content in list_contents:
                list_domains = re.findall(r'"([^"]+\.[a-zA-Z]{2,})"', content)
                domains.update(list_domains)
        
        # Handle Gateway List references
        if ' in $' in pattern:
            list_refs = re.findall(r'\$([a-f0-9-]{36})', pattern)
            if list_refs:
                # These are already Gateway Lists, skip them
                return set()
        
        # Handle complex regex patterns in ".*\.domain\.com" format
        if 'matches' in pattern:
            regex_domains = []
            for p in self.domain_patterns:
                matches = re.findall(p, pattern)
                regex_domains.extend(matches)
            
            # Clean up the domains
            for domain in regex_domains:
                if isinstance(domain, tuple):
                    domain = domain[0]  # Take first group if multiple
                clean_domain = domain.strip('"').strip('^').strip('$')
                if '.' in clean_domain:  # Only add if it looks like a domain
                    domains.add(clean_domain)
        
        return set(d for d in domains if '.' in d)  # Only return valid domains
    
    def categorize_domain(self, domain: str) -> str:
        """Determine the category for a domain."""
        domain_lower = domain.lower()
        
        for category, keywords in self.categories.items():
            for keyword in keywords:
                if keyword in domain_lower:
                    return category
                    
        return 'misc'
        
    def group_domains(self, domains: Set[str]) -> Dict[str, DomainGroup]:
        """Group domains by category."""
        groups = defaultdict(lambda: DomainGroup(
            name='',
            description='',
            domains=set()
        ))
        
        for domain in domains:
            category = self.categorize_domain(domain)
            groups[category].domains.add(domain)
            
        # Set proper names and descriptions
        for category, group in groups.items():
            group.name = f"{category.title()} Domains"
            group.description = f"Common {category.lower()} service domains extracted from regex patterns"
            
        return dict(groups)
        
    def create_gateway_list(self, group: DomainGroup) -> GatewayList:
        """Create a Gateway List for a domain group."""
        # Generate a unique ID based on group name
        list_id = re.sub(r'[^a-zA-Z0-9]', '-', group.name.lower())
        list_id = f"list-{list_id}-{datetime.now().strftime('%Y%m%d')}"
        
        return GatewayList(
            id=list_id,
            name=group.name,
            description=group.description,
            domains=group.domains
        )
        
    def convert_rule_to_use_list(self, rule: Dict[str, Any], gateway_list: GatewayList) -> Dict[str, Any]:
        """Update a rule to use a Gateway List instead of regex."""
        new_rule = rule.copy()
        
        # Replace regex pattern with list reference
        traffic = rule['traffic']
        if 'dns.fqdn' in traffic:
            new_traffic = f"dns.fqdn in ${gateway_list.id}"
        elif 'http.request.host' in traffic:
            new_traffic = f"http.request.host in ${gateway_list.id}"
        else:
            new_traffic = traffic
            
        new_rule['traffic'] = new_traffic
        
        # Update description
        desc = rule.get('description', '')
        optimization_note = f"[DOMAIN OPTIMIZED {datetime.now().strftime('%Y-%m-%d')}] "
        optimization_note += f"Converted regex pattern to Gateway List ({gateway_list.name})"
        new_rule['description'] = f"{optimization_note}\\n\\n{desc}"
        
        return new_rule
        
    def convert_rules_file(self, input_file: str, output_file: str) -> Dict[str, Any]:
        """Convert domain regex patterns in rules to Gateway Lists."""
        try:
            # Read and parse rules
            with open(input_file, 'r') as f:
                data = json.load(f)
                
            rules = data.get('rules', [])
            total_rules = len(rules)
            rules_converted = 0
            domains_found = set()
            conversions = []
            
            # Extract all domains from regex patterns
            for rule in rules:
                traffic = rule.get('traffic', '')
                if not traffic:
                    continue
                    
                # Look for domain patterns
                if any(re.search(p, traffic) for p in self.domain_patterns):
                    domains = self.extract_domains_from_pattern(traffic)
                    domains_found.update(domains)
                    
            # Group domains by category
            domain_groups = self.group_domains(domains_found)
            
            # Create Gateway Lists
            gateway_lists = []
            for category, group in domain_groups.items():
                if group.domains:
                    gateway_list = self.create_gateway_list(group)
                    gateway_lists.append(gateway_list)
                    
            # Update rules to use lists
            new_rules = []
            for rule in rules:
                traffic = rule.get('traffic', '')
                if not traffic:
                    new_rules.append(rule)
                    continue
                    
                # Check if this rule has domain patterns
                matched_list = None
                for gw_list in gateway_lists:
                    # If any domains from this list are in the rule's pattern
                    rule_domains = self.extract_domains_from_pattern(traffic)
                    if rule_domains & gw_list.domains:
                        matched_list = gw_list
                        break
                        
                if matched_list:
                    new_rule = self.convert_rule_to_use_list(rule, matched_list)
                    new_rules.append(new_rule)
                    rules_converted += 1
                    
                    conversions.append({
                        'rule_id': rule.get('id', 'Unknown'),
                        'rule_name': rule.get('name', 'Unknown'),
                        'old_traffic': traffic,
                        'new_traffic': new_rule['traffic'],
                        'list_name': matched_list.name,
                        'list_id': matched_list.id,
                        'domains': list(matched_list.domains)
                    })
                else:
                    new_rules.append(rule)
                    
            # Update rules in data
            data['rules'] = new_rules
            
            # Save updated config
            with open(output_file, 'w') as f:
                json.dump(data, f, indent=2)
                
            # Generate summary
            summary = {
                'timestamp': datetime.now().isoformat(),
                'input_file': input_file,
                'output_file': output_file,
                'total_rules': total_rules,
                'rules_converted': rules_converted,
                'domains_found': len(domains_found),
                'lists_created': len(gateway_lists),
                'gateway_lists': [
                    {
                        'id': l.id,
                        'name': l.name,
                        'description': l.description,
                        'domains': list(l.domains)
                    }
                    for l in gateway_lists
                ],
                'conversions': conversions
            }
            
            return summary
            
        except Exception as e:
            return {'error': f"Failed to convert rules: {str(e)}"}
            
    def generate_report(self, summary: Dict[str, Any]) -> str:
        """Generate a detailed conversion report."""
        if 'error' in summary:
            return f"ERROR: {summary['error']}"
            
        report = []
        report.append("DOMAIN PATTERN CONVERSION REPORT")
        report.append("=" * 50)
        report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")
        
        # Summary statistics
        report.append("SUMMARY")
        report.append("-" * 20)
        report.append(f"Total rules processed: {summary['total_rules']}")
        report.append(f"Rules converted: {summary['rules_converted']}")
        report.append(f"Unique domains found: {summary['domains_found']}")
        report.append(f"Gateway Lists created: {summary['lists_created']}")
        report.append("")
        
        # Gateway Lists created
        report.append("GATEWAY LISTS CREATED")
        report.append("-" * 25)
        for gw_list in summary['gateway_lists']:
            report.append(f"List: {gw_list['name']} (ID: {gw_list['id']})")
            report.append(f"Description: {gw_list['description']}")
            report.append("Domains:")
            for domain in sorted(gw_list['domains']):
                report.append(f"  - {domain}")
            report.append("")
            
        # Rule conversions
        report.append("RULE CONVERSIONS")
        report.append("-" * 20)
        for conv in summary['conversions']:
            report.append(f"Rule: {conv['rule_name']} (ID: {conv['rule_id']})")
            report.append(f"List: {conv['list_name']}")
            report.append("Before:")
            report.append(f"  {conv['old_traffic']}")
            report.append("After:")
            report.append(f"  {conv['new_traffic']}")
            report.append("")
            
        # Next steps
        report.append("NEXT STEPS")
        report.append("-" * 15)
        report.append("1. Create the Gateway Lists in Cloudflare dashboard")
        report.append("2. Add all domains to their respective lists")
        report.append("3. Test the converted rules in staging")
        report.append("4. Deploy to production with monitoring")
        report.append("5. Clean up old regex-based rules")
        
        return "\\n".join(report)

def main():
    """Main function to convert domain patterns to Gateway Lists."""
    
    converter = DomainPatternConverter()
    
    print("🔄 CONVERTING DOMAIN PATTERNS TO GATEWAY LISTS")
    print("=" * 50)
    print()
    
    # Convert the patterns
    input_file = 'gateway-config-security-fixed-20250817_233513.json'
    output_file = f'gateway-config-domain-fixed-{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
    
    print(f"Converting domain patterns to Gateway Lists:")
    print(f"Input:  {input_file}")
    print(f"Output: {output_file}")
    print()
    
    summary = converter.convert_rules_file(input_file, output_file)
    
    if 'error' in summary:
        print(f"❌ Error: {summary['error']}")
        return False
        
    # Generate report
    report_file = f"domain_conversion_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    report = converter.generate_report(summary)
    
    with open(report_file, 'w') as f:
        f.write(report)
        
    print("🎯 SUMMARY:")
    print(f"   Rules processed: {summary['total_rules']}")
    print(f"   Rules converted: {summary['rules_converted']}")
    print(f"   Domains found: {summary['domains_found']}")
    print(f"   Gateway Lists created: {summary['lists_created']}")
    print()
    print(f"   Output config: {output_file}")
    print(f"   Report: {report_file}")
    
    if summary['rules_converted'] > 0:
        print("\\n✅ DOMAIN PATTERNS CONVERTED!")
        print("   Ready for Gateway List creation and testing.")
    else:
        print("\\n⚠️  No rules were converted.")
        print("   Please check the report for details.")
    
    return summary

if __name__ == "__main__":
    result = main()
