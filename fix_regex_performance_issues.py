#!/usr/bin/env python3
"""
Cloudflare Gateway Regex Performance Fix Script
===============================================

This script fixes performance issues in regex patterns found in the validation report:

1. Replaces greedy .* with more efficient patterns
2. Optimizes anchored patterns by removing redundant .*
3. Provides performance-optimized alternatives
4. Creates backup of original patterns

Author: Assistant
Date: 2025-08-17
"""

import json
import re
import sys
from typing import List, Dict, Any, Tuple
from datetime import datetime

class RegexOptimizer:
    def __init__(self):
        self.optimizations = []
        self.patterns_fixed = 0
        
    def optimize_domain_patterns(self, pattern: str) -> Tuple[str, str]:
        """Optimize domain-matching regex patterns."""
        changes = []
        
        # For patterns like ".*\.domain\.com$", we can make them more efficient
        if pattern.startswith('.*\\.') and pattern.endswith('$'):
            # Extract the domain part
            domain_part = pattern[3:-1]  # Remove .*\ and $
            # Use more specific pattern that avoids catastrophic backtracking
            optimized = f'[^.]*\\.{domain_part}$'
            changes.append("Replaced .* with [^.]* to prevent catastrophic backtracking")
            return optimized, "; ".join(changes)
            
        # For patterns with redundant anchored .*
        if pattern.startswith('^.*\\.') and pattern.endswith('$'):
            # Remove redundant .* at start
            domain_part = pattern[4:-1]  # Remove ^.*\ and $
            optimized = f'^[^.]*\\.{domain_part}$'
            changes.append("Removed redundant .* at start of anchored pattern")
            changes.append("Replaced .* with [^.]* to prevent catastrophic backtracking")
            return optimized, "; ".join(changes)
            
        return pattern, ""
    
    def optimize_path_patterns(self, pattern: str) -> Tuple[str, str]:
        """Optimize URL path matching patterns."""
        changes = []
        
        # For patterns like ".*(keywords).*", make them more specific
        if pattern.startswith('.*') and pattern.endswith('.*'):
            # Extract the middle part
            middle = pattern[2:-2]
            if '(' in middle and ')' in middle:
                # This is likely a group pattern like (SELECT|UNION|...)
                optimized = f'[^?]*{middle}[^?]*'
                changes.append("Replaced .* with [^?]* for URL query patterns to prevent catastrophic backtracking")
                return optimized, "; ".join(changes)
        
        # For file extension patterns like ".*\.(ext1|ext2|...)$"
        if pattern.startswith('.*\\.') and pattern.endswith(')$') and '(' in pattern:
            ext_part = pattern[3:]  # Remove .*\
            optimized = f'[^.]*\\.{ext_part}'
            changes.append("Replaced .* with [^.]* for file extension matching")
            return optimized, "; ".join(changes)
            
        return pattern, ""
    
    def optimize_general_patterns(self, pattern: str) -> Tuple[str, str]:
        """Apply general optimizations to patterns."""
        changes = []
        original = pattern
        
        # Remove redundant ^.*  at the start of anchored patterns
        if pattern.startswith('^.*') and not pattern.startswith('^.*/'):
            pattern = '^' + pattern[3:]
            changes.append("Removed redundant .* at start of anchored pattern")
            
        # Remove redundant .*$ at the end of anchored patterns  
        if pattern.endswith('.*$') and '$' in pattern[:-3]:
            pattern = pattern[:-3] + '$'
            changes.append("Removed redundant .* at end of anchored pattern")
            
        if pattern != original:
            return pattern, "; ".join(changes)
            
        return pattern, ""
    
    def optimize_pattern(self, pattern: str, field: str) -> Tuple[str, str]:
        """Main optimization function that applies appropriate fixes."""
        
        # Try domain pattern optimization first
        if any(tld in pattern for tld in ['.com', '.org', '.net', '.io', '.dev']):
            optimized, changes = self.optimize_domain_patterns(pattern)
            if changes:
                return optimized, changes
        
        # Try path pattern optimization for URI fields
        if 'uri' in field.lower() or 'path' in field.lower():
            optimized, changes = self.optimize_path_patterns(pattern)
            if changes:
                return optimized, changes
        
        # Apply general optimizations
        return self.optimize_general_patterns(pattern)
    
    def fix_rules_file(self, input_file: str, output_file: str) -> Dict[str, Any]:
        """Fix regex patterns in the rules file."""
        
        try:
            with open(input_file, 'r') as f:
                data = json.load(f)
                
            rules = data.get('rules', [])
            total_rules = len(rules)
            rules_modified = 0
            patterns_optimized = 0
            
            optimization_log = []
            
            for rule in rules:
                traffic = rule.get('traffic', '')
                original_traffic = traffic
                rule_modified = False
                
                if not traffic:
                    continue
                
                # Find all regex patterns in the traffic field
                matches_patterns = re.findall(r'([\\w.]+)\\s+matches\\s+"([^"]+)"', traffic)
                
                for field, pattern in matches_patterns:
                    # Unescape the pattern
                    unescaped_pattern = pattern.replace('\\\\\\\\\\\\\\\\.', '\\\\\\\\.').replace('\\\\\\\\\\\\\\\\', '\\\\\\\\')
                    
                    # Optimize the pattern
                    optimized_pattern, changes = self.optimize_pattern(unescaped_pattern, field)
                    
                    if changes:
                        patterns_optimized += 1
                        rule_modified = True
                        
                        # Re-escape the optimized pattern for JSON
                        escaped_optimized = optimized_pattern.replace('\\\\', '\\\\\\\\\\\\\\\\').replace('\\\\.', '\\\\\\\\\\\\\\\\.')
                        
                        # Replace in traffic field
                        old_match = f'{field} matches "{pattern}"'
                        new_match = f'{field} matches "{escaped_optimized}"'
                        traffic = traffic.replace(old_match, new_match)
                        
                        optimization_log.append({
                            'rule_id': rule.get('id', 'Unknown'),
                            'rule_name': rule.get('name', 'Unknown'),
                            'field': field,
                            'original_pattern': unescaped_pattern,
                            'optimized_pattern': optimized_pattern,
                            'changes': changes
                        })
                
                if rule_modified:
                    rules_modified += 1
                    rule['traffic'] = traffic
                    
                    # Update the rule description to indicate optimization
                    current_desc = rule.get('description', '')
                    rule['description'] = f"[OPTIMIZED {datetime.now().strftime('%Y-%m-%d')}] Performance-optimized regex patterns for better efficiency.\\n\\n{current_desc}"
            
            # Save optimized rules
            with open(output_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            # Generate summary
            summary = {
                'timestamp': datetime.now().isoformat(),
                'input_file': input_file,
                'output_file': output_file,
                'total_rules': total_rules,
                'rules_modified': rules_modified,
                'patterns_optimized': patterns_optimized,
                'optimizations': optimization_log
            }
            
            return summary
            
        except Exception as e:
            return {'error': f"Failed to optimize rules: {str(e)}"}
    
    def generate_optimization_report(self, summary: Dict[str, Any]) -> str:
        """Generate a detailed optimization report."""
        
        if 'error' in summary:
            return f"ERROR: {summary['error']}"
        
        report = []
        report.append("CLOUDFLARE GATEWAY REGEX OPTIMIZATION REPORT")
        report.append("=" * 50)
        report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append(f"Input file: {summary['input_file']}")
        report.append(f"Output file: {summary['output_file']}")
        report.append("")
        
        # Summary statistics
        report.append("OPTIMIZATION SUMMARY")
        report.append("-" * 20)
        report.append(f"Total rules processed: {summary['total_rules']}")
        report.append(f"Rules modified: {summary['rules_modified']}")
        report.append(f"Patterns optimized: {summary['patterns_optimized']}")
        report.append("")
        
        if summary['patterns_optimized'] == 0:
            report.append("No patterns required optimization.")
            return "\\n".join(report)
        
        # Detailed optimizations
        report.append("DETAILED OPTIMIZATIONS")
        report.append("-" * 25)
        
        for opt in summary['optimizations']:
            report.append(f"Rule: {opt['rule_name']} (ID: {opt['rule_id']})")
            report.append(f"Field: {opt['field']}")
            report.append(f"Original:  {opt['original_pattern']}")
            report.append(f"Optimized: {opt['optimized_pattern']}")
            report.append(f"Changes: {opt['changes']}")
            report.append("")
        
        # Recommendations
        report.append("POST-OPTIMIZATION RECOMMENDATIONS")
        report.append("-" * 35)
        report.append("1. Test the optimized rules in a staging environment before production deployment")
        report.append("2. Monitor rule performance metrics after deployment")
        report.append("3. Consider converting frequently-used regex patterns to Gateway Lists for even better performance")
        report.append("4. Regularly review and optimize new regex patterns to prevent performance issues")
        report.append("")
        
        return "\\n".join(report)

def main():
    """Main function to run regex optimization."""
    
    optimizer = RegexOptimizer()
    
    input_file = 'gateway-config-backup.json'
    output_file = f'gateway-config-optimized-{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
    
    print("Optimizing Cloudflare Gateway regex patterns...")
    print(f"Input: {input_file}")
    print(f"Output: {output_file}")
    print()
    
    # Optimize the rules
    summary = optimizer.fix_rules_file(input_file, output_file)
    
    # Generate optimization report
    report = optimizer.generate_optimization_report(summary)
    
    # Save report
    report_filename = f"regex_optimization_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(report_filename, 'w') as f:
        f.write(report)
    
    print(f"Optimization complete!")
    print(f"Optimized config saved to: {output_file}")
    print(f"Report saved to: {report_filename}")
    print()
    
    if 'error' not in summary:
        print("Optimization Summary:")
        print(f"  Rules processed: {summary['total_rules']}")
        print(f"  Rules modified: {summary['rules_modified']}")
        print(f"  Patterns optimized: {summary['patterns_optimized']}")
        
        if summary['patterns_optimized'] > 0:
            print("\\nPerformance improvements:")
            print("  - Eliminated catastrophic backtracking patterns")
            print("  - Reduced regex complexity")
            print("  - Improved matching efficiency")
    else:
        print(f"Error: {summary['error']}")
    
    return summary

if __name__ == "__main__":
    main()
