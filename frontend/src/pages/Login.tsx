import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheckIcon, KeyIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export default function Login() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(apiKey);
      
      if (success) {
        toast.success('Successfully authenticated!');
        navigate('/');
      } else {
        setError('Invalid API key. Please check and try again.');
      }
    } catch (err) {
      setError('Failed to authenticate. Please check your API key and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cloudflare-blue via-cloudflare-darkblue to-gray-900">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-md w-full mx-4"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-cloudflare-orange to-cloudflare-yellow p-8">
            <div className="flex items-center justify-center">
              <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <ShieldCheckIcon className="h-10 w-10 text-white" />
              </div>
            </div>
            <h1 className="mt-4 text-center text-2xl font-bold text-white">
              Cloudflare Firewall Manager
            </h1>
            <p className="mt-2 text-center text-white/80">
              Professional firewall management with AI assistance
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Cloudflare API Key
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cloudflare-orange focus:border-transparent"
                  placeholder="Enter your API key"
                  required
                />
              </div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Your API key is stored locally and never sent to third parties
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
              >
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading || !apiKey}
              className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-white bg-gradient-to-r from-cloudflare-orange to-cloudflare-yellow hover:from-cloudflare-orange/90 hover:to-cloudflare-yellow/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cloudflare-orange disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>

            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                How to get your API key:
              </h3>
              <ol className="text-sm text-gray-500 dark:text-gray-400 space-y-1 list-decimal list-inside">
                <li>Log in to your Cloudflare dashboard</li>
                <li>Go to My Profile → API Tokens</li>
                <li>Create a token with Zone:Firewall Services permissions</li>
                <li>Copy and paste the token here</li>
              </ol>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-white/60">
          Protected by Cloudflare • Powered by AI
        </p>
      </motion.div>
    </div>
  );
}
