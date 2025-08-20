/**
 * Environment API
 * Exposes worker environment variables for component interaction
 */

import { Env } from '../index.js';

interface EnvironmentInfo {
  organizationId?: string;
  targetGroup?: string;
  debug: boolean;
  corsOrigin: string;
}

export function getEnvironment(env: Env): EnvironmentInfo {
  return {
    organizationId: env.ORGANIZATION_ID,
    targetGroup: env.TARGET_GROUP,
    debug: env.DEBUG === 'true',
    corsOrigin: env.CORS_ORIGIN || '*'
  };
}
