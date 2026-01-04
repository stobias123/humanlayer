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
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
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
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS workspaces (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			docker_image TEXT NOT NULL,
			docker_image_tag TEXT NOT NULL DEFAULT 'latest',
			helm_release_name TEXT,
			namespace TEXT NOT NULL DEFAULT 'default',
			ingress_host TEXT,
			cpu_request TEXT DEFAULT '100m',
			memory_request TEXT DEFAULT '256Mi',
			cpu_limit TEXT DEFAULT '1000m',
			memory_limit TEXT DEFAULT '1Gi',
			data_size TEXT DEFAULT '1Gi',
			src_size TEXT DEFAULT '5Gi',
			git_enabled INTEGER DEFAULT 0,
			git_user_name TEXT,
			git_user_email TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS workspace_secrets (
			workspace_id TEXT NOT NULL,
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			PRIMARY KEY (workspace_id, key),
			FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS workspace_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			workspace_id TEXT NOT NULL,
			event_type TEXT NOT NULL,
			message TEXT,
			metadata TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_events_workspace ON workspace_events(workspace_id)`,
	}

	for _, m := range migrations {
		if _, err := s.db.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}
	return nil
}

func (s *SQLiteStore) CreateWorkspace(ctx context.Context, ws *Workspace) error {
	now := time.Now()
	ws.CreatedAt = now
	ws.UpdatedAt = now
	if ws.Status == "" {
		ws.Status = StatusPending
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO workspaces (
			id, name, status, docker_image, docker_image_tag, helm_release_name,
			namespace, ingress_host, cpu_request, memory_request, cpu_limit,
			memory_limit, data_size, src_size, git_enabled, git_user_name,
			git_user_email, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		ws.ID, ws.Name, ws.Status, ws.DockerImage, ws.DockerImageTag,
		ws.HelmReleaseName, ws.Namespace, ws.IngressHost, ws.CPURequest,
		ws.MemoryRequest, ws.CPULimit, ws.MemoryLimit, ws.DataSize,
		ws.SrcSize, ws.GitEnabled, ws.GitUserName, ws.GitUserEmail,
		ws.CreatedAt, ws.UpdatedAt,
	)
	return err
}

func (s *SQLiteStore) GetWorkspace(ctx context.Context, id string) (*Workspace, error) {
	ws := &Workspace{}
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, status, docker_image, docker_image_tag, helm_release_name,
			namespace, ingress_host, cpu_request, memory_request, cpu_limit,
			memory_limit, data_size, src_size, git_enabled, git_user_name,
			git_user_email, created_at, updated_at
		FROM workspaces WHERE id = ?
	`, id).Scan(
		&ws.ID, &ws.Name, &ws.Status, &ws.DockerImage, &ws.DockerImageTag,
		&ws.HelmReleaseName, &ws.Namespace, &ws.IngressHost, &ws.CPURequest,
		&ws.MemoryRequest, &ws.CPULimit, &ws.MemoryLimit, &ws.DataSize,
		&ws.SrcSize, &ws.GitEnabled, &ws.GitUserName, &ws.GitUserEmail,
		&ws.CreatedAt, &ws.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return ws, err
}

func (s *SQLiteStore) ListWorkspaces(ctx context.Context) ([]*Workspace, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, status, docker_image, docker_image_tag, helm_release_name,
			namespace, ingress_host, cpu_request, memory_request, cpu_limit,
			memory_limit, data_size, src_size, git_enabled, git_user_name,
			git_user_email, created_at, updated_at
		FROM workspaces ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workspaces []*Workspace
	for rows.Next() {
		ws := &Workspace{}
		if err := rows.Scan(
			&ws.ID, &ws.Name, &ws.Status, &ws.DockerImage, &ws.DockerImageTag,
			&ws.HelmReleaseName, &ws.Namespace, &ws.IngressHost, &ws.CPURequest,
			&ws.MemoryRequest, &ws.CPULimit, &ws.MemoryLimit, &ws.DataSize,
			&ws.SrcSize, &ws.GitEnabled, &ws.GitUserName, &ws.GitUserEmail,
			&ws.CreatedAt, &ws.UpdatedAt,
		); err != nil {
			return nil, err
		}
		workspaces = append(workspaces, ws)
	}
	return workspaces, rows.Err()
}

func (s *SQLiteStore) UpdateWorkspace(ctx context.Context, ws *Workspace) error {
	ws.UpdatedAt = time.Now()
	_, err := s.db.ExecContext(ctx, `
		UPDATE workspaces SET
			name = ?, status = ?, docker_image = ?, docker_image_tag = ?,
			helm_release_name = ?, namespace = ?, ingress_host = ?,
			cpu_request = ?, memory_request = ?, cpu_limit = ?, memory_limit = ?,
			data_size = ?, src_size = ?, git_enabled = ?, git_user_name = ?,
			git_user_email = ?, updated_at = ?
		WHERE id = ?
	`,
		ws.Name, ws.Status, ws.DockerImage, ws.DockerImageTag,
		ws.HelmReleaseName, ws.Namespace, ws.IngressHost,
		ws.CPURequest, ws.MemoryRequest, ws.CPULimit, ws.MemoryLimit,
		ws.DataSize, ws.SrcSize, ws.GitEnabled, ws.GitUserName,
		ws.GitUserEmail, ws.UpdatedAt, ws.ID,
	)
	return err
}

func (s *SQLiteStore) DeleteWorkspace(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM workspaces WHERE id = ?`, id)
	return err
}

func (s *SQLiteStore) SetSecret(ctx context.Context, secret *WorkspaceSecret) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO workspace_secrets (workspace_id, key, value)
		VALUES (?, ?, ?)
	`, secret.WorkspaceID, secret.Key, secret.Value)
	return err
}

