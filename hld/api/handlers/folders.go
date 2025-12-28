package handlers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/humanlayer/humanlayer/hld/api"
	"github.com/humanlayer/humanlayer/hld/store"
)

const (
	MaxFolderDepth = 3 // Maximum nesting depth for folders
)

type FolderHandlers struct {
	store store.ConversationStore
}

func NewFolderHandlers(store store.ConversationStore) *FolderHandlers {
	return &FolderHandlers{store: store}
}

// ListFolders returns all folders with session counts
func (h *FolderHandlers) ListFolders(ctx context.Context, req api.ListFoldersRequestObject) (api.ListFoldersResponseObject, error) {
	includeArchived := false
	if req.Params.IncludeArchived != nil {
		includeArchived = *req.Params.IncludeArchived
	}

	folders, err := h.store.ListFolders(ctx, includeArchived)
	if err != nil {
		slog.Error("failed to list folders", "error", err)
		return api.ListFolders500JSONResponse{
			InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-5001",
					Message: "Failed to list folders",
				},
			},
		}, nil
	}

	apiFolders := make([]api.Folder, len(folders))
	for i, f := range folders {
		apiFolders[i] = folderToAPI(f)
	}

	return api.ListFolders200JSONResponse{
		Data: apiFolders,
	}, nil
}

// CreateFolder creates a new folder
func (h *FolderHandlers) CreateFolder(ctx context.Context, req api.CreateFolderRequestObject) (api.CreateFolderResponseObject, error) {
	// Validate name length
	if len(req.Body.Name) < 1 || len(req.Body.Name) > 100 {
		return api.CreateFolder400JSONResponse{
			Error: api.ErrorDetail{
				Code:    "HLD-4001",
				Message: "Folder name must be between 1 and 100 characters",
			},
		}, nil
	}

	// Check depth constraint if parent_id is specified
	if req.Body.ParentId != nil {
		parentDepth, err := h.store.GetFolderDepth(ctx, *req.Body.ParentId)
		if err != nil {
			slog.Error("failed to get parent folder depth", "error", err)
			return api.CreateFolder500JSONResponse{
				InternalErrorJSONResponse: api.InternalErrorJSONResponse{
					Error: api.ErrorDetail{
						Code:    "HLD-5002",
						Message: "Failed to validate folder depth",
					},
				},
			}, nil
		}
		if parentDepth >= MaxFolderDepth {
			return api.CreateFolder400JSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4002",
					Message: fmt.Sprintf("Maximum folder nesting depth is %d levels", MaxFolderDepth),
				},
			}, nil
		}
	}

	now := time.Now()
	folder := &store.Folder{
		ID:        "folder_" + uuid.New().String()[:8],
		Name:      req.Body.Name,
		ParentID:  req.Body.ParentId,
		Position:  0,
		Archived:  false,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := h.store.CreateFolder(ctx, folder); err != nil {
		slog.Error("failed to create folder", "error", err)
		return api.CreateFolder500JSONResponse{
			InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-5003",
					Message: "Failed to create folder",
				},
			},
		}, nil
	}

	return api.CreateFolder201JSONResponse{
		Data: folderToAPI(folder),
	}, nil
}

// GetFolder returns a single folder by ID
func (h *FolderHandlers) GetFolder(ctx context.Context, req api.GetFolderRequestObject) (api.GetFolderResponseObject, error) {
	folder, err := h.store.GetFolder(ctx, req.Id)
	if err != nil {
		slog.Error("failed to get folder", "error", err)
		return api.GetFolder500JSONResponse{
			InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-5004",
					Message: "Failed to get folder",
				},
			},
		}, nil
	}

	if folder == nil {
		return api.GetFolder404JSONResponse{
			NotFoundJSONResponse: api.NotFoundJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4003",
					Message: "Folder not found",
				},
			},
		}, nil
	}

	return api.GetFolder200JSONResponse{
		Data: folderToAPI(folder),
	}, nil
}

