/**
 * User Details API
 * Fetches and combines user identity, device, and posture information
 */

import { Env } from '../index.js';

interface DevicePosture {
  id: string;
  name: string;
  type: string;
  success: boolean;
  description?: string;
}

interface Device {
  id: string;
  name: string;
  os: string;
  osVersion?: string;
  model?: string;
  manufacturer?: string;
  serial?: string;
  lastSeen?: string;
  gateway?: boolean;
  warp?: boolean;
}

interface UserIdentity {
  email: string;
  name?: string;
  id?: string;
  groups?: string[];
  idp?: {
    name?: string;
    type?: string;
  };
  devicePosture?: DevicePosture[];
  device?: Device;
  geo?: {
    country?: string;
    city?: string;
  };
}

export async function getUserDetails(request: Request, env: Env): Promise<UserIdentity> {
  // Get user identity from Cloudflare Access
  const identityResponse = await fetch(new URL('/cdn-cgi/access/get-identity', request.url), {
    headers: {
      'Cookie': request.headers.get('Cookie') || '',
      'CF-Access-JWT-Assertion': request.headers.get('CF-Access-JWT-Assertion') || ''
    }
  });

  if (!identityResponse.ok) {
    throw new Error('Failed to fetch user identity');
  }

  const identity = await identityResponse.json() as UserIdentity;

  // Fetch device information if user has a device ID
  if (identity.id) {
    try {
      // Fetch device details from Cloudflare API
      const deviceResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/devices/${identity.id}`,
        {
          headers: {
            'Authorization': `Bearer ${env.BEARER_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (deviceResponse.ok) {
        const deviceData = await deviceResponse.json();
        if (deviceData.success && deviceData.result) {
          identity.device = deviceData.result;
        }
      }

      // Fetch device posture checks
      const postureResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/devices/${identity.id}/posture`,
        {
          headers: {
            'Authorization': `Bearer ${env.BEARER_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (postureResponse.ok) {
        const postureData = await postureResponse.json();
        if (postureData.success && postureData.result) {
          identity.devicePosture = postureData.result;
        }
      }
    } catch (error) {
      console.error('Error fetching device information:', error);
      // Continue without device information
    }
  }

  // Check if user is in the correct organization
  if (env.ORGANIZATION_ID && identity.id) {
    try {
      const orgCheckResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/access/organizations/${env.ORGANIZATION_ID}/users/${identity.id}`,
        {
          headers: {
            'Authorization': `Bearer ${env.BEARER_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!orgCheckResponse.ok) {
        console.warn('User may not be in the correct organization');
      }
    } catch (error) {
      console.error('Error checking organization membership:', error);
    }
  }

  return identity;
}
