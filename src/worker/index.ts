import { OpenAI } from 'openai';
import { AutoRAG } from '@cloudflare/ai-rag';

interface Env {
  OPENAI_API_KEY: string;
  ENVIRONMENT: string;
  RAG_STORAGE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      
      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response('OK', { status: 200 });
      }

      // Handle API routes
      if (url.pathname.startsWith('/api')) {
        return handleApiRequest(request, env, ctx);
      }

      // Serve static frontend
      return serveStatic(request, env);
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

async function handleApiRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  
  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });

  // Initialize AutoRAG
  const rag = new AutoRAG({
    openai,
    storage: env.RAG_STORAGE
  });

  switch (url.pathname) {
    case '/api/query':
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      
      const { query } = await request.json();
      const response = await rag.query(query);
      
      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' }
      });

    default:
      return new Response('Not found', { status: 404 });
  }
}

async function serveStatic(request: Request, env: Env): Promise<Response> {
  // This will be implemented to serve the frontend assets
  return new Response('Frontend not implemented', { status: 501 });
}
