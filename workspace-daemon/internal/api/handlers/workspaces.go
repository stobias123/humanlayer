package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/humanlayer/humanlayer/workspace-daemon/internal/orchestrator"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
)

// WorkspaceHandler handles workspace API requests
type WorkspaceHandler struct {
	store        store.Store
	orchestrator orchestrator.Orchestrator
}

// NewWorkspaceHandler creates a new workspace handler
func NewWorkspaceHandler(s store.Store, o orchestrator.Orchestrator) *WorkspaceHandler {
	return &WorkspaceHandler{
		store:        s,
		orchestrator: o,
	}
}

// API Response Types

type WorkspaceResponse struct {
	Data  *WorkspaceDTO `json:"data"`
	Error *string       `json:"error"`
}

type WorkspaceListResponse struct {
	Data  []*WorkspaceDTO `json:"data"`
	Error *string         `json:"error"`
}

type EventListResponse struct {
	Data  []*EventDTO `json:"data"`
	Error *string     `json:"error"`
}

type MessageResponse struct {
	Message string  `json:"message"`
	Error   *string `json:"error"`
}

type ErrorResponse struct {
	Data  interface{} `json:"data"`
	Error string      `json:"error"`
}

// WorkspaceDTO is the API representation of a workspace
type WorkspaceDTO struct {
	ID               string                        `json:"id"`
	Name             string                        `json:"name"`
	Status           string                        `json:"status"`
	DockerImage      string                        `json:"docker_image"`
	DockerImageTag   string                        `json:"docker_image_tag"`
	HelmReleaseName  string                        `json:"helm_release_name"`
	Namespace        string                        `json:"namespace"`
	IngressHost      string                        `json:"ingress_host,omitempty"`
	CPURequest       string                        `json:"cpu_request,omitempty"`
	MemoryRequest    string                        `json:"memory_request,omitempty"`
	CPULimit         string                        `json:"cpu_limit,omitempty"`
	MemoryLimit      string                        `json:"memory_limit,omitempty"`
	DataSize         string                        `json:"data_size,omitempty"`
	SrcSize          string                        `json:"src_size,omitempty"`
	GitEnabled       bool                          `json:"git_enabled"`
	GitUserName      string                        `json:"git_user_name,omitempty"`
	GitUserEmail     string                        `json:"git_user_email,omitempty"`
	CreatedAt        time.Time                     `json:"created_at"`
	UpdatedAt        time.Time                     `json:"updated_at"`
	DeploymentStatus *orchestrator.WorkspaceStatus `json:"deployment_status,omitempty"`
}

// EventDTO is the API representation of a workspace event
type EventDTO struct {
	ID          int64     `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	EventType   string    `json:"event_type"`
	Message     string    `json:"message,omitempty"`
	Metadata    string    `json:"metadata,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// CreateWorkspaceRequest is the request body for creating a workspace
type CreateWorkspaceRequest struct {
	Name           string            `json:"name" binding:"required,min=1,max=63"`
	DockerImage    string            `json:"docker_image"`
	DockerImageTag string            `json:"docker_image_tag"`
	CPURequest     string            `json:"cpu_request"`
	MemoryRequest  string            `json:"memory_request"`
	CPULimit       string            `json:"cpu_limit"`
	MemoryLimit    string            `json:"memory_limit"`
	DataSize       string            `json:"data_size"`
	SrcSize        string            `json:"src_size"`
	GitUserName    string            `json:"git_user_name"`
	GitUserEmail   string            `json:"git_user_email"`
	Secrets        map[string]string `json:"secrets"`
}

// Helper functions

func workspaceToDTO(ws *store.Workspace) *WorkspaceDTO {
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
		CreatedAt:       ws.CreatedAt,
		UpdatedAt:       ws.UpdatedAt,
	}
}

func eventToDTO(event *store.WorkspaceEvent) *EventDTO {
	return &EventDTO{
		ID:          event.ID,
		WorkspaceID: event.WorkspaceID,
		EventType:   event.EventType,
		Message:     event.Message,
		Metadata:    event.Metadata,
		CreatedAt:   event.CreatedAt,
	}
}

func errorPtr(s string) *string {
	return &s
}

func sanitizeName(name string) string {
	// Convert to lowercase and replace spaces/special chars with dashes
	name = strings.ToLower(name)
	name = strings.ReplaceAll(name, " ", "-")
	// Remove any characters that aren't alphanumeric or dash
	var result []rune
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			result = append(result, r)
		}
	}
	name = string(result)
	// Truncate to 53 chars to leave room for prefix
	if len(name) > 53 {
		name = name[:53]
	}
	return name
}

