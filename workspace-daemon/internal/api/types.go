package api

import (
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/orchestrator"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
)

// CreateWorkspaceRequest matches UI CreateWorkspaceRequest type
type CreateWorkspaceRequest struct {
	Name           string            `json:"name" binding:"required"`
	DockerImage    string            `json:"docker_image,omitempty"`
	DockerImageTag string            `json:"docker_image_tag,omitempty"`
	CPURequest     string            `json:"cpu_request,omitempty"`
	MemoryRequest  string            `json:"memory_request,omitempty"`
	CPULimit       string            `json:"cpu_limit,omitempty"`
	MemoryLimit    string            `json:"memory_limit,omitempty"`
	DataSize       string            `json:"data_size,omitempty"`
	SrcSize        string            `json:"src_size,omitempty"`
	GitUserName    string            `json:"git_user_name,omitempty"`
	GitUserEmail   string            `json:"git_user_email,omitempty"`
	Secrets        map[string]string `json:"secrets,omitempty"`
}

// WorkspaceResponse wraps a workspace with error field
type WorkspaceResponse struct {
	Data  *WorkspaceDTO `json:"data"`
	Error *string       `json:"error"`
}

// WorkspaceListResponse wraps workspace list with error field
type WorkspaceListResponse struct {
	Data  []*WorkspaceDTO `json:"data"`
	Error *string         `json:"error"`
}

// EventListResponse wraps event list with error field
type EventListResponse struct {
	Data  []*store.WorkspaceEvent `json:"data"`
	Error *string                 `json:"error"`
}

// MessageResponse for delete operations
type MessageResponse struct {
	Message string  `json:"message"`
	Error   *string `json:"error"`
}

// WorkspaceDTO is the API representation of a workspace
type WorkspaceDTO struct {
	ID               string                       `json:"id"`
	Name             string                       `json:"name"`
	Status           string                       `json:"status"`
	DockerImage      string                       `json:"docker_image"`
	DockerImageTag   string                       `json:"docker_image_tag"`
	HelmReleaseName  string                       `json:"helm_release_name"`
	Namespace        string                       `json:"namespace"`
	IngressHost      string                       `json:"ingress_host,omitempty"`
	CPURequest       string                       `json:"cpu_request,omitempty"`
	MemoryRequest    string                       `json:"memory_request,omitempty"`
	CPULimit         string                       `json:"cpu_limit,omitempty"`
	MemoryLimit      string                       `json:"memory_limit,omitempty"`
	DataSize         string                       `json:"data_size,omitempty"`
	SrcSize          string                       `json:"src_size,omitempty"`
	GitEnabled       bool                         `json:"git_enabled"`
	GitUserName      string                       `json:"git_user_name,omitempty"`
	GitUserEmail     string                       `json:"git_user_email,omitempty"`
	CreatedAt        string                       `json:"created_at"`
	UpdatedAt        string                       `json:"updated_at"`
	DeploymentStatus *orchestrator.WorkspaceStatus `json:"deployment_status,omitempty"`
}

// ToDTO converts store.Workspace to WorkspaceDTO
func ToDTO(ws *store.Workspace) *WorkspaceDTO {
	return &WorkspaceDTO{
		ID:              ws.ID,
		Name:            ws.Name,
		Status:          string(ws.Status),
		DockerImage:     ws.DockerImage,
		DockerImageTag:  ws.DockerImageTag,
		HelmReleaseName: ws.HelmReleaseName,
		Namespace:       ws.Namespace,
		IngressHost:     ws.IngressHost,
		CPURequest:      ws.CPURequest,
		MemoryRequest:   ws.MemoryRequest,
		CPULimit:        ws.CPULimit,
		MemoryLimit:     ws.MemoryLimit,
		DataSize:        ws.DataSize,
		SrcSize:         ws.SrcSize,
		GitEnabled:      ws.GitEnabled,
		GitUserName:     ws.GitUserName,
		GitUserEmail:    ws.GitUserEmail,
		CreatedAt:       ws.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:       ws.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// ToDTOWithStatus adds deployment status to DTO
func ToDTOWithStatus(ws *store.Workspace, status *orchestrator.WorkspaceStatus) *WorkspaceDTO {
	dto := ToDTO(ws)
	dto.DeploymentStatus = status
	return dto
}
