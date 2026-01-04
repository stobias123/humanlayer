package orchestrator

import (
	"context"

	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
)

// WorkspaceStatus represents the current state of a workspace deployment
type WorkspaceStatus struct {
	Phase     string `json:"phase"`
	Ready     bool   `json:"ready"`
	Message   string `json:"message,omitempty"`
	PodIP     string `json:"pod_ip,omitempty"`
	NodeName  string `json:"node_name,omitempty"`
	StartTime string `json:"start_time,omitempty"`
}

// Orchestrator defines the interface for workspace deployment management
type Orchestrator interface {
	// DeployWorkspace creates a new workspace deployment
	DeployWorkspace(ctx context.Context, ws *store.Workspace, secrets []*store.WorkspaceSecret) error

	// StopWorkspace scales the workspace to 0 replicas
	StopWorkspace(ctx context.Context, ws *store.Workspace) error

	// StartWorkspace scales the workspace to 1 replica
	StartWorkspace(ctx context.Context, ws *store.Workspace) error

	// DeleteWorkspace removes the workspace deployment
	DeleteWorkspace(ctx context.Context, ws *store.Workspace) error

	// GetWorkspaceStatus returns the current status of a workspace
	GetWorkspaceStatus(ctx context.Context, ws *store.Workspace) (*WorkspaceStatus, error)
}
