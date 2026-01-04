package store

import (
	"context"
	"time"
)

// WorkspaceStatus represents the lifecycle state of a workspace
type WorkspaceStatus string

const (
	StatusPending WorkspaceStatus = "pending"
	StatusRunning WorkspaceStatus = "running"
	StatusStopped WorkspaceStatus = "stopped"
	StatusError   WorkspaceStatus = "error"
)

// Workspace represents a managed HLD daemon instance
type Workspace struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	Status          WorkspaceStatus `json:"status"`
	DockerImage     string          `json:"docker_image"`
	DockerImageTag  string          `json:"docker_image_tag"`
	HelmReleaseName string          `json:"helm_release_name"`
	Namespace       string          `json:"namespace"`
	IngressHost     string          `json:"ingress_host,omitempty"`

	// Resource limits
	CPURequest    string `json:"cpu_request"`
	MemoryRequest string `json:"memory_request"`
	CPULimit      string `json:"cpu_limit"`
	MemoryLimit   string `json:"memory_limit"`
	DataSize      string `json:"data_size"`
	SrcSize       string `json:"src_size"`

	// Git configuration
	GitEnabled   bool   `json:"git_enabled"`
	GitUserName  string `json:"git_user_name,omitempty"`
	GitUserEmail string `json:"git_user_email,omitempty"`

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WorkspaceSecret represents sensitive data for a workspace
type WorkspaceSecret struct {
	WorkspaceID string `json:"workspace_id"`
	Key         string `json:"key"`
	Value       string `json:"-"` // Never serialize
}

// WorkspaceEvent represents an audit log entry
type WorkspaceEvent struct {
	ID          int64     `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	EventType   string    `json:"event_type"`
	Message     string    `json:"message,omitempty"`
	Metadata    string    `json:"metadata,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// Store defines the interface for workspace persistence
type Store interface {
	// Workspace CRUD
	CreateWorkspace(ctx context.Context, ws *Workspace) error
	GetWorkspace(ctx context.Context, id string) (*Workspace, error)
	ListWorkspaces(ctx context.Context) ([]*Workspace, error)
	UpdateWorkspace(ctx context.Context, ws *Workspace) error
	DeleteWorkspace(ctx context.Context, id string) error

	// Secrets
	SetSecret(ctx context.Context, secret *WorkspaceSecret) error
	GetSecret(ctx context.Context, workspaceID, key string) (string, error)
	GetSecrets(ctx context.Context, workspaceID string) ([]*WorkspaceSecret, error)
	DeleteSecrets(ctx context.Context, workspaceID string) error

	// Events
	LogEvent(ctx context.Context, event *WorkspaceEvent) error
	GetEvents(ctx context.Context, workspaceID string, limit int) ([]*WorkspaceEvent, error)

	// Lifecycle
	Close() error
}
