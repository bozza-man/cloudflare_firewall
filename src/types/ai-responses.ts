/**
 * TypeScript interfaces for AI response data structures
 * These interfaces define the expected shape of AI responses for better type safety
 */

import type { GatewayRule } from './gateway.js';

// Base interface for AI analysis responses
export interface AIAnalysisResponse {
  summary: string;
  criticalIssues: AIIssue[];
  recommendations: AIRecommendation[];
  optimizedRuleset?: AIOptimizedRule[];
}

// AI Issue structure
export interface AIIssue {
  description?: string;
  message?: string;
  reason?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  type?: 'warning' | 'error' | 'info';
}

// AI Recommendation structure  
export interface AIRecommendation {
  action: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  affectedRules?: string[];
  category?: string;
  impact?: string;
}

// Optimized rule from AI analysis
export interface AIOptimizedRule {
  rule: GatewayRule;
  changes?: string[];
  newPrecedence?: number;
  reason?: string;
}

// Local analysis structures
export interface LocalAnalysis {
  issues: LocalAnalysisIssue[];
  proposedOrder?: ProposedRuleOrder[];
  summary: {
    totalRules: number;
    errors: number;
    warnings: number;
    suggestions: number;
  };
}

export interface LocalAnalysisIssue {
  ruleId: string;
  category: 'redundancy' | 'conflict' | 'ordering' | 'performance';
  type: 'error' | 'warning' | 'info';
  message: string;
  relatedRules?: string[];
  severity?: 'low' | 'medium' | 'high';
}

export interface ProposedRuleOrder {
  rule: GatewayRule;
  suggestedPrecedence: number;
  reason: string;
}

// Cloudflare API error structure
export interface CloudflareError {
  code: number;
  message: string;
  error_chain?: CloudflareError[];
}

// Generic Cloudflare response wrapper with proper error typing
export interface TypedCloudflareResponse<T = unknown> {
  result?: T;
  success: boolean;
  errors?: CloudflareError[];
  messages?: string[];
}

// Type guards for runtime type checking
export function isAIAnalysisResponse(obj: unknown): obj is AIAnalysisResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as AIAnalysisResponse).summary === 'string' &&
    Array.isArray((obj as AIAnalysisResponse).criticalIssues) &&
    Array.isArray((obj as AIAnalysisResponse).recommendations)
  );
}

export function isAIIssue(obj: unknown): obj is AIIssue {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (typeof (obj as AIIssue).description === 'string' ||
     typeof (obj as AIIssue).message === 'string' ||
     typeof (obj as AIIssue).reason === 'string')
  );
}

export function isAIRecommendation(obj: unknown): obj is AIRecommendation {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as AIRecommendation).action === 'string' &&
    typeof (obj as AIRecommendation).reason === 'string' &&
    typeof (obj as AIRecommendation).priority === 'string'
  );
}

export function isLocalAnalysis(obj: unknown): obj is LocalAnalysis {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    Array.isArray((obj as LocalAnalysis).issues)
  );
}

// Helper function to safely extract issue text
export function extractIssueText(issue: unknown): string {
  if (typeof issue === 'string') {
    return issue;
  }
  
  if (isAIIssue(issue)) {
    return issue.description || issue.message || issue.reason || 'Unknown issue';
  }
  
  return JSON.stringify(issue);
}

// Helper function to safely cast unknown API response data
export function castToAIAnalysisResponse(data: unknown): AIAnalysisResponse {
  if (isAIAnalysisResponse(data)) {
    return data;
  }
  
  // Provide fallback structure for invalid responses
  return {
    summary: 'Invalid AI response received',
    criticalIssues: [],
    recommendations: [],
    optimizedRuleset: []
  };
}
