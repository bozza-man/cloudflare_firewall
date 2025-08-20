/**
 * Assets Handler
 * Serves static files and HTML pages
 */

import { Env } from '../index.js';

// Map of static assets that will be served
const STATIC_ASSETS: Record<string, string> = {
  'index.html': 'text/html',
  'debug.html': 'text/html',
  'information.html': 'text/html',
  'app.js': 'application/javascript',
  'app.css': 'text/css',
  'tailwind.css': 'text/css'
};

export async function handleAssets(path: string, env: Env): Promise<Response> {
  // Remove leading slash if present
  const assetPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Check if this is a known asset
  const contentType = STATIC_ASSETS[assetPath];
  if (!contentType) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    // Try to fetch from KV storage first (for built assets)
    const assetContent = await env.IDENTITY_DYNAMIC_THEME_STORE.get(`assets:${assetPath}`);
    if (assetContent) {
      return new Response(assetContent, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // For development, return placeholder HTML
    if (assetPath.endsWith('.html')) {
      const htmlContent = generatePlaceholderHTML(assetPath);
      return new Response(htmlContent, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache'
        }
      });
    }

    return new Response('Asset not found', { status: 404 });
  } catch (error) {
    console.error('Error serving asset:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function generatePlaceholderHTML(page: string): string {
  const pageName = page.replace('.html', '');
  
  if (pageName === 'index') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied - Cloudflare Zero Trust</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center">
    <div id="root">
        <div class="max-w-4xl mx-auto p-8 bg-white rounded-lg shadow-lg">
            <h1 class="text-3xl font-bold text-red-600 mb-4">Access Denied</h1>
            <p class="text-gray-700 mb-6">Your access to this resource has been blocked by security policies.</p>
            <div id="app-content">
                <!-- React app will be mounted here -->
                <div class="animate-pulse">
                    <div class="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div class="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                    <div class="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
            </div>
        </div>
    </div>
    <script src="/app.js"></script>
</body>
</html>`;
  }
  
  if (pageName === 'debug') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Debug Configuration - Dynamic Block Page</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen p-8">
    <div id="root">
        <div class="max-w-6xl mx-auto">
            <h1 class="text-3xl font-bold mb-8">Debug Configuration</h1>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="bg-white p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold mb-4">Theme Settings</h2>
                    <div id="theme-config">
                        <!-- Theme configuration UI will be mounted here -->
                    </div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h2 class="text-xl font-semibold mb-4">Logo Upload</h2>
                    <div id="logo-upload">
                        <!-- Logo upload UI will be mounted here -->
                    </div>
                </div>
            </div>
            <div class="mt-8 bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-semibold mb-4">Identity Information</h2>
                <div id="identity-debug">
                    <!-- Identity debug info will be mounted here -->
                </div>
            </div>
        </div>
    </div>
    <script src="/app.js"></script>
</body>
</html>`;
  }
  
  if (pageName === 'information') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Information - Cloudflare Zero Trust</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen p-8">
    <div id="root">
        <div class="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow">
            <h1 class="text-3xl font-bold mb-6">Access Information & FAQs</h1>
            <div id="info-content">
                <!-- Information content will be mounted here -->
                <div class="space-y-6">
                    <div>
                        <h2 class="text-xl font-semibold mb-2">Why was my access denied?</h2>
                        <p class="text-gray-700">Access can be denied for various reasons including missing security requirements, incorrect group membership, or device posture checks.</p>
                    </div>
                    <div>
                        <h2 class="text-xl font-semibold mb-2">How can I get access?</h2>
                        <p class="text-gray-700">Please contact your IT administrator or security team for assistance with access issues.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script src="/app.js"></script>
</body>
</html>`;
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Not Found</title>
</head>
<body>
    <h1>Page Not Found</h1>
</body>
</html>`;
}
