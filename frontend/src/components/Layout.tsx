import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  HomeIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ChartBarIcon,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Rules', href: '/rules', icon: ShieldCheckIcon },
  { name: 'AI Assistant', href: '/ai-assistant', icon: SparklesIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Backups', href: '/backups', icon: CloudArrowUpIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout, user } = useAuthStore();
  const navigate = useNavigate();

  // Health check query
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.checkHealth,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getHealthColor = () => {
    if (!health) return 'bg-gray-400';
    switch (health.status) {
      case 'healthy':
        return 'bg-green-400';
      case 'degraded':
        return 'bg-yellow-400';
      case 'down':
        return 'bg-red-400';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cloudflare-orange to-cloudflare-yellow flex items-center justify-center">
                <ShieldCheckIcon className="h-5 w-5 text-white" />
              </div>
              <span className="ml-3 text-lg font-semibold text-gray-900 dark:text-white">
                Firewall Manager
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <XMarkIcon className="h-6 w-6 text-gray-500" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  `group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-cloudflare-orange text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`
                }
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cloudflare-blue to-cloudflare-darkblue flex items-center justify-center">
                  <span className="text-xs font-medium text-white">
                    {user?.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user?.email || 'User'}
                  </p>
                  <div className="flex items-center mt-1">
                    <div className={`h-2 w-2 rounded-full ${getHealthColor()} animate-pulse`} />
                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                      {health?.status || 'checking...'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeftOnRectangleIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
          >
            <Bars3Icon className="h-6 w-6 text-gray-500" />
          </button>

          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <button className="relative p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <BellIcon className="h-6 w-6" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            </button>

            {/* System status */}
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
              <div className={`h-2 w-2 rounded-full ${getHealthColor()}`} />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                API: {health?.apiStatus || 'checking'}
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                AI: {health?.aiStatus || 'checking'}
              </span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
