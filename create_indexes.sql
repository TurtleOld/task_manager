-- Additional database indexes for performance optimization

-- Index for task filtering by author and state
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_author_state 
ON task_manager_task(author_id, state);

-- Index for task filtering by executor and state
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_executor_state 
ON task_manager_task(executor_id, state);

-- Index for task filtering by deadline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_deadline 
ON task_manager_task(deadline) WHERE deadline IS NOT NULL;

-- Index for task filtering by created date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_created_range 
ON task_manager_task(created_at);

-- Index for checklist items
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checklist_item_completed 
ON task_manager_checklistitem(is_completed);

-- Index for stage ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_order 
ON task_manager_stage("order");

-- Composite index for task ordering within stages
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_stage_order 
ON task_manager_task(stage_id, "order", created_at);

-- Index for user tasks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tasks 
ON task_manager_task(author_id, created_at DESC);

-- Index for user works (executor)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_works 
ON task_manager_task(executor_id, created_at DESC);

-- Analyze tables for better query planning
ANALYZE task_manager_task;
ANALYZE task_manager_stage;
ANALYZE task_manager_checklistitem;
ANALYZE task_manager_user;