import type { GatewayRule, GatewayList, GatewayLocation, GatewayCategory } from '../../src/types/gateway.js';

export class TestFactory {
  static createGatewayRule(overrides: Partial<GatewayRule> = {}): GatewayRule {
    return {
      id: 'test-rule-id',
      name: 'Test Rule',
      description: 'Test rule description',
      precedence: 1000,
      enabled: true,
      action: 'block',
      filters: ['dns.fqdn == "example.com"'],
      traffic: 'dns.fqdn == "example.com"',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      ...overrides
    };
  }

  static createGatewayList(overrides: Partial<GatewayList> = {}): GatewayList {
    return {
      id: 'test-list-id',
      name: 'Test List',
      type: 'DOMAIN',
      description: 'Test list description',
      items: [
        { value: 'example.com', created_at: '2024-01-01T00:00:00Z' }
      ],
      count: 1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      ...overrides
    };
  }

  static createGatewayLocation(overrides: Partial<GatewayLocation> = {}): GatewayLocation {
    return {
      id: 'test-location-id',
      name: 'Test Location',
      client_default: false,
      doh_subdomain: 'test',
      networks: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      ...overrides
    };
  }

  static createGatewayCategory(overrides: Partial<GatewayCategory> = {}): GatewayCategory {
    return {
      id: 1,
      name: 'Test Category',
      description: 'Test category description',
      class: 'security',
      subcategories: [],
      ...overrides
    };
  }

  static createCloudflareError(message: string = 'Test error') {
    return {
      response: {
        data: {
          errors: [{ message }]
        },
        status: 400
      },
      message
    };
  }
}