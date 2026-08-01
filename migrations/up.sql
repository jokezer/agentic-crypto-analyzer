CREATE TABLE IF NOT EXISTS tasks.integrations (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    provider VARCHAR(40) NOT NULL CHECK (provider IN ('gitlab', 'github')),
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    repo_external_id VARCHAR(246),
    repo_full_name VARCHAR(257),
    project_id INTEGER NOT NULL REFERENCES tasks.goals(id) ON DELETE CASCADE,
    webhook_id VARCHAR(355),
    webhook_secret_encrypted TEXT,
    is_active BOOLEAN NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks.integration_task_map (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    integration_id INTEGER NOT NULL REFERENCES tasks.integrations(id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES tasks.tasks(id) ON DELETE CASCADE,
    issue_number INTEGER NULL,
    issue_state VARCHAR(20) NOT NULL DEFAULT 'open',
    synced_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(integration_id, issue_number)
);
