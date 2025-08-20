/**
 * Cloudflare Worker for Dynamic Block Page
 * Provides enriched Access Deny reasoning to end users
 */

import { Router } from 'itty-router';
import { getUserDetails } from './api/userDetails.js';
import { getAccessHistory } from './api/history.js';
import { getEnvironment } from './api/environment.js';
import { handleAssets } from './utils/assets.js';
import { corsHeaders } from './utils/cors.js';

// Cloudflare Worker types
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  }
  
  interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
    passThroughOnException(): void;
  }
}

export interface Env {
  BEARER_TOKEN: string;
  CORS_ORIGIN: string;
  ACCOUNT_ID: string;
  ORGANIZATION_ID: string;
  TARGET_GROUP?: string;
  DEBUG?: string;
  IDENTITY_DYNAMIC_THEME_STORE: KVNamespace;
}

const router = Router();

// API Routes
router.get('/api/userdetails', async (request: Request, env: Env) => {
  try {
    const identity = await getUserDetails(request, env);
    return new Response(JSON.stringify(identity), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch user details' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  }
});

router.get('/api/history', async (request: Request, env: Env) => {
  try {
    const history = await getAccessHistory(request, env);
    return new Response(JSON.stringify(history), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  } catch (error) {
    console.error('Error fetching access history:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch access history' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  }
});

router.get('/api/env', async (request: Request, env: Env) => {
  try {
    const environment = getEnvironment(env);
    return new Response(JSON.stringify(environment), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  } catch (error) {
    console.error('Error fetching environment:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch environment' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  }
});

// Theme management routes
router.post('/api/theme', async (request: Request, env: Env) => {
  if (env.DEBUG !== 'true') {
    return new Response('Unauthorized', { status: 403 });
  }

  try {
    const theme = await request.json();
    await env.IDENTITY_DYNAMIC_THEME_STORE.put('theme', JSON.stringify(theme));
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  } catch (error) {
    console.error('Error saving theme:', error);
    return new Response(JSON.stringify({ error: 'Failed to save theme' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  }
});

router.get('/api/theme', async (request: Request, env: Env) => {
  try {
    const theme = await env.IDENTITY_DYNAMIC_THEME_STORE.get('theme');
    return new Response(theme || '{}', {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  } catch (error) {
    console.error('Error fetching theme:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch theme' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  }
});

// Logo upload route
router.post('/api/logo', async (request: Request, env: Env) => {
  if (env.DEBUG !== 'true') {
    return new Response('Unauthorized', { status: 403 });
  }

  try {
    const formData = await request.formData();
    const logo = formData.get('logo') as File;
    
    if (!logo) {
      return new Response(JSON.stringify({ error: 'No logo provided' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(env.CORS_ORIGIN)
        }
      });
    }

    const arrayBuffer = await logo.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    await env.IDENTITY_DYNAMIC_THEME_STORE.put('logo', base64);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    return new Response(JSON.stringify({ error: 'Failed to upload logo' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(env.CORS_ORIGIN)
      }
    });
  }
});

router.get('/api/logo', async (request: Request, env: Env) => {
  try {
    const logo = await env.IDENTITY_DYNAMIC_THEME_STORE.get('logo');
    if (!logo) {
      return new Response('No logo found', { status: 404 });
    }
    
    const imageData = atob(logo);
    const uint8Array = new Uint8Array(imageData.length);
    for (let i = 0; i < imageData.length; i++) {
      uint8Array[i] = imageData.charCodeAt(i);
    }
    
    return new Response(uint8Array, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Error fetching logo:', error);
    return new Response('Failed to fetch logo', { status: 500 });
  }
});

// Debug page route
router.get('/debug', async (request: Request, env: Env) => {
  if (env.DEBUG !== 'true') {
    return new Response('Debug mode is disabled', { status: 403 });
  }
  
  return handleAssets('debug.html', env);
});

// Access denied page route
router.get('/access-denied', async (request: Request, env: Env) => {
  return handleAssets('index.html', env);
});

// Information page route
router.get('/information', async (request: Request, env: Env) => {
  return handleAssets('information.html', env);
});

// Default route - serve static assets or redirect to access-denied
router.all('*', async (request: Request, env: Env) => {
  const url = new URL(request.url);
  
  // Try to serve static assets first
  const assetResponse = await handleAssets(url.pathname.slice(1), env);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }
  
  // Redirect to access-denied page
  return Response.redirect(new URL('/access-denied', request.url).toString(), 302);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx);
  }
};
