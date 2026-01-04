package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// SQLiteStore implements Store using SQLite
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore creates a new SQLite-backed store
func NewSQLiteStore(path string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite3", fmt.Sprintf("%s?_journal_mode=WAL&_foreign_keys=ON", path))
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &SQLiteStore{db: db}

	if err := store.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	return store, nil
}

func (s *SQLiteStore) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS workspaces (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		status TEXT NOT NULL,
		docker_image TEXT NOT NULL,
		docker_image_tag TEXT NOT NULL,
		helm_release_name TEXT NOT NULL,
		namespace TEXT NOT NULL,
		ingress_host TEXT,
		cpu_request TEXT,
		memory_request TEXT,
		cpu_limit TEXT,
		memory_limit TEXT,
		data_size TEXT,
		src_size TEXT,
		git_enabled INTEGER DEFAULT 0,
		git_user_name TEXT,
		git_user_email TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS workspace_secrets (
		workspace_id TEXT NOT NULL,
		key TEXT NOT NULL,
		value TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (workspace_id, key),
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS workspace_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		workspace_id TEXT NOT NULL,
		event_type TEXT NOT NULL,
		message TEXT,
		metadata TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_events_workspace_created
		ON workspace_events(workspace_id, created_at DESC);
	`

	_, err := s.db.Exec(schema)
	return err
}

// CreateWorkspace creates a new workspace
func (s *SQLiteStore) CreateWorkspace(ctx context.Context, ws *Workspace) error {
	query := `
		INSERT INTO workspaces (
			id, name, status, docker_image, docker_image_tag,
			helm_release_name, namespace, ingress_host,
			cpu_request, memory_request, cpu_limit, memory_limit,
			data_size, src_size,
			git_enabled, git_user_name, git_user_email
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	gitEnabled := 0
	if ws.GitEnabled {
		gitEnabled = 1
	}

	_, err := s.db.ExecContext(ctx, query,
		ws.ID, ws.Name, ws.Status, ws.DockerImage, ws.DockerImageTag,
		ws.HelmReleaseName, ws.Namespace, ws.IngressHost,
		ws.CPURequest, ws.MemoryRequest, ws.CPULimit, ws.MemoryLimit,
		ws.DataSize, ws.SrcSize,
		gitEnabled, ws.GitUserName, ws.GitUserEmail,
	)

	return err
}

// GetWorkspace retrieves a workspace by ID
func (s *SQLiteStore) GetWorkspace(ctx context.Context, id string) (*Workspace, error) {
	query := `
		SELECT id, name, status, docker_image, docker_image_tag,
		       helm_release_name, namespace, ingress_host,
		       cpu_request, memory_request, cpu_limit, memory_limit,
		       data_size, src_size,
		       git_enabled, git_user_name, git_user_email,
		       created_at, updated_at
		FROM workspaces WHERE id = ?
	`

	ws := &Workspace{}
	var gitEnabled int
	var ingressHost, cpuRequest, memoryRequest, cpuLimit, memoryLimit sql.NullString
	var dataSize, srcSize, gitUserName, gitUserEmail sql.NullString

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&ws.ID, &ws.Name, &ws.Status, &ws.DockerImage, &ws.DockerImageTag,
		&ws.HelmReleaseName, &ws.Namespace, &ingressHost,
		&cpuRequest, &memoryRequest, &cpuLimit, &memoryLimit,
		&dataSize, &srcSize,
		&gitEnabled, &gitUserName, &gitUserEmail,
		&ws.CreatedAt, &ws.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workspace not found: %s", id)
	}
	if err != nil {
		return nil, err
	}

	ws.IngressHost = ingressHost.String
	ws.CPURequest = cpuRequest.String
	ws.MemoryRequest = memoryRequest.String
	ws.CPULimit = cpuLimit.String
	ws.MemoryLimit = memoryLimit.String
	ws.DataSize = dataSize.String
	ws.SrcSize = srcSize.String
	ws.GitEnabled = gitEnabled == 1
	ws.GitUserName = gitUserName.String
	ws.GitUserEmail = gitUserEmail.String

	return ws, nil
}

// ListWorkspaces retrieves all workspaces
func (s *SQLiteStore) ListWorkspaces(ctx context.Context) ([]*Workspace, error) {
	query := `
		SELECT id, name, status, docker_image, docker_image_tag,
		       helm_release_name, namespace, ingress_host,
		       cpu_request, memory_request, cpu_limit, memory_limit,
		       data_size, src_size,
		       git_enabled, git_user_name, git_user_email,
		       created_at, updated_at
		FROM workspaces
		ORDER BY created_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workspaces []*Workspace
	for rows.Next() {
		ws := &Workspace{}
		var gitEnabled int
		var ingressHost, cpuRequest, memoryRequest, cpuLimit, memoryLimit sql.NullString
		var dataSize, srcSize, gitUserName, gitUserEmail sql.NullString

		err := rows.Scan(
			&ws.ID, &ws.Name, &ws.Status, &ws.DockerImage, &ws.DockerImageTag,
			&ws.HelmReleaseName, &ws.Namespace, &ingressHost,
			&cpuRequest, &memoryRequest, &cpuLimit, &memoryLimit,
			&dataSize, &srcSize,
			&gitEnabled, &gitUserName, &gitUserEmail,
			&ws.CreatedAt, &ws.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		ws.IngressHost = ingressHost.String
		ws.CPURequest = cpuRequest.String
		ws.MemoryRequest = memoryRequest.String
		ws.CPULimit = cpuLimit.String
		ws.MemoryLimit = memoryLimit.String
		ws.DataSize = dataSize.String
		ws.SrcSize = srcSize.String
		ws.GitEnabled = gitEnabled == 1
		ws.GitUserName = gitUserName.String
		ws.GitUserEmail = gitUserEmail.String

		workspaces = append(workspaces, ws)
	}

	return workspaces, rows.Err()
}

// UpdateWorkspace updates an existing workspace
func (s *SQLiteStore) UpdateWorkspace(ctx context.Context, ws *Workspace) error {
	query := `
		UPDATE workspaces SET
			name = ?, status = ?, docker_image = ?, docker_image_tag = ?,
			ingress_host = ?,
			cpu_request = ?, memory_request = ?, cpu_limit = ?, memory_limit = ?,
			data_size = ?, src_size = ?,
			git_enabled = ?, git_user_name = ?, git_user_email = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`

	gitEnabled := 0
	if ws.GitEnabled {
		gitEnabled = 1
	}

	_, err := s.db.ExecContext(ctx, query,
		ws.Name, ws.Status, ws.DockerImage, ws.DockerImageTag,
		ws.IngressHost,
		ws.CPURequest, ws.MemoryRequest, ws.CPULimit, ws.MemoryLimit,
		ws.DataSize, ws.SrcSize,
		gitEnabled, ws.GitUserName, ws.GitUserEmail,
		ws.ID,
	)

	return err
}

// DeleteWorkspace deletes a workspace by ID
func (s *SQLiteStore) DeleteWorkspace(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM workspaces WHERE id = ?", id)
	return err
}

// SetSecret sets or updates a secret for a workspace
func (s *SQLiteStore) SetSecret(ctx context.Context, secret *WorkspaceSecret) error {
	query := `
		INSERT INTO workspace_secrets (workspace_id, key, value)
		VALUES (?, ?, ?)
		ON CONFLICT (workspace_id, key) DO UPDATE SET value = excluded.value
	`

	_, err := s.db.ExecContext(ctx, query, secret.WorkspaceID, secret.Key, secret.Value)
	return err
}

// GetSecret retrieves a specific secret for a workspace
func (s *SQLiteStore) GetSecret(ctx context.Context, workspaceID, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx,
		"SELECT value FROM workspace_secrets WHERE workspace_id = ? AND key = ?",
		workspaceID, key,
	).Scan(&value)

	if err == sql.ErrNoRows {
		return "", fmt.Errorf("secret not found")
	}

	return value, err
}

// GetSecrets retrieves all secrets for a workspace
func (s *SQLiteStore) GetSecrets(ctx context.Context, workspaceID string) ([]*WorkspaceSecret, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT key, value FROM workspace_secrets WHERE workspace_id = ?",
		workspaceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var secrets []*WorkspaceSecret
	for rows.Next() {
		secret := &WorkspaceSecret{WorkspaceID: workspaceID}
		if err := rows.Scan(&secret.Key, &secret.Value); err != nil {
			return nil, err
		}
		secrets = append(secrets, secret)
	}

	return secrets, rows.Err()
}

// DeleteSecrets deletes all secrets for a workspace
func (s *SQLiteStore) DeleteSecrets(ctx context.Context, workspaceID string) error {
	_, err := s.db.ExecContext(ctx,
		"DELETE FROM workspace_secrets WHERE workspace_id = ?",
		workspaceID,
	)
	return err
}

// LogEvent logs an event for a workspace
func (s *SQLiteStore) LogEvent(ctx context.Context, event *WorkspaceEvent) error {
	query := `
		INSERT INTO workspace_events (workspace_id, event_type, message, metadata)
		VALUES (?, ?, ?, ?)
	`

	result, err := s.db.ExecContext(ctx, query,
		event.WorkspaceID, event.EventType, event.Message, event.Metadata,
	)
	if err != nil {
		return err
	}

	id, _ := result.LastInsertId()
	event.ID = id
	event.CreatedAt = time.Now()

	return nil
}

// GetEvents retrieves events for a workspace
func (s *SQLiteStore) GetEvents(ctx context.Context, workspaceID string, limit int) ([]*WorkspaceEvent, error) {
	query := `
		SELECT id, workspace_id, event_type, message, metadata, created_at
		FROM workspace_events
		WHERE workspace_id = ?
		ORDER BY created_at DESC
		LIMIT ?
	`

	rows, err := s.db.QueryContext(ctx, query, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*WorkspaceEvent
	for rows.Next() {
		event := &WorkspaceEvent{}
		var message, metadata sql.NullString

		err := rows.Scan(
			&event.ID, &event.WorkspaceID, &event.EventType,
			&message, &metadata, &event.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		event.Message = message.String
		event.Metadata = metadata.String
		events = append(events, event)
	}

	return events, rows.Err()
}

// Close closes the database connection
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}
