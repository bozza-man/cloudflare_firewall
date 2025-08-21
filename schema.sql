-- Cloudflare Firewall Manager D1 Database Schema
-- Version 2.0.0

-- Rule history tracking
CREATE TABLE IF NOT EXISTS rule_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete', 'enable', 'disable')),
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  old_value TEXT,
  new_value TEXT,
  ai_analysis TEXT,
  INDEX idx_rule_id (rule_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_user (user_id)
);

-- Rule analytics and performance tracking
CREATE TABLE IF NOT EXISTS rule_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL UNIQUE,
  hits INTEGER DEFAULT 0,
  last_hit DATETIME,
  performance_impact REAL,
  optimization_score REAL,
  false_positives INTEGER DEFAULT 0,
  false_negatives INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rule_analytics_id (rule_id),
  INDEX idx_performance (performance_impact)
);

-- Optimization history
CREATE TABLE IF NOT EXISTS optimization_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  rules_count INTEGER NOT NULL,
  recommendations_count INTEGER,
  analysis TEXT NOT NULL,
  rules_snapshot TEXT,
  applied BOOLEAN DEFAULT FALSE,
  applied_at DATETIME,
  user_id TEXT,
  INDEX idx_optimization_timestamp (timestamp),
  INDEX idx_applied (applied)
);

-- AI cache for expensive operations
CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  hit_count INTEGER DEFAULT 0,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expires (expires_at)
);

-- Conflict resolutions tracking
CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  conflicting_rule_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  resolution_type TEXT NOT NULL,
  resolution_details TEXT,
  resolved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_by TEXT,
  success BOOLEAN DEFAULT TRUE,
  INDEX idx_rule_conflicts (rule_id, conflicting_rule_id)
);

-- Backup metadata
CREATE TABLE IF NOT EXISTS backup_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_key TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  rules_count INTEGER NOT NULL,
  size_bytes INTEGER,
  user_id TEXT,
  reason TEXT,
  restored BOOLEAN DEFAULT FALSE,
  restored_at DATETIME,
  INDEX idx_backup_key (backup_key),
  INDEX idx_backup_created (created_at)
);

-- User sessions for dashboard
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_user (user_id),
  INDEX idx_session_expires (expires_at)
);

-- Audit log for all operations
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  INDEX idx_audit_timestamp (timestamp),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action)
);

-- Rule templates for common patterns
CREATE TABLE IF NOT EXISTS rule_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL,
  template TEXT NOT NULL,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  INDEX idx_template_category (category),
  INDEX idx_template_usage (usage_count)
);

-- Vector search metadata (companion to Vectorize)
CREATE TABLE IF NOT EXISTS vector_metadata (
  rule_id TEXT PRIMARY KEY,
  embedding_version INTEGER DEFAULT 1,
  indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  search_count INTEGER DEFAULT 0,
  relevance_score REAL,
  INDEX idx_vector_updated (last_updated)
);

-- Performance metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  unit TEXT,
  tags TEXT,
  INDEX idx_metrics_timestamp (timestamp, metric_name)
);

-- Scheduled tasks
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,
  schedule TEXT NOT NULL,
  payload TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  last_run DATETIME,
  next_run DATETIME,
  run_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task_next_run (next_run),
  INDEX idx_task_enabled (enabled)
);

-- Create triggers for updated_at timestamps
CREATE TRIGGER IF NOT EXISTS update_rule_analytics_timestamp 
AFTER UPDATE ON rule_analytics
BEGIN
  UPDATE rule_analytics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_rule_templates_timestamp 
AFTER UPDATE ON rule_templates
BEGIN
  UPDATE rule_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_vector_metadata_timestamp 
AFTER UPDATE ON vector_metadata
BEGIN
  UPDATE vector_metadata SET last_updated = CURRENT_TIMESTAMP WHERE rule_id = NEW.rule_id;
END;

-- Create views for common queries
CREATE VIEW IF NOT EXISTS recent_changes AS
SELECT 
  rh.id,
  rh.rule_id,
  rh.operation,
  rh.timestamp,
  rh.user_id,
  rh.old_value,
  rh.new_value
FROM rule_history rh
ORDER BY rh.timestamp DESC
LIMIT 100;

CREATE VIEW IF NOT EXISTS optimization_summary AS
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as optimization_count,
  AVG(rules_count) as avg_rules_count,
  SUM(CASE WHEN applied = TRUE THEN 1 ELSE 0 END) as applied_count
FROM optimization_history
GROUP BY DATE(timestamp)
ORDER BY date DESC;

CREATE VIEW IF NOT EXISTS rule_performance AS
SELECT 
  ra.rule_id,
  ra.hits,
  ra.performance_impact,
  ra.optimization_score,
  vm.search_count,
  vm.relevance_score
FROM rule_analytics ra
LEFT JOIN vector_metadata vm ON ra.rule_id = vm.rule_id
ORDER BY ra.performance_impact DESC;

-- Initial data
INSERT OR IGNORE INTO rule_templates (name, description, category, template, created_by) VALUES
('Block Social Media', 'Block all major social media platforms', 'security', '{"action":"block","traffic":"dns","filters":["dns.query_name in {facebook.com, twitter.com, instagram.com, tiktok.com}"]}', 'system'),
('Allow Corporate VPN', 'Allow access to corporate VPN endpoints', 'access', '{"action":"allow","traffic":"l4","filters":["ip.dst in {10.0.0.0/8}"]}', 'system'),
('Block Malware Domains', 'Block known malware command and control domains', 'security', '{"action":"block","traffic":"dns","filters":["dns.query_name in $malware_list"]}', 'system'),
('Isolate Suspicious Downloads', 'Isolate browser for suspicious file downloads', 'security', '{"action":"isolate","traffic":"http","filters":["http.request.uri.path matches \".*\\.(exe|dll|scr|bat)$\""]}', 'system');
