#!/usr/bin/env python3
"""
Cloudflare Gateway Regex Validation Script
==========================================

This script analyzes Cloudflare Gateway rules to:
1. Extract and catalog all regex patterns
2. Test regex syntax validity
3. Check for common regex issues
4. Verify Cloudflare Gateway compatibility
5. Generate optimization recommendations

Author: Assistant
Date: 2025-08-17
"""

import json
import re
import sys
from typing import List, Dict, Any, Tuple, Set
from datetime import datetime

class RegexValidator:
    def __init__(self):
        self.patterns = []
        self.issues = []
        self.statistics = {
            'total_rules': 0,
            'rules_with_regex': 0,
            'total_regex_patterns': 0,
            'valid_patterns': 0,
            'invalid_patterns': 0,
            'performance_concerns': 0
        }
        
        # Common problematic patterns in Cloudflare Gateway
        self.cf_issues = {
            'lookahead_lookbehind': r'\(\?[=!<]',
            'word_boundaries': r'\\b',
            'backreferences': r'\\[0-9]',
            'possessive_quantifiers': r'[+*?]\+',
            'atomic_groups': r'\(\?\>',
            'recursive_patterns': r'\(\?R\)',
            'complex_unicode': r'\\[pP]\{[^}]+\}',
        }
        
        # Performance-concerning patterns
        self.performance_patterns = {
            'catastrophic_backtracking': [
                r'\(\.\*\)\+',
                r'\(\.\+\)\+', 
                r'\(\.\*\)\*',
                r'\(.*\?\)\+',
                r'(\w+)+',
            ],
            'deep_nesting': r'\([^)]*\([^)]*\([^)]*\(',
            'long_alternation': r'([^|]*\|){10,}',
            'greedy_dot_star': r'\.\*(?!\?)',
        }

    def extract_regex_patterns(self, rule: Dict[str, Any]) -> List[Tuple[str, str, str, str, str]]:
        """Extract regex patterns from a rule's traffic field."""
        patterns = []
        traffic = rule.get('traffic', '')
        rule_name = rule.get('name', 'Unknown')
        rule_id = rule.get('id', 'Unknown')
        
        if not traffic:
            return patterns
            
        # Look for 'matches' keyword which indicates regex usage
        # Handle escaped quotes and backslashes properly
        matches_patterns = re.findall(r'([\w.]+)\s+matches\s+"([^"]+)"', traffic)
        for field, pattern in matches_patterns:
            # Unescape the pattern - convert \\\\. back to \\.
            unescaped_pattern = pattern.replace('\\\\\\\\.', '\\\\.').replace('\\\\\\\\', '\\\\')
            patterns.append((rule_name, rule_id, field, unescaped_pattern, 'matches'))
            
        return patterns
        
    def validate_regex_syntax(self, pattern: str) -> Tuple[bool, str]:
        """Test if a regex pattern has valid syntax."""
        try:
            re.compile(pattern)
            return True, "Valid syntax"
        except re.error as e:
            return False, f"Syntax error: {str(e)}"
            
    def check_cloudflare_compatibility(self, pattern: str) -> List[str]:
        """Check for Cloudflare Gateway unsupported features."""
        issues = []
        
        for issue_name, issue_pattern in self.cf_issues.items():
            if re.search(issue_pattern, pattern):
                issues.append(f"Uses unsupported feature: {issue_name}")
                
        return issues
        
    def check_performance_issues(self, pattern: str) -> List[str]:
        """Check for potential performance issues."""
        issues = []
        
        # Check for catastrophic backtracking patterns
        for backtrack_pattern in self.performance_patterns['catastrophic_backtracking']:
            if re.search(backtrack_pattern, pattern):
                issues.append("Potential catastrophic backtracking")
                break
                
        # Check for deep nesting
        if re.search(self.performance_patterns['deep_nesting'], pattern):
            issues.append("Deep nesting may cause performance issues")
            
        # Check for long alternations
        if re.search(self.performance_patterns['long_alternation'], pattern):
            issues.append("Long alternation list may impact performance")
            
        # Check for greedy dot-star
        if re.search(self.performance_patterns['greedy_dot_star'], pattern):
            issues.append("Greedy .* may cause performance issues")
            
        return issues
        
    def analyze_pattern_complexity(self, pattern: str) -> Dict[str, Any]:
        """Analyze pattern complexity metrics."""
        return {
            'length': len(pattern),
            'alternation_count': pattern.count('|'),
            'group_count': pattern.count('('),
            'character_class_count': pattern.count('['),
            'quantifier_count': len(re.findall(r'[*+?{]', pattern)),
            'escape_count': pattern.count('\\'),
            'dot_count': pattern.count('.'),
        }
        
    def suggest_optimizations(self, pattern: str) -> List[str]:
        """Suggest pattern optimizations."""
        suggestions = []
        
        # Check for unescaped dots in domain patterns
        if '.' in pattern and '\\.' not in pattern:
            if re.search(r'[a-zA-Z]\.[a-zA-Z]', pattern):
                suggestions.append("Consider escaping dots (.) in domain patterns as (\\\\.') for literal matching")
                
        # Check for inefficient start/end anchors
        if pattern.startswith('^.*') or pattern.endswith('.*$'):
            suggestions.append("Remove redundant .* at start/end of anchored patterns")
            
        # Check for case sensitivity
        if re.search(r'[A-Z]', pattern) and re.search(r'[a-z]', pattern):
            suggestions.append("Consider using case-insensitive matching flag if available")
            
        # Check for redundant escaping
        if '\\\\\\\\' in pattern:
            suggestions.append("Check for redundant escaping")
            
        return suggestions

    def analyze_rules_file(self, filename: str) -> Dict[str, Any]:
        """Analyze all rules in the backup file."""
        try:
            with open(filename, 'r') as f:
                data = json.load(f)
                
            rules = data.get('rules', [])
            self.statistics['total_rules'] = len(rules)
            
            all_patterns = []
            detailed_results = []
            
            for rule in rules:
                patterns = self.extract_regex_patterns(rule)
                if patterns:
                    self.statistics['rules_with_regex'] += 1
                    
                for rule_name, rule_id, field, pattern, operator in patterns:
                    self.statistics['total_regex_patterns'] += 1
                    all_patterns.append(pattern)
                    
                    # Validate syntax
                    is_valid, syntax_msg = self.validate_regex_syntax(pattern)
                    if is_valid:
                        self.statistics['valid_patterns'] += 1
                    else:
                        self.statistics['invalid_patterns'] += 1
                        
                    # Check compatibility
                    cf_issues = self.check_cloudflare_compatibility(pattern)
                    
                    # Check performance
                    perf_issues = self.check_performance_issues(pattern)
                    if perf_issues:
                        self.statistics['performance_concerns'] += 1
                        
                    # Analyze complexity
                    complexity = self.analyze_pattern_complexity(pattern)
                    
                    # Get suggestions
                    suggestions = self.suggest_optimizations(pattern)
                    
                    result = {
                        'rule_name': rule_name,
                        'rule_id': rule_id,
                        'field': field,
                        'pattern': pattern,
                        'operator': operator,
                        'is_valid_syntax': is_valid,
                        'syntax_message': syntax_msg,
                        'cloudflare_issues': cf_issues,
                        'performance_issues': perf_issues,
                        'complexity': complexity,
                        'suggestions': suggestions,
                        'rule_enabled': rule.get('enabled', False),
                        'rule_precedence': rule.get('precedence', 0)
                    }
                    
                    detailed_results.append(result)
                    
            return {
                'statistics': self.statistics,
                'detailed_results': detailed_results,
                'unique_patterns': list(set(all_patterns))
            }
            
        except Exception as e:
            return {'error': f"Failed to analyze file: {str(e)}"}

    def generate_report(self, analysis: Dict[str, Any]) -> str:
        """Generate a comprehensive regex validation report."""
        if 'error' in analysis:
            return f"ERROR: {analysis['error']}"
            
        stats = analysis['statistics']
        results = analysis['detailed_results']
        
        report = []
        report.append("CLOUDFLARE GATEWAY REGEX VALIDATION REPORT")
        report.append("=" * 50)
        report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")
        
        # Statistics
        report.append("OVERVIEW STATISTICS")
        report.append("-" * 20)
        report.append(f"Total rules analyzed: {stats['total_rules']}")
        report.append(f"Rules with regex patterns: {stats['rules_with_regex']}")
        report.append(f"Total regex patterns found: {stats['total_regex_patterns']}")
        report.append(f"Valid syntax patterns: {stats['valid_patterns']}")
        report.append(f"Invalid syntax patterns: {stats['invalid_patterns']}")
        report.append(f"Performance concerns: {stats['performance_concerns']}")
        report.append("")
        
        if stats['total_regex_patterns'] == 0:
            report.append("No regex patterns found in rules.")
            return "\n".join(report)
            
        # Issues Summary
        syntax_errors = [r for r in results if not r['is_valid_syntax']]
        cf_issues = [r for r in results if r['cloudflare_issues']]
        perf_issues = [r for r in results if r['performance_issues']]
        
        if syntax_errors:
            report.append("SYNTAX ERRORS")
            report.append("-" * 15)
            for result in syntax_errors:
                report.append(f"Rule: {result['rule_name']}")
                report.append(f"Pattern: {result['pattern']}")
                report.append(f"Error: {result['syntax_message']}")
                report.append("")
                
        if cf_issues:
            report.append("CLOUDFLARE COMPATIBILITY ISSUES")
            report.append("-" * 35)
            for result in cf_issues:
                report.append(f"Rule: {result['rule_name']}")
                report.append(f"Pattern: {result['pattern']}")
                for issue in result['cloudflare_issues']:
                    report.append(f"  • {issue}")
                report.append("")
                
        if perf_issues:
            report.append("PERFORMANCE CONCERNS")
            report.append("-" * 20)
            for result in perf_issues:
                report.append(f"Rule: {result['rule_name']}")
                report.append(f"Pattern: {result['pattern']}")
                for issue in result['performance_issues']:
                    report.append(f"  • {issue}")
                report.append("")
                
        # Detailed Analysis
        report.append("DETAILED PATTERN ANALYSIS")
        report.append("-" * 30)
        for result in results:
            report.append(f"Rule: {result['rule_name']} (ID: {result['rule_id']})")
            report.append(f"Field: {result['field']}")
            report.append(f"Pattern: {result['pattern']}")
            report.append(f"Enabled: {result['rule_enabled']}")
            report.append(f"Precedence: {result['rule_precedence']}")
            
            complexity = result['complexity']
            report.append(f"Complexity: Length={complexity['length']}, Groups={complexity['group_count']}, Alternations={complexity['alternation_count']}")
            
            if result['suggestions']:
                report.append("Suggestions:")
                for suggestion in result['suggestions']:
                    report.append(f"  • {suggestion}")
                    
            report.append("")
            
        # Recommendations
        report.append("RECOMMENDATIONS")
        report.append("-" * 15)
        
        if syntax_errors:
            report.append("1. Fix syntax errors in regex patterns before deployment")
            
        if cf_issues:
            report.append("2. Replace unsupported regex features with Cloudflare Gateway compatible alternatives")
            
        if perf_issues:
            report.append("3. Optimize patterns with performance concerns to prevent timeouts")
            
        report.append("4. Test all regex patterns with sample data to ensure they work as expected")
        report.append("5. Consider using Gateway Lists instead of complex regex patterns where possible")
        
        return "\n".join(report)

def main():
    """Main function to run regex validation."""
    validator = RegexValidator()
    
    # Analyze the gateway config backup
    print("Analyzing Cloudflare Gateway rules for regex patterns...")
    analysis = validator.analyze_rules_file('gateway-config-backup.json')
    
    # Generate report
    report = validator.generate_report(analysis)
    
    # Save report
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_filename = f"regex_validation_report_{timestamp}.txt"
    
    with open(report_filename, 'w') as f:
        f.write(report)
        
    print(f"Report saved to: {report_filename}")
    print("\nRegex Validation Summary:")
    print(f"Total patterns analyzed: {analysis.get('statistics', {}).get('total_regex_patterns', 0)}")
    print(f"Issues found: {len([r for r in analysis.get('detailed_results', []) if not r['is_valid_syntax'] or r['cloudflare_issues'] or r['performance_issues']])}")
    
    return analysis

if __name__ == "__main__":
    main()
