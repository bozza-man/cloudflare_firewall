import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Title, Text, Badge, Button, TextInput, Select, SelectItem } from '@tremor/react';
import {
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import apiClient from '@/services/api';
import { FirewallRule } from '@/types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function Rules() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [editingRule, setEditingRule] = useState<FirewallRule | null>(null);
  const [showAddRule, setShowAddRule] = useState(false);
  
  const queryClient = useQueryClient();

  // Fetch rules
  const { data: rules, isLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: apiClient.getRules,
  });

  // Delete rule mutation
  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteRule,
    onSuccess: () => {
      toast.success('Rule deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: () => {
      toast.error('Failed to delete rule');
    },
  });

  // Toggle rule mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.toggleRule(id, enabled),
    onSuccess: () => {
      toast.success('Rule updated successfully');
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: () => {
      toast.error('Failed to update rule');
    },
  });

  // Filter and search rules
  const filteredRules = rules?.filter((rule) => {
    const matchesSearch = 
      rule.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.expression.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterAction === 'all' || rule.action === filterAction;
    return matchesSearch && matchesFilter;
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case 'block': return 'red';
      case 'challenge': return 'yellow';
      case 'allow': return 'emerald';
      case 'log': return 'blue';
      case 'bypass': return 'gray';
      default: return 'gray';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'block': return '🚫';
      case 'challenge': return '⚠️';
      case 'allow': return '✅';
      case 'log': return '📝';
      case 'bypass': return '➡️';
      default: return '❓';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Firewall Rules</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage and configure your firewall rules
          </p>
        </div>
        <Button
          icon={PlusIcon}
          onClick={() => setShowAddRule(true)}
          className="bg-gradient-to-r from-cloudflare-orange to-cloudflare-yellow text-white"
        >
          Add Rule
        </Button>
      </div>

      {/* Filters and Search */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <TextInput
                placeholder="Search rules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select
            value={filterAction}
            onValueChange={setFilterAction}
            className="w-full md:w-48"
          >
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="block">Block</SelectItem>
            <SelectItem value="challenge">Challenge</SelectItem>
            <SelectItem value="allow">Allow</SelectItem>
            <SelectItem value="log">Log</SelectItem>
            <SelectItem value="bypass">Bypass</SelectItem>
          </Select>
          {selectedRules.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  // Batch delete logic
                  if (confirm(`Delete ${selectedRules.length} rules?`)) {
                    selectedRules.forEach(id => deleteMutation.mutate(id));
                    setSelectedRules([]);
                  }
                }}
                icon={TrashIcon}
              >
                Delete Selected ({selectedRules.length})
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Rules List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
          </Card>
        ) : filteredRules && filteredRules.length > 0 ? (
          <AnimatePresence>
            {filteredRules.map((rule, index) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedRules.includes(rule.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRules([...selectedRules, rule.id]);
                          } else {
                            setSelectedRules(selectedRules.filter(id => id !== rule.id));
                          }
                        }}
                        className="mt-1 h-4 w-4 text-cloudflare-orange focus:ring-cloudflare-orange border-gray-300 rounded"
                      />
                      
                      {/* Rule Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{getActionIcon(rule.action)}</span>
                          <Badge color={getActionColor(rule.action)}>
                            {rule.action.toUpperCase()}
                          </Badge>
                          {rule.enabled ? (
                            <Badge color="emerald">Active</Badge>
                          ) : (
                            <Badge color="gray">Disabled</Badge>
                          )}
                          {rule.priority && (
                            <Badge color="blue">Priority: {rule.priority}</Badge>
                          )}
                        </div>
                        
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {rule.description || 'Untitled Rule'}
                        </h3>
                        
                        <div className="mt-2">
                          <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Expression:
                          </Text>
                          <div className="bg-gray-900 rounded-lg p-2 overflow-x-auto">
                            <code className="text-xs text-green-400 font-mono">
                              {rule.expression}
                            </code>
                          </div>
                        </div>
                        
                        {rule.created_at && (
                          <Text className="text-xs text-gray-400 mt-2">
                            Created: {new Date(rule.created_at).toLocaleDateString()}
                          </Text>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => toggleMutation.mutate({ 
                          id: rule.id, 
                          enabled: !rule.enabled 
                        })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          rule.enabled ? 'bg-cloudflare-orange' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            rule.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      
                      <button
                        onClick={() => setEditingRule(rule)}
                        className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                      >
                        <PencilSquareIcon className="h-5 w-5" />
                      </button>
                      
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this rule?')) {
                            deleteMutation.mutate(rule.id);
                          }
                        }}
                        className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <Card>
            <div className="text-center py-12">
              <ShieldCheckIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No rules found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {searchTerm || filterAction !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Get started by adding your first firewall rule'}
              </p>
              {!searchTerm && filterAction === 'all' && (
                <Button
                  icon={PlusIcon}
                  onClick={() => setShowAddRule(true)}
                  className="mt-4"
                >
                  Add Your First Rule
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Stats */}
      {rules && rules.length > 0 && (
        <Card>
          <Title>Rule Statistics</Title>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {rules.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Rules</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {rules.filter(r => r.enabled).length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {rules.filter(r => r.action === 'block').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Blocking</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">
                {rules.filter(r => r.action === 'challenge').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Challenging</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {rules.filter(r => r.action === 'allow').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Allowing</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
