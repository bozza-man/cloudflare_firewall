/**
 * Cloudflare Firewall Manager API Worker
 * Full integration with all Cloudflare services
 */

import { Router } from 'itty-router';
import { GatewayAIAssistantV2 } from '../llm/gateway-ai-assistant-v2-worker';

// Environment types
export interface Env {
  // AI Services
  AI: any;
  VECTORIZE: any;
  AI_GATEWAY_ID: string;
  AI_GATEWAY_SLUG: string;
  
  // Storage
  DB: D1Database;
  BACKUPS: R2Bucket;
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;
  
  // Analytics
  ANALYTICS: AnalyticsEngineDataset;
  
  // Configuration
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  ANTHROPIC_API_KEY?: string;
  JWT_SECRET?: string;
  CORS_ORIGIN: string;
  DEBUG: string;
}

const router = Router();

// Health check
router.get('/health', async (request, env: Env) => {
  return Response.json({
    status: 'healthy',
    services: {
      ai: !!env.AI,
      vectorize: !!env.VECTORIZE,
      database: !!env.DB,
      storage: !!env.BACKUPS
    },
    timestamp: new Date().toISOString()
  });
});

// Debug AI endpoint
router.get('/debug/ai', async (request, env: Env) => {
  try {
    const aiAvailable = !!env.AI;
    let testResult = null;
    
    if (aiAvailable) {
      // Try a simple AI call
      testResult = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [{ 
          role: 'user', 
          content: 'Reply with just the word TEST' 
        }],
        max_tokens: 10
      });
    }
    
    return Response.json({
      ai_binding_present: aiAvailable,
      ai_gateway_id: env.AI_GATEWAY_ID,
      anthropic_key_present: !!env.ANTHROPIC_API_KEY,
      cloudflare_account_id: env.CLOUDFLARE_ACCOUNT_ID,
      test_response: testResult,
      env_keys: Object.keys(env).sort()
    });
  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: env.DEBUG === 'true' ? error.stack : undefined
    }, { status: 500 });
  }
});

// Generate rule from natural language
router.post('/api/generate', async (request, env: Env) => {
  try {
    const { description, context } = await request.json();
    
    if (!description) {
      return Response.json({ error: 'Description required' }, { status: 400 });
    }
    
    const assistant = new GatewayAIAssistantV2(env);
    const rule = await assistant.generateRuleFromDescription(description, context);
    
    // Log analytics
    env.ANALYTICS?.writeDataPoint({
      blobs: ['rule_generation'],
      doubles: [1]
    });
    
    return Response.json(rule);
  } catch (error: any) {
    console.error('Generation error:', error);
    return Response.json({ 
      error: 'Failed to generate rule',
      details: env.DEBUG === 'true' ? error.message : undefined
    }, { status: 500 });
  }
});

// Analyze conflicts
router.post('/api/analyze', async (request, env: Env) => {
  try {
    const { newRule, existingRules } = await request.json();
    
    const assistant = new GatewayAIAssistantV2(env);
    const analysis = await assistant.analyzeRuleConflictsWithResolutions(
      newRule,
      existingRules || []
    );
    
    return Response.json(analysis);
  } catch (error: any) {
    console.error('Analysis error:', error);
    return Response.json({ 
      error: 'Analysis failed',
      details: env.DEBUG === 'true' ? error.message : undefined
    }, { status: 500 });
  }
});

// Optimize ruleset
router.post('/api/optimize', async (request, env: Env) => {
  try {
    const { rules } = await request.json();
    
    if (!rules || !Array.isArray(rules)) {
      return Response.json({ error: 'Rules array required' }, { status: 400 });
    }
    
    const assistant = new GatewayAIAssistantV2(env);
    const optimization = await assistant.optimizeRuleset(rules);
    
    // Store in D1 if available
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO optimization_history (timestamp, rules_count, analysis)
          VALUES (?, ?, ?)
        `).bind(
          new Date().toISOString(),
          rules.length,
          JSON.stringify(optimization)
        ).run();
      } catch (dbError) {
        console.error('DB error:', dbError);
      }
    }
    
    return Response.json(optimization);
  } catch (error: any) {
    console.error('Optimization error:', error);
    return Response.json({ 
      error: 'Optimization failed',
      details: env.DEBUG === 'true' ? error.message : undefined
    }, { status: 500 });
  }
});

// Vector search for similar rules
router.post('/api/search', async (request, env: Env) => {
  try {
    const { query, limit = 5 } = await request.json();
    
    if (!query) {
      return Response.json({ error: 'Query required' }, { status: 400 });
    }
    
    if (!env.AI || !env.VECTORIZE) {
      return Response.json({ 
        error: 'Vector search not available' 
      }, { status: 503 });
    }
    
    // Generate embedding
    const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: query
    });
    
    // Search vector database
    const results = await env.VECTORIZE.query({
      vector: embedding.data[0],
      topK: limit,
      includeMetadata: true
    });
    
    return Response.json({
      query,
      results: results.matches || []
    });
  } catch (error: any) {
    console.error('Search error:', error);
    return Response.json({ 
      error: 'Search failed',
      details: env.DEBUG === 'true' ? error.message : undefined
    }, { status: 500 });
  }
});

// Create backup
router.post('/api/backup', async (request, env: Env) => {
  try {
    const { rules } = await request.json();
    
    if (!env.BACKUPS) {
      return Response.json({ 
        error: 'Backup service not available' 
      }, { status: 503 });
    }
    
    const timestamp = new Date().toISOString();
    const key = `backups/rules-${timestamp}.json`;
    
    await env.BACKUPS.put(key, JSON.stringify({
      timestamp,
      rules,
      metadata: {
        count: rules.length,
        version: '2.0.0'
      }
    }));
    
    return Response.json({ 
      success: true,
      backupKey: key,
      timestamp
    });
  } catch (error: any) {
    console.error('Backup error:', error);
    return Response.json({ 
      error: 'Backup failed',
      details: env.DEBUG === 'true' ? error.message : undefined
    }, { status: 500 });
  }
});

// Restore from backup
router.post('/api/restore', async (request, env: Env) => {
  try {
    const { backupKey } = await request.json();
    
    if (!backupKey) {
      return Response.json({ error: 'Backup key required' }, { status: 400 });
    }
    
    if (!env.BACKUPS) {
      return Response.json({ 
        error: 'Backup service not available' 
      }, { status: 503 });
    }
    
    const object = await env.BACKUPS.get(backupKey);
    if (!object) {
      return Response.json({ error: 'Backup not found' }, { status: 404 });
    }
    
    const data = await object.json();
    return Response.json(data);
  } catch (error: any) {
    console.error('Restore error:', error);
    return Response.json({ 
      error: 'Restore failed',
      details: env.DEBUG === 'true' ? error.message : undefined
    }, { status: 500 });
  }
});

// CORS middleware
function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Main handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        headers: corsHeaders(env.CORS_ORIGIN) 
      });
    }
    
    try {
      const response = await router.handle(request, env);
      
      // Add CORS headers to response
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders(env.CORS_ORIGIN)).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      
      return newResponse;
    } catch (error: any) {
      console.error('Worker error:', error);
      
      const errorResponse = Response.json({ 
        error: 'Internal server error',
        details: env.DEBUG === 'true' ? error.message : undefined
      }, { status: 500 });
      
      // Add CORS headers to error response
      Object.entries(corsHeaders(env.CORS_ORIGIN)).forEach(([key, value]) => {
        errorResponse.headers.set(key, value);
      });
      
      return errorResponse;
    }
  }
};
