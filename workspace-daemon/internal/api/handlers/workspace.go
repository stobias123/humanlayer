package handlers

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/api"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/orchestrator"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
)

// WorkspaceHandlers holds dependencies for workspace handlers
type WorkspaceHandlers struct {
	store        store.Store
	orchestrator orchestrator.Orchestrator
	logger       *slog.Logger
}

// NewWorkspaceHandlers creates a new WorkspaceHandlers instance
func NewWorkspaceHandlers(s store.Store, o orchestrator.Orchestrator, logger *slog.Logger) *WorkspaceHandlers {
	return &WorkspaceHandlers{
		store:        s,
		orchestrator: o,
		logger:       logger,
	}
}

// errorResponse helper to create error response
func errorResponse(err error) *string {
	msg := err.Error()
	return &msg
}

// ListWorkspaces handles GET /api/v1/workspaces
func (h *WorkspaceHandlers) ListWorkspaces() gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaces, err := h.store.ListWorkspaces(c.Request.Context())
		if err != nil {
			h.logger.Error("failed to list workspaces", "error", err)
			c.JSON(http.StatusInternalServerError, api.WorkspaceListResponse{
				Data:  nil,
				Error: errorResponse(err),
			})
			return
		}

		dtos := make([]*api.WorkspaceDTO, len(workspaces))
		for i, ws := range workspaces {
			dtos[i] = api.ToDTO(ws)
		}

		c.JSON(http.StatusOK, api.WorkspaceListResponse{
			Data:  dtos,
			Error: nil,
		})
	}
}

// GetWorkspace handles GET /api/v1/workspaces/:id
func (h *WorkspaceHandlers) GetWorkspace() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		ws, err := h.store.GetWorkspace(c.Request.Context(), id)
		if err != nil {
			h.logger.Error("failed to get workspace", "id", id, "error", err)
			c.JSON(http.StatusInternalServerError, api.WorkspaceResponse{
				Data:  nil,
				Error: errorResponse(err),
			})
			return
		}

		if ws == nil {
			c.JSON(http.StatusNotFound, api.WorkspaceResponse{
				Data:  nil,
				Error: errorResponse(fmt.Errorf("workspace not found: %s", id)),
			})
			return
		}

		// Get deployment status from K8s
		status, err := h.orchestrator.GetWorkspaceStatus(c.Request.Context(), ws)
		if err != nil {
			h.logger.Warn("failed to get workspace status from k8s", "id", id, "error", err)
			// Continue without status - don't fail the request
		}

		c.JSON(http.StatusOK, api.WorkspaceResponse{
			Data:  api.ToDTOWithStatus(ws, status),
			Error: nil,
		})
	}
}

// CreateWorkspace handles POST /api/v1/workspaces
func (h *WorkspaceHandlers) CreateWorkspace() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req api.CreateWorkspaceRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, api.WorkspaceResponse{
				Data:  nil,
				Error: errorResponse(fmt.Errorf("invalid request: %w", err)),
			})
			return
		}

		// Generate workspace ID
		id := uuid.New().String()[:8] // Short ID for usability

		// Create workspace model with defaults
		ws := &store.Workspace{
			ID:              id,
			Name:            req.Name,
			Status:          store.StatusPending,
			DockerImage:     defaultString(req.DockerImage, "la-nuc-1:30500/hld"),
			DockerImageTag:  defaultString(req.DockerImageTag, "latest"),
			HelmReleaseName: fmt.Sprintf("hld-%s", id),
			Namespace:       fmt.Sprintf("workspace-%s", id),
			IngressHost:     fmt.Sprintf("workspace-%s.workspaces.local", id),
			CPURequest:      defaultString(req.CPURequest, "100m"),
			MemoryRequest:   defaultString(req.MemoryRequest, "256Mi"),
			CPULimit:        defaultString(req.CPULimit, "1"),
			MemoryLimit:     defaultString(req.MemoryLimit, "1Gi"),
			DataSize:        defaultString(req.DataSize, "1Gi"),
			SrcSize:         defaultString(req.SrcSize, "5Gi"),
			GitEnabled:      req.GitUserName != "" && req.GitUserEmail != "",
			GitUserName:     req.GitUserName,
			GitUserEmail:    req.GitUserEmail,
		}

		// Save to database first
		if err := h.store.CreateWorkspace(c.Request.Context(), ws); err != nil {
			h.logger.Error("failed to create workspace in store", "error", err)
			c.JSON(http.StatusInternalServerError, api.WorkspaceResponse{
				Data:  nil,
				Error: errorResponse(err),
			})
			return
		}

		// Save secrets
		var secrets []*store.WorkspaceSecret
		for key, value := range req.Secrets {
			secret := &store.WorkspaceSecret{
				WorkspaceID: id,
				Key:         key,
				Value:       value,
			}
			if err := h.store.SetSecret(c.Request.Context(), secret); err != nil {
				h.logger.Error("failed to save secret", "key", key, "error", err)
				// Continue - don't fail the whole request
			}
			secrets = append(secrets, secret)
		}

		// Log creation event
		h.store.LogEvent(c.Request.Context(), &store.WorkspaceEvent{
			WorkspaceID: id,
			EventType:   "created",
			Message:     fmt.Sprintf("Workspace %s created", ws.Name),
		})

		// Deploy via Helm
		if err := h.orchestrator.DeployWorkspace(c.Request.Context(), ws, secrets); err != nil {
			h.logger.Error("failed to deploy workspace", "id", id, "error", err)
			// Update status to error
			ws.Status = store.StatusError
			h.store.UpdateWorkspace(c.Request.Context(), ws)
			h.store.LogEvent(c.Request.Context(), &store.WorkspaceEvent{
				WorkspaceID: id,
				EventType:   "error",
				Message:     fmt.Sprintf("Deployment failed: %s", err.Error()),
			})
			c.JSON(http.StatusInternalServerError, api.WorkspaceResponse{
				Data:  nil,
				Error: errorResponse(fmt.Errorf("deployment failed: %w", err)),
			})
			return
		}

		// Update status to running (deployment initiated)
		ws.Status = store.StatusRunning
		h.store.UpdateWorkspace(c.Request.Context(), ws)
		h.store.LogEvent(c.Request.Context(), &store.WorkspaceEvent{
			WorkspaceID: id,
			EventType:   "deployed",
			Message:     "Helm release installed",
		})

		c.JSON(http.StatusCreated, api.WorkspaceResponse{
			Data:  api.ToDTO(ws),
			Error: nil,
		})
	}
}