// Handlers

// List returns all workspaces
func (h *WorkspaceHandler) List(c *gin.Context) {
	ctx := c.Request.Context()

	workspaces, err := h.store.ListWorkspaces(ctx)
	if err != nil {
		slog.Error("Failed to list workspaces", "error", err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: "Failed to list workspaces",
		})
		return
	}

	dtos := make([]*WorkspaceDTO, len(workspaces))
	for i, ws := range workspaces {
		dto := workspaceToDTO(ws)
		// Optionally fetch deployment status
		if h.orchestrator != nil && ws.Status == store.StatusRunning {
			status, err := h.orchestrator.GetWorkspaceStatus(ctx, ws)
			if err == nil {
				dto.DeploymentStatus = status
			}
		}
		dtos[i] = dto
	}

	c.JSON(http.StatusOK, WorkspaceListResponse{
		Data: dtos,
	})
}

// Create creates a new workspace
func (h *WorkspaceHandler) Create(c *gin.Context) {
	ctx := c.Request.Context()

	var req CreateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	// Generate unique ID and derived values
	id := uuid.New().String()[:8]
	sanitizedName := sanitizeName(req.Name)
	helmReleaseName := fmt.Sprintf("ws-%s", id)
	namespace := fmt.Sprintf("ws-%s", id)

	// Set defaults
	dockerImage := req.DockerImage
	if dockerImage == "" {
		dockerImage = "hld"
	}
	dockerImageTag := req.DockerImageTag
	if dockerImageTag == "" {
		dockerImageTag = "latest"
	}

	// Determine if git is enabled
	gitEnabled := req.GitUserName != "" || req.GitUserEmail != ""
	if req.Secrets != nil {
		if _, ok := req.Secrets["gh_token"]; ok {
			gitEnabled = true
		}
	}

	// Create workspace record
	ws := &store.Workspace{
		ID:              id,
		Name:            req.Name,
		Status:          store.StatusPending,
		DockerImage:     dockerImage,
		DockerImageTag:  dockerImageTag,
		HelmReleaseName: helmReleaseName,
		Namespace:       namespace,
		IngressHost:     fmt.Sprintf("%s.workspaces.local", sanitizedName),
		CPURequest:      req.CPURequest,
		MemoryRequest:   req.MemoryRequest,
		CPULimit:        req.CPULimit,
		MemoryLimit:     req.MemoryLimit,
		DataSize:        req.DataSize,
		SrcSize:         req.SrcSize,
		GitEnabled:      gitEnabled,
		GitUserName:     req.GitUserName,
		GitUserEmail:    req.GitUserEmail,
	}

	if err := h.store.CreateWorkspace(ctx, ws); err != nil {
		slog.Error("Failed to create workspace", "error", err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: "Failed to create workspace",
		})
		return
	}

	// Store secrets
	var secrets []*store.WorkspaceSecret
	for key, value := range req.Secrets {
		secret := &store.WorkspaceSecret{
			WorkspaceID: id,
			Key:         key,
			Value:       value,
		}
		if err := h.store.SetSecret(ctx, secret); err != nil {
			slog.Error("Failed to store secret", "key", key, "error", err)
			// Continue - don't fail the whole request
		}
		secrets = append(secrets, secret)
	}

	// Log creation event
	h.store.LogEvent(ctx, &store.WorkspaceEvent{
		WorkspaceID: id,
		EventType:   "created",
		Message:     fmt.Sprintf("Workspace '%s' created", req.Name),
	})

	// Deploy in background
	if h.orchestrator != nil {
		go func() {
			slog.Info("Starting background deployment", "workspace", id)
			if err := h.orchestrator.DeployWorkspace(ctx, ws, secrets); err != nil {
				slog.Error("Background deployment failed", "workspace", id, "error", err)
				ws.Status = store.StatusError
				h.store.UpdateWorkspace(ctx, ws)
				h.store.LogEvent(ctx, &store.WorkspaceEvent{
					WorkspaceID: id,
					EventType:   "error",
					Message:     fmt.Sprintf("Deployment failed: %v", err),
				})
				return
			}
			ws.Status = store.StatusRunning
			h.store.UpdateWorkspace(ctx, ws)
			h.store.LogEvent(ctx, &store.WorkspaceEvent{
				WorkspaceID: id,
				EventType:   "started",
				Message:     "Workspace deployed successfully",
			})
		}()
	}

	// Reload to get timestamps
	ws, _ = h.store.GetWorkspace(ctx, id)

	c.JSON(http.StatusCreated, WorkspaceResponse{
		Data: workspaceToDTO(ws),
	})
}

