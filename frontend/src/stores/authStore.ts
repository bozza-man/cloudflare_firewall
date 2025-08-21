import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/services/api';

interface AuthState {
  isAuthenticated: boolean;
  apiKey: string | null;
  user: {
    email?: string;
    name?: string;
  } | null;
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      apiKey: null,
      user: null,

      login: async (apiKey: string) => {
        try {
          // Set the API key
          apiClient.setApiKey(apiKey);
          
          // Verify the API key by making a health check
          const health = await apiClient.checkHealth();
          
          if (health.status === 'healthy' || health.status === 'degraded') {
            set({
              isAuthenticated: true,
              apiKey,
              user: { email: 'user@example.com' }, // Placeholder user data
            });
            return true;
          }
          
          return false;
        } catch (error) {
          console.error('Login failed:', error);
          set({
            isAuthenticated: false,
            apiKey: null,
            user: null,
          });
          return false;
        }
      },

      logout: () => {
        localStorage.removeItem('cf_api_key');
        set({
          isAuthenticated: false,
          apiKey: null,
          user: null,
        });
      },

      checkAuth: async () => {
        const storedKey = localStorage.getItem('cf_api_key');
        
        if (!storedKey) {
          set({ isAuthenticated: false });
          return false;
        }

        try {
          apiClient.setApiKey(storedKey);
          const health = await apiClient.checkHealth();
          
          const isHealthy = health.status === 'healthy' || health.status === 'degraded';
          
          set({
            isAuthenticated: isHealthy,
            apiKey: isHealthy ? storedKey : null,
          });
          
          return isHealthy;
        } catch (error) {
          set({
            isAuthenticated: false,
            apiKey: null,
          });
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        apiKey: state.apiKey,
      }),
    }
  )
);