// DeleteWorkspace handles DELETE /api/v1/workspaces/:id
func (h *WorkspaceHandlers) DeleteWorkspace() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		ws, err := h.store.GetWorkspace(c.Request.Context(), id)
		if err != nil {
			h.logger.Error("failed to get workspace for deletion", "id", id, "error", err)
			c.JSON(http.StatusInternalServerError, api.MessageResponse{
				Error: errorResponse(err),
			})
			return
		}

		if ws == nil {
			c.JSON(http.StatusNotFound, api.MessageResponse{
				Error: errorResponse(fmt.Errorf("workspace not found: %s", id)),
			})
			return
		}

		// Delete from Kubernetes first
		if err := h.orchestrator.DeleteWorkspace(c.Request.Context(), ws); err != nil {
			h.logger.Error("failed to delete workspace from k8s", "id", id, "error", err)
			// Continue to delete from database anyway
		}

		// Delete secrets
		if err := h.store.DeleteSecrets(c.Request.Context(), id); err != nil {
			h.logger.Warn("failed to delete workspace secrets", "id", id, "error", err)
		}

		// Delete from database
		if err := h.store.DeleteWorkspace(c.Request.Context(), id); err != nil {
			h.logger.Error("failed to delete workspace from store", "id", id, "error", err)
			c.JSON(http.StatusInternalServerError, api.MessageResponse{
				Error: errorResponse(err),
			})
			return
		}

		c.JSON(http.StatusOK, api.MessageResponse{
			Message: fmt.Sprintf("Workspace %s deleted", id),
			Error:   nil,
		})
	}
}

// StartWorkspace handles POST /api/v1/workspaces/:id/start
func (h *WorkspaceHandlers) StartWorkspace() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		ws, err := h.store.GetWorkspace(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, api.WorkspaceResponse{Error: errorResponse(err)})
			return
		}
		if ws == nil {
			c.JSON(http.StatusNotFound, api.WorkspaceResponse{
				Error: errorResponse(fmt.Errorf("workspace not found: %s", id)),
			})
			return
		}

		// Start via orchestrator
		if err := h.orchestrator.StartWorkspace(c.Request.Context(), ws); err != nil {
			h.logger.Error("failed to start workspace", "id", id, "error", err)
			c.JSON(http.StatusInternalServerError, api.WorkspaceResponse{
				Error: errorResponse(fmt.Errorf("failed to start: %w", err)),
			})
			return
		}

		// Update status
		ws.Status = store.StatusRunning
		h.store.UpdateWorkspace(c.Request.Context(), ws)
		h.store.LogEvent(c.Request.Context(), &store.WorkspaceEvent{
			WorkspaceID: id,
			EventType:   "started",
			Message:     "Workspace started",
		})

		c.JSON(http.StatusOK, api.WorkspaceResponse{
			Data:  api.ToDTO(ws),
			Error: nil,
		})
	}
}

// StopWorkspace handles POST /api/v1/workspaces/:id/stop
func (h *WorkspaceHandlers) StopWorkspace() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		ws, err := h.store.GetWorkspace(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, api.WorkspaceResponse{Error: errorResponse(err)})
			return
		}
		if ws == nil {
			c.JSON(http.StatusNotFound, api.WorkspaceResponse{
				Error: errorResponse(fmt.Errorf("workspace not found: %s", id)),
			})
			return
		}

		// Stop via orchestrator
		if err := h.orchestrator.StopWorkspace(c.Request.Context(), ws); err != nil {
			h.logger.Error("failed to stop workspace", "id", id, "error", err)
			c.JSON(http.StatusInternalServerError, api.WorkspaceResponse{
				Error: errorResponse(fmt.Errorf("failed to stop: %w", err)),
			})
			return
		}

		// Update status
		ws.Status = store.StatusStopped
		h.store.UpdateWorkspace(c.Request.Context(), ws)
		h.store.LogEvent(c.Request.Context(), &store.WorkspaceEvent{
			WorkspaceID: id,
			EventType:   "stopped",
			Message:     "Workspace stopped",
		})

		c.JSON(http.StatusOK, api.WorkspaceResponse{
			Data:  api.ToDTO(ws),
			Error: nil,
		})
	}
}

// GetEvents handles GET /api/v1/workspaces/:id/events
func (h *WorkspaceHandlers) GetEvents() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		// Default limit to 50
		limit := 50
		if l := c.Query("limit"); l != "" {
			fmt.Sscanf(l, "%d", &limit)
		}

		events, err := h.store.GetEvents(c.Request.Context(), id, limit)
		if err != nil {
			h.logger.Error("failed to get events", "id", id, "error", err)
			c.JSON(http.StatusInternalServerError, api.EventListResponse{
				Error: errorResponse(err),
			})
			return
		}

		c.JSON(http.StatusOK, api.EventListResponse{
			Data:  events,
			Error: nil,
		})
	}
}

func defaultString(val, def string) string {
	if val == "" {
		return def
	}
	return val
}