// UpdateFolder updates folder properties
func (h *FolderHandlers) UpdateFolder(ctx context.Context, req api.UpdateFolderRequestObject) (api.UpdateFolderResponseObject, error) {
	// Check if folder exists
	existing, err := h.store.GetFolder(ctx, req.Id)
	if err != nil {
		slog.Error("failed to get folder for update", "error", err)
		return api.UpdateFolder500JSONResponse{
			InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-5005",
					Message: "Failed to get folder",
				},
			},
		}, nil
	}
	if existing == nil {
		return api.UpdateFolder404JSONResponse{
			NotFoundJSONResponse: api.NotFoundJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4003",
					Message: "Folder not found",
				},
			},
		}, nil
	}

	// Validate name if provided
	if req.Body.Name != nil {
		if len(*req.Body.Name) < 1 || len(*req.Body.Name) > 100 {
			return api.UpdateFolder400JSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4001",
					Message: "Folder name must be between 1 and 100 characters",
				},
			}, nil
		}
	}

	// Validate depth if parent_id is changing
	if req.Body.ParentId != nil && *req.Body.ParentId != "" {
		newParentID := *req.Body.ParentId

		// Check 1: Direct self-reference
		if newParentID == req.Id {
			return api.UpdateFolder400JSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4004",
					Message: "Folder cannot be its own parent",
				},
			}, nil
		}

		// Check 2: Circular reference - is new parent a descendant of this folder?
		isDescendant, err := h.store.IsDescendant(ctx, req.Id, newParentID)
		if err != nil {
			slog.Error("failed to check descendant relationship", "error", err)
			return api.UpdateFolder500JSONResponse{
				InternalErrorJSONResponse: api.InternalErrorJSONResponse{
					Error: api.ErrorDetail{
						Code:    "HLD-5002",
						Message: "Failed to validate folder hierarchy",
					},
				},
			}, nil
		}
		if isDescendant {
			return api.UpdateFolder400JSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4004",
					Message: "Cannot move folder under one of its descendants",
				},
			}, nil
		}

		// Check 3: Depth constraint - would this folder's subtree exceed max depth?
		parentDepth, err := h.store.GetFolderDepth(ctx, newParentID)
		if err != nil {
			slog.Error("failed to get parent folder depth", "error", err)
			return api.UpdateFolder500JSONResponse{
				InternalErrorJSONResponse: api.InternalErrorJSONResponse{
					Error: api.ErrorDetail{
						Code:    "HLD-5002",
						Message: "Failed to validate folder depth",
					},
				},
			}, nil
		}

		subtreeDepth, err := h.store.GetSubtreeMaxDepth(ctx, req.Id)
		if err != nil {
			slog.Error("failed to get subtree depth", "error", err)
			return api.UpdateFolder500JSONResponse{
				InternalErrorJSONResponse: api.InternalErrorJSONResponse{
					Error: api.ErrorDetail{
						Code:    "HLD-5002",
						Message: "Failed to validate folder depth",
					},
				},
			}, nil
		}

		// New depth = parent depth + 1 (for this folder) + subtree depth
		newMaxDepth := parentDepth + 1 + subtreeDepth
		if newMaxDepth > MaxFolderDepth {
			return api.UpdateFolder400JSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4002",
					Message: fmt.Sprintf("Moving this folder would exceed maximum nesting depth of %d levels", MaxFolderDepth),
				},
			}, nil
		}
	}

	// Build update struct
	updates := store.FolderUpdate{}
	if req.Body.Name != nil {
		updates.Name = req.Body.Name
	}
	if req.Body.ParentId != nil {
		if *req.Body.ParentId == "" {
			// Empty string means move to root (null parent)
			var nilPtr *string = nil
			updates.ParentID = &nilPtr
		} else {
			updates.ParentID = &req.Body.ParentId
		}
	}
	if req.Body.Position != nil {
		updates.Position = req.Body.Position
	}
	if req.Body.Archived != nil {
		updates.Archived = req.Body.Archived
		// If archiving, cascade to sessions
		if *req.Body.Archived {
			if err := h.store.ArchiveFolderCascade(ctx, req.Id); err != nil {
				slog.Error("failed to cascade archive folder", "error", err)
				return api.UpdateFolder500JSONResponse{
					InternalErrorJSONResponse: api.InternalErrorJSONResponse{
						Error: api.ErrorDetail{
							Code:    "HLD-5006",
							Message: "Failed to archive folder",
						},
					},
				}, nil
			}
			// Return the updated folder
			updated, _ := h.store.GetFolder(ctx, req.Id)
			if updated != nil {
				return api.UpdateFolder200JSONResponse{
					Data: folderToAPI(updated),
				}, nil
			}
		}
	}

	if err := h.store.UpdateFolder(ctx, req.Id, updates); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return api.UpdateFolder404JSONResponse{
				NotFoundJSONResponse: api.NotFoundJSONResponse{
					Error: api.ErrorDetail{
						Code:    "HLD-4003",
						Message: "Folder not found",
					},
				},
			}, nil
		}
		slog.Error("failed to update folder", "error", err)
		return api.UpdateFolder500JSONResponse{
			InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-5007",
					Message: "Failed to update folder",
				},
			},
		}, nil
	}

	// Return the updated folder
	updated, err := h.store.GetFolder(ctx, req.Id)
	if err != nil {
		slog.Error("failed to get updated folder", "error", err)
		return api.UpdateFolder500JSONResponse{
			InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-5008",
					Message: "Failed to get updated folder",
				},
			},
		}, nil
	}

	return api.UpdateFolder200JSONResponse{
		Data: folderToAPI(updated),
	}, nil
}

