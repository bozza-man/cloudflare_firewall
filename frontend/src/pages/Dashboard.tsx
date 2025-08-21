import { useQuery } from '@tanstack/react-query';
import { Card, Metric, Text, Title, BarList, DonutChart, AreaChart, Grid, Flex, Badge } from '@tremor/react';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CloudArrowUpIcon,
  SparklesIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import apiClient from '@/services/api';
import { motion } from 'framer-motion';

export default function Dashboard() {
  // Fetch data
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.checkHealth,
  });

  const { data: rules } = useQuery({
    queryKey: ['rules'],
    queryFn: apiClient.getRules,
  });

  const { data: backups } = useQuery({
    queryKey: ['backups'],
    queryFn: apiClient.listBackups,
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: apiClient.getRuleAnalytics,
  });

  // Calculate metrics
  const activeRules = rules?.filter(r => r.enabled).length || 0;
  const totalRules = rules?.length || 0;
  const recentBackups = backups?.slice(0, 5) || [];
  
  // Mock data for charts (replace with real data from API)
  const ruleDistribution = [
    { name: 'Block', value: rules?.filter(r => r.action === 'block').length || 0 },
    { name: 'Challenge', value: rules?.filter(r => r.action === 'challenge').length || 0 },
    { name: 'Allow', value: rules?.filter(r => r.action === 'allow').length || 0 },
    { name: 'Log', value: rules?.filter(r => r.action === 'log').length || 0 },
  ];

  const trafficData = [
    { date: 'Jan', Blocked: 2890, Challenged: 2338, Allowed: 1450 },
    { date: 'Feb', Blocked: 2756, Challenged: 2103, Allowed: 1680 },
    { date: 'Mar', Blocked: 3322, Challenged: 2194, Allowed: 1890 },
    { date: 'Apr', Blocked: 3470, Challenged: 2108, Allowed: 2100 },
    { date: 'May', Blocked: 3475, Challenged: 1812, Allowed: 2300 },
    { date: 'Jun', Blocked: 3129, Challenged: 1726, Allowed: 2450 },
  ];

  const topThreats = [
    { name: 'SQL Injection Attempts', value: 456 },
    { name: 'XSS Attacks', value: 351 },
    { name: 'Bot Traffic', value: 271 },
    { name: 'DDoS Attempts', value: 191 },
    { name: 'Brute Force', value: 91 },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Monitor your firewall performance and security metrics
        </p>
      </div>

      {/* Status Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <motion.div variants={itemVariants}>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
            <Flex alignItems="start">
              <div>
                <Text className="text-green-600 dark:text-green-400">System Status</Text>
                <Metric className="text-green-700 dark:text-green-300">
                  {health?.status || 'Checking...'}
                </Metric>
              </div>
              <CheckCircleIcon className="h-8 w-8 text-green-500" />
            </Flex>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
            <Flex alignItems="start">
              <div>
                <Text className="text-blue-600 dark:text-blue-400">Active Rules</Text>
                <Metric className="text-blue-700 dark:text-blue-300">
                  {activeRules} / {totalRules}
                </Metric>
              </div>
              <ShieldCheckIcon className="h-8 w-8 text-blue-500" />
            </Flex>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-800">
            <Flex alignItems="start">
              <div>
                <Text className="text-orange-600 dark:text-orange-400">AI Status</Text>
                <Metric className="text-orange-700 dark:text-orange-300">
                  {health?.aiStatus || 'Checking...'}
                </Metric>
              </div>
              <SparklesIcon className="h-8 w-8 text-orange-500" />
            </Flex>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
            <Flex alignItems="start">
              <div>
                <Text className="text-purple-600 dark:text-purple-400">Backups</Text>
                <Metric className="text-purple-700 dark:text-purple-300">
                  {backups?.length || 0}
                </Metric>
              </div>
              <CloudArrowUpIcon className="h-8 w-8 text-purple-500" />
            </Flex>
          </Card>
        </motion.div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic Trends */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <Card>
            <Title>Traffic Analysis</Title>
            <Text>Request handling over the last 6 months</Text>
            <AreaChart
              className="mt-4 h-72"
              data={trafficData}
              index="date"
              categories={['Blocked', 'Challenged', 'Allowed']}
              colors={['red', 'yellow', 'green']}
              showLegend
              showGridLines
              showAnimation
            />
          </Card>
        </motion.div>

        {/* Rule Distribution */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <Title>Rule Distribution</Title>
            <Text>Actions by rule type</Text>
            <DonutChart
              className="mt-4 h-72"
              data={ruleDistribution}
              category="value"
              index="name"
              colors={['red', 'yellow', 'emerald', 'blue']}
              showAnimation
              showTooltip
            />
          </Card>
        </motion.div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Threats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <Title>Top Threat Types</Title>
            <Text>Most common security threats blocked</Text>
            <BarList
              className="mt-4"
              data={topThreats}
              color="red"
              showAnimation
            />
          </Card>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <Title>Recent Backups</Title>
            <Text>Latest backup operations</Text>
            <div className="mt-4 space-y-3">
              {recentBackups.length > 0 ? (
                recentBackups.map((backup) => (
                  <div
                    key={backup.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <CloudArrowUpIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {backup.description || 'Manual Backup'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(backup.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge color="emerald" size="xs">
                      {backup.ruleCount} rules
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <CloudArrowUpIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No backups yet</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <Title>Quick Actions</Title>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-105">
              <ShieldCheckIcon className="h-6 w-6 mx-auto mb-2" />
              <p className="text-sm font-medium">Add Rule</p>
            </button>
            <button className="p-4 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all transform hover:scale-105">
              <SparklesIcon className="h-6 w-6 mx-auto mb-2" />
              <p className="text-sm font-medium">AI Generate</p>
            </button>
            <button className="p-4 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all transform hover:scale-105">
              <CloudArrowUpIcon className="h-6 w-6 mx-auto mb-2" />
              <p className="text-sm font-medium">Backup Now</p>
            </button>
            <button className="p-4 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105">
              <ExclamationTriangleIcon className="h-6 w-6 mx-auto mb-2" />
              <p className="text-sm font-medium">Analyze</p>
            </button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
