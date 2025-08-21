-- Cloudflare Firewall Manager D1 Database Schema (Simplified)
-- Version 2.0.0

-- Rule history tracking
CREATE TABLE IF NOT EXISTS rule_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  old_value TEXT,
  new_value TEXT,
  ai_analysis TEXT
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Optimization history
CREATE TABLE IF NOT EXISTS optimization_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  rules_count INTEGER NOT NULL,
  recommendations_count INTEGER,
  analysis TEXT NOT NULL,
  rules_snapshot TEXT,
  applied INTEGER DEFAULT 0,
  applied_at DATETIME,
  user_id TEXT
);

-- AI cache for expensive operations
CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  hit_count INTEGER DEFAULT 0,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
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
  restored INTEGER DEFAULT 0,
  restored_at DATETIME
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
  success INTEGER DEFAULT 1,
  error_message TEXT
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
  is_public INTEGER DEFAULT 1
);