func (s *SQLiteStore) GetSecret(ctx context.Context, workspaceID, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `
		SELECT value FROM workspace_secrets WHERE workspace_id = ? AND key = ?
	`, workspaceID, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (s *SQLiteStore) GetSecrets(ctx context.Context, workspaceID string) ([]*WorkspaceSecret, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT workspace_id, key, value FROM workspace_secrets WHERE workspace_id = ?
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var secrets []*WorkspaceSecret
	for rows.Next() {
		secret := &WorkspaceSecret{}
		if err := rows.Scan(&secret.WorkspaceID, &secret.Key, &secret.Value); err != nil {
			return nil, err
		}
		secrets = append(secrets, secret)
	}
	return secrets, rows.Err()
}

func (s *SQLiteStore) DeleteSecrets(ctx context.Context, workspaceID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM workspace_secrets WHERE workspace_id = ?`, workspaceID)
	return err
}

func (s *SQLiteStore) LogEvent(ctx context.Context, event *WorkspaceEvent) error {
	event.CreatedAt = time.Now()
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO workspace_events (workspace_id, event_type, message, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, event.WorkspaceID, event.EventType, event.Message, event.Metadata, event.CreatedAt)
	if err != nil {
		return err
	}
	id, _ := result.LastInsertId()
	event.ID = id
	return nil
}

func (s *SQLiteStore) GetEvents(ctx context.Context, workspaceID string, limit int) ([]*WorkspaceEvent, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, workspace_id, event_type, message, metadata, created_at
		FROM workspace_events WHERE workspace_id = ?
		ORDER BY created_at DESC LIMIT ?
	`, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*WorkspaceEvent
	for rows.Next() {
		event := &WorkspaceEvent{}
		if err := rows.Scan(
			&event.ID, &event.WorkspaceID, &event.EventType,
			&event.Message, &event.Metadata, &event.CreatedAt,
		); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (s *SQLiteStore) Close() error {
	return s.db.Close()
}