// BulkMoveSessions moves multiple sessions to a folder
func (h *FolderHandlers) BulkMoveSessions(ctx context.Context, req api.BulkMoveSessionsRequestObject) (api.BulkMoveSessionsResponseObject, error) {
	if len(req.Body.SessionIds) == 0 {
		return api.BulkMoveSessions400JSONResponse{
			BadRequestJSONResponse: api.BadRequestJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4005",
					Message: "At least one session ID is required",
				},
			},
		}, nil
	}

	// Validate folder exists if specified
	if req.Body.FolderId != nil && *req.Body.FolderId != "" {
		folder, err := h.store.GetFolder(ctx, *req.Body.FolderId)
		if err != nil {
			slog.Error("failed to validate folder", "error", err)
			return api.BulkMoveSessions500JSONResponse{
				InternalErrorJSONResponse: api.InternalErrorJSONResponse{
					Error: api.ErrorDetail{
						Code:    "HLD-5009",
						Message: "Failed to validate folder",
					},
				},
			}, nil
		}
		if folder == nil {
			return api.BulkMoveSessions400JSONResponse{
				BadRequestJSONResponse: api.BadRequestJSONResponse{
					Error: api.ErrorDetail{
						Code:    "HLD-4006",
						Message: "Target folder not found",
					},
				},
			}, nil
		}
	}

	var failedSessions []string
	for _, sessionID := range req.Body.SessionIds {
		updates := store.SessionUpdate{}
		if req.Body.FolderId != nil {
			if *req.Body.FolderId == "" {
				// Empty string means remove from folder
				var nilPtr *string = nil
				updates.FolderID = &nilPtr
			} else {
				updates.FolderID = &req.Body.FolderId
			}
		} else {
			// null means remove from folder
			var nilPtr *string = nil
			updates.FolderID = &nilPtr
		}

		if err := h.store.UpdateSession(ctx, sessionID, updates); err != nil {
			slog.Error("failed to move session", "session_id", sessionID, "error", err)
			failedSessions = append(failedSessions, sessionID)
		}
	}

	success := len(failedSessions) == 0
	response := api.BulkMoveSessionsResponse{
		Data: struct {
			FailedSessions *[]string `json:"failed_sessions,omitempty"`
			Success        bool      `json:"success"`
		}{
			Success:        success,
			FailedSessions: &failedSessions,
		},
	}

	if len(failedSessions) > 0 && len(failedSessions) < len(req.Body.SessionIds) {
		// Partial success
		return api.BulkMoveSessions207JSONResponse(response), nil
	}

	return api.BulkMoveSessions200JSONResponse(response), nil
}

// folderToAPI converts a store.Folder to an api.Folder
func folderToAPI(f *store.Folder) api.Folder {
	apiFolder := api.Folder{
		Id:           f.ID,
		Name:         f.Name,
		ParentId:     f.ParentID,
		Position:     &f.Position,
		Archived:     &f.Archived,
		SessionCount: &f.SessionCount,
		CreatedAt:    f.CreatedAt,
		UpdatedAt:    f.UpdatedAt,
	}
	return apiFolder
}