// Get returns a single workspace by ID
func (h *WorkspaceHandler) Get(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	ws, err := h.store.GetWorkspace(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{
			Error: "Workspace not found",
		})
		return
	}

	dto := workspaceToDTO(ws)

	// Fetch deployment status
	if h.orchestrator != nil {
		status, err := h.orchestrator.GetWorkspaceStatus(ctx, ws)
		if err == nil {
			dto.DeploymentStatus = status
		}
	}

	c.JSON(http.StatusOK, WorkspaceResponse{
		Data: dto,
	})
}

// Delete removes a workspace
func (h *WorkspaceHandler) Delete(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	ws, err := h.store.GetWorkspace(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{
			Error: "Workspace not found",
		})
		return
	}

	// Delete from orchestrator first
	if h.orchestrator != nil {
		if err := h.orchestrator.DeleteWorkspace(ctx, ws); err != nil {
			slog.Warn("Failed to delete workspace from orchestrator", "id", id, "error", err)
			// Continue with database deletion
		}
	}

	// Delete from database (cascades to secrets and events)
	if err := h.store.DeleteWorkspace(ctx, id); err != nil {
		slog.Error("Failed to delete workspace", "id", id, "error", err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: "Failed to delete workspace",
		})
		return
	}

	c.JSON(http.StatusOK, MessageResponse{
		Message: fmt.Sprintf("Workspace '%s' deleted", ws.Name),
	})
}

// Start starts a stopped workspace
func (h *WorkspaceHandler) Start(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	ws, err := h.store.GetWorkspace(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{
			Error: "Workspace not found",
		})
		return
	}

	if ws.Status == store.StatusRunning {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "Workspace is already running",
		})
		return
	}

	// Start via orchestrator
	if h.orchestrator != nil {
		if err := h.orchestrator.StartWorkspace(ctx, ws); err != nil {
			slog.Error("Failed to start workspace", "id", id, "error", err)
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error: "Failed to start workspace",
			})
			return
		}
	}

	// Update status
	ws.Status = store.StatusRunning
	if err := h.store.UpdateWorkspace(ctx, ws); err != nil {
		slog.Error("Failed to update workspace status", "id", id, "error", err)
	}

	// Log event
	h.store.LogEvent(ctx, &store.WorkspaceEvent{
		WorkspaceID: id,
		EventType:   "started",
		Message:     "Workspace started",
	})

	// Reload to get updated timestamps
	ws, _ = h.store.GetWorkspace(ctx, id)

	c.JSON(http.StatusOK, WorkspaceResponse{
		Data: workspaceToDTO(ws),
	})
}

// Stop stops a running workspace
func (h *WorkspaceHandler) Stop(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	ws, err := h.store.GetWorkspace(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{
			Error: "Workspace not found",
		})
		return
	}

	if ws.Status == store.StatusStopped {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "Workspace is already stopped",
		})
		return
	}

	// Stop via orchestrator
	if h.orchestrator != nil {
		if err := h.orchestrator.StopWorkspace(ctx, ws); err != nil {
			slog.Error("Failed to stop workspace", "id", id, "error", err)
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error: "Failed to stop workspace",
			})
			return
		}
	}

	// Update status
	ws.Status = store.StatusStopped
	if err := h.store.UpdateWorkspace(ctx, ws); err != nil {
		slog.Error("Failed to update workspace status", "id", id, "error", err)
	}

	// Log event
	h.store.LogEvent(ctx, &store.WorkspaceEvent{
		WorkspaceID: id,
		EventType:   "stopped",
		Message:     "Workspace stopped",
	})

	// Reload to get updated timestamps
	ws, _ = h.store.GetWorkspace(ctx, id)

	c.JSON(http.StatusOK, WorkspaceResponse{
		Data: workspaceToDTO(ws),
	})
}

// Events returns workspace events
func (h *WorkspaceHandler) Events(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	// Check workspace exists
	_, err := h.store.GetWorkspace(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, ErrorResponse{
			Error: "Workspace not found",
		})
		return
	}

	// Parse limit
	limit := 50
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	events, err := h.store.GetEvents(ctx, id, limit)
	if err != nil {
		slog.Error("Failed to get events", "workspace", id, "error", err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: "Failed to get events",
		})
		return
	}

	dtos := make([]*EventDTO, len(events))
	for i, event := range events {
		dtos[i] = eventToDTO(event)
	}

	c.JSON(http.StatusOK, EventListResponse{
		Data: dtos,
	})
}
