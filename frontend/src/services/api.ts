import axios, { AxiosInstance, AxiosError } from 'axios';
import toast from 'react-hot-toast';
import {
  ApiResponse,
  FirewallRule,
  RuleGenerationRequest,
  RuleGenerationResponse,
  ConflictAnalysisRequest,
  ConflictAnalysisResponse,
  OptimizationRequest,
  OptimizationResponse,
  Backup,
  BackupResponse,
  SystemHealth,
  RuleAnalytics,
} from '@/types';

class ApiClient {
  private client: AxiosInstance;
  private apiKey: string | null = null;

  constructor() {
    const baseURL = import.meta.env.VITE_API_URL || 'https://firewall.bozza.au';
    
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        const storedKey = localStorage.getItem('cf_api_key');
        if (storedKey) {
          config.headers['X-API-Key'] = storedKey;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiResponse<any>>) => {
        const message = error.response?.data?.error?.message || error.message;
        
        if (error.response?.status === 401) {
          toast.error('Authentication failed. Please check your API key.');
          localStorage.removeItem('cf_api_key');
          window.location.href = '/settings';
        } else if (error.response?.status === 429) {
          toast.error('Rate limit exceeded. Please try again later.');
        } else if (error.response?.status >= 500) {
          toast.error('Server error. Please try again later.');
        }
        
        return Promise.reject(error);
      }
    );
  }

  setApiKey(key: string) {
    this.apiKey = key;
    localStorage.setItem('cf_api_key', key);
  }

  // Health Check
  async checkHealth(): Promise<SystemHealth> {
    const response = await this.client.get<ApiResponse<SystemHealth>>('/health');
    return response.data.data!;
  }

  // Rule Management
  async getRules(): Promise<FirewallRule[]> {
    const response = await this.client.get<ApiResponse<FirewallRule[]>>('/api/rules');
    return response.data.data || [];
  }

  async createRule(rule: Partial<FirewallRule>): Promise<FirewallRule> {
    const response = await this.client.post<ApiResponse<FirewallRule>>('/api/rules', rule);
    return response.data.data!;
  }

  async updateRule(id: string, rule: Partial<FirewallRule>): Promise<FirewallRule> {
    const response = await this.client.put<ApiResponse<FirewallRule>>(`/api/rules/${id}`, rule);
    return response.data.data!;
  }

  async deleteRule(id: string): Promise<void> {
    await this.client.delete(`/api/rules/${id}`);
  }

  async toggleRule(id: string, enabled: boolean): Promise<FirewallRule> {
    const response = await this.client.patch<ApiResponse<FirewallRule>>(
      `/api/rules/${id}/toggle`,
      { enabled }
    );
    return response.data.data!;
  }

  // AI Features
  async generateRule(request: RuleGenerationRequest): Promise<RuleGenerationResponse> {
    const response = await this.client.post<ApiResponse<RuleGenerationResponse>>(
      '/api/ai/generate',
      request
    );
    return response.data.data!;
  }

  async analyzeConflicts(request: ConflictAnalysisRequest): Promise<ConflictAnalysisResponse> {
    const response = await this.client.post<ApiResponse<ConflictAnalysisResponse>>(
      '/api/ai/analyze',
      request
    );
    return response.data.data!;
  }

  async optimizeRules(request: OptimizationRequest): Promise<OptimizationResponse> {
    const response = await this.client.post<ApiResponse<OptimizationResponse>>(
      '/api/ai/optimize',
      request
    );
    return response.data.data!;
  }

  // Backup & Restore
  async createBackup(description?: string): Promise<BackupResponse> {
    const response = await this.client.post<ApiResponse<BackupResponse>>(
      '/api/backup',
      { description }
    );
    return response.data.data!;
  }

  async listBackups(): Promise<Backup[]> {
    const response = await this.client.get<ApiResponse<Backup[]>>('/api/backup');
    return response.data.data || [];
  }

  async restoreBackup(backupId: string): Promise<void> {
    await this.client.post(`/api/backup/${backupId}/restore`);
  }

  async deleteBackup(backupId: string): Promise<void> {
    await this.client.delete(`/api/backup/${backupId}`);
  }

  // Analytics
  async getRuleAnalytics(ruleId?: string): Promise<RuleAnalytics[]> {
    const url = ruleId ? `/api/analytics/rules/${ruleId}` : '/api/analytics/rules';
    const response = await this.client.get<ApiResponse<RuleAnalytics[]>>(url);
    return response.data.data || [];
  }

  async getSystemMetrics(): Promise<any> {
    const response = await this.client.get<ApiResponse<any>>('/api/analytics/system');
    return response.data.data;
  }

  // Export/Import
  async exportRules(format: 'json' | 'csv' = 'json'): Promise<Blob> {
    const response = await this.client.get(`/api/export`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  }

  async importRules(file: File): Promise<{ imported: number; failed: number }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await this.client.post<ApiResponse<{ imported: number; failed: number }>>(
      '/api/import',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.data!;
  }

  // Batch Operations
  async batchUpdateRules(
    ruleIds: string[],
    updates: Partial<FirewallRule>
  ): Promise<{ updated: number; failed: number }> {
    const response = await this.client.post<ApiResponse<{ updated: number; failed: number }>>(
      '/api/rules/batch',
      { ruleIds, updates }
    );
    return response.data.data!;
  }

  async batchDeleteRules(ruleIds: string[]): Promise<{ deleted: number; failed: number }> {
    const response = await this.client.post<ApiResponse<{ deleted: number; failed: number }>>(
      '/api/rules/batch/delete',
      { ruleIds }
    );
    return response.data.data!;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
