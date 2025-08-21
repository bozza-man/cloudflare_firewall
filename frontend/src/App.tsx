import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Rules from '@/pages/Rules';
import AIAssistant from '@/pages/AIAssistant';
import Analytics from '@/pages/Analytics';
import Backups from '@/pages/Backups';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import { useAuthStore } from '@/stores/authStore';

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      await checkAuth();
      setLoading(false);
    };
    initAuth();
  }, [checkAuth]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cloudflare-blue to-cloudflare-darkblue">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cloudflare-orange mx-auto"></div>
          <p className="mt-4 text-white text-lg">Loading Cloudflare Firewall Manager...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Layout />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="rules" element={<Rules />} />
            <Route path="ai-assistant" element={<AIAssistant />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="backups" element={<Backups />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </AnimatePresence>
    </Router>
  );
}

export default App;
