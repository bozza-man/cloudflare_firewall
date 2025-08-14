import type { GatewayRule } from '../../src/types/gateway.js';

export const mockGatewayRule: GatewayRule = {
  id: 'test-rule-123',
  name: 'Test Block Rule',
  description: 'Test rule for blocking suspicious traffic',
  action: 'block',
  enabled: true,
  filters: ['dns'],
  traffic: 'dns.fqdn == "malicious.example.com"',
  precedence: 1000,
  identity: '',
  device_posture: '',
  rule_settings: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z'
};

export const mockGatewayRules: GatewayRule[] = [
  {
    ...mockGatewayRule,
    id: 'rule-1',
    name: 'Block Malware',
    precedence: 1000,
    traffic: 'dns.fqdn == "malware.example.com"'
  },
  {
    ...mockGatewayRule,
    id: 'rule-2',
    name: 'Allow Internal',
    action: 'allow',
    precedence: 2000,
    traffic: 'dns.fqdn endswith ".internal.company.com"'
  },
  {
    ...mockGatewayRule,
    id: 'rule-3',
    name: 'Block Social Media',
    precedence: 3000,
    traffic: 'dns.fqdn in {"facebook.com" "twitter.com" "instagram.com"}'
  }
];

export const mockCloudflareResponse = {
  success: true,
  errors: [],
  messages: [],
  result: mockGatewayRules
};

export const mockCloudflareError = {
  success: false,
  errors: [
    {
      code: 1001,
      message: 'Authentication failed'
    }
  ],
  messages: [],
  result: null
};
