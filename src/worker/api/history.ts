/**
 * Access History API
 * Fetches recent Access login failures using GraphQL
 */

import { Env } from '../index.js';

interface AccessLogEntry {
  timestamp: string;
  email?: string;
  action: string;
  allowed: boolean;
  appName?: string;
  reason?: string;
  ipAddress?: string;
  country?: string;
}

interface AccessHistoryResponse {
  logs: AccessLogEntry[];
  totalCount: number;
}

const ACCESS_LOGS_QUERY = `
  query GetAccessLogs($accountId: String!, $filter: AccessLogsFilter!) {
    viewer {
      accounts(filter: { accountTag: $accountId }) {
        edges {
          node {
            accessLogs(filter: $filter, orderBy: timestamp_DESC, first: 10) {
              edges {
                node {
                  timestamp
                  email
                  action
                  allowed
                  appName
                  reason
                  ipAddress
                  country
                }
              }
              totalCount
            }
          }
        }
      }
    }
  }
`;

export async function getAccessHistory(request: Request, env: Env): Promise<AccessHistoryResponse> {
  // Get user email from the request or identity
  const identityResponse = await fetch(new URL('/cdn-cgi/access/get-identity', request.url), {
    headers: {
      'Cookie': request.headers.get('Cookie') || '',
      'CF-Access-JWT-Assertion': request.headers.get('CF-Access-JWT-Assertion') || ''
    }
  });

  let userEmail = '';
  if (identityResponse.ok) {
    const identity = await identityResponse.json();
    userEmail = identity.email || '';
  }

  if (!userEmail) {
    return { logs: [], totalCount: 0 };
  }

  // Calculate timestamp for last 30 minutes
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // Prepare GraphQL variables
  const variables = {
    accountId: env.ACCOUNT_ID,
    filter: {
      timestamp_gte: thirtyMinutesAgo,
      email: userEmail,
      allowed: false // Only show failed attempts
    }
  };

  try {
    // Execute GraphQL query
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: ACCESS_LOGS_QUERY,
        variables
      })
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extract logs from GraphQL response
    const accountEdge = data?.data?.viewer?.accounts?.edges?.[0];
    const accessLogs = accountEdge?.node?.accessLogs;
    
    if (!accessLogs) {
      return { logs: [], totalCount: 0 };
    }

    const logs = accessLogs.edges.map((edge: any) => edge.node);
    
    return {
      logs: logs.slice(0, 3), // Return only the last 3 failures
      totalCount: accessLogs.totalCount || 0
    };
  } catch (error) {
    console.error('Error fetching access history:', error);
    return { logs: [], totalCount: 0 };
  }
}
