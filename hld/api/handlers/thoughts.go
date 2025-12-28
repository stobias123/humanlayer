package handlers

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"log/slog"

	"github.com/humanlayer/humanlayer/hld/api"
	"gopkg.in/yaml.v3"
)

type ThoughtHandlers struct{}

func NewThoughtHandlers() *ThoughtHandlers {
	return &ThoughtHandlers{}
}

type ThoughtFrontmatter struct {
	Date        string   `yaml:"date"`
	Topic       string   `yaml:"topic"`
	Status      string   `yaml:"status"`
	Tags        []string `yaml:"tags"`
	Researcher  string   `yaml:"researcher"`
	LastUpdated string   `yaml:"last_updated"`
}

func (h *ThoughtHandlers) ListThoughts(ctx context.Context, req api.ListThoughtsRequestObject) (api.ListThoughtsResponseObject, error) {
	if req.Params.WorkingDir == "" {
		return api.ListThoughts500JSONResponse{
			InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4001",
					Message: "workingDir parameter is required",
				},
			},
		}, nil
	}

	thoughtsDir := filepath.Join(expandTilde(req.Params.WorkingDir), "thoughts", "shared")

	// Determine which subdirs to scan
	subdirs := []string{"research", "plans", "tickets", "handoffs"}
	if req.Params.Type != nil && *req.Params.Type != api.ListThoughtsParamsTypeAll {
		switch *req.Params.Type {
		case api.ListThoughtsParamsTypeResearch:
			subdirs = []string{"research"}
		case api.ListThoughtsParamsTypePlans:
			subdirs = []string{"plans"}
		}
	}

	thoughts := []api.Thought{}

	for _, subdir := range subdirs {
		dir := filepath.Join(thoughtsDir, subdir)
		entries, err := os.ReadDir(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue // Directory may not exist
			}
			slog.Warn("failed to read thoughts directory", "dir", dir, "error", err)
			continue
		}

		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".md" {
				continue
			}

			filePath := filepath.Join(dir, entry.Name())
			content, err := os.ReadFile(filePath)
			if err != nil {
				slog.Warn("failed to read thought file", "path", filePath, "error", err)
				continue
			}

			frontmatter := extractThoughtFrontmatter(content)
			thoughtType := determineThoughtType(subdir)

			thought := api.Thought{
				Path:     filepath.Join("shared", subdir, entry.Name()),
				Filename: entry.Name(),
				Type:     thoughtType,
			}

			if frontmatter != nil {
				thought.Frontmatter = &api.ThoughtFrontmatter{
					Date:        &frontmatter.Date,
					Topic:       &frontmatter.Topic,
					Researcher:  &frontmatter.Researcher,
					LastUpdated: &frontmatter.LastUpdated,
				}
				if frontmatter.Status != "" {
					status := api.ThoughtFrontmatterStatus(frontmatter.Status)
					thought.Frontmatter.Status = &status
				}
				if len(frontmatter.Tags) > 0 {
					thought.Frontmatter.Tags = &frontmatter.Tags
				}
			}

			thoughts = append(thoughts, thought)
		}
	}

	// Sort by date descending (newest first)
	sort.Slice(thoughts, func(i, j int) bool {
		dateI := ""
		dateJ := ""
		if thoughts[i].Frontmatter != nil && thoughts[i].Frontmatter.Date != nil {
			dateI = *thoughts[i].Frontmatter.Date
		}
		if thoughts[j].Frontmatter != nil && thoughts[j].Frontmatter.Date != nil {
			dateJ = *thoughts[j].Frontmatter.Date
		}
		return dateI > dateJ
	})

	return api.ListThoughts200JSONResponse{
		Data: thoughts,
	}, nil
}

func (h *ThoughtHandlers) GetThought(ctx context.Context, req api.GetThoughtRequestObject) (api.GetThoughtResponseObject, error) {
	if req.Params.WorkingDir == "" {
		return api.GetThought400JSONResponse{
			BadRequestJSONResponse: api.BadRequestJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4001",
					Message: "workingDir parameter is required",
				},
			},
		}, nil
	}

	if req.Params.Path == "" {
		return api.GetThought400JSONResponse{
			BadRequestJSONResponse: api.BadRequestJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4001",
					Message: "path parameter is required",
				},
			},
		}, nil
	}

	// Security: validate path doesn't escape thoughts directory
	cleanPath := filepath.Clean(req.Params.Path)
	if strings.HasPrefix(cleanPath, "..") || strings.HasPrefix(cleanPath, "/") {
		return api.GetThought400JSONResponse{
			BadRequestJSONResponse: api.BadRequestJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4002",
					Message: "Invalid path",
				},
			},
		}, nil
	}

	filePath := filepath.Join(expandTilde(req.Params.WorkingDir), "thoughts", cleanPath)

	// Verify path is within thoughts directory
	thoughtsBase := filepath.Join(expandTilde(req.Params.WorkingDir), "thoughts")
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(thoughtsBase)) {
		return api.GetThought400JSONResponse{
			BadRequestJSONResponse: api.BadRequestJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-4002",
					Message: "Invalid path",
				},
			},
		}, nil
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return api.GetThought404JSONResponse{
				NotFoundJSONResponse: api.NotFoundJSONResponse{
					Error: api.ErrorDetail{
						Code:    "HLD-4040",
						Message: "Thought file not found",
					},
				},
			}, nil
		}
		slog.Error("failed to read thought file", "path", filePath, "error", err)
		return api.GetThought500JSONResponse{
			InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Error: api.ErrorDetail{
					Code:    "HLD-5001",
					Message: "Failed to read thought file",
				},
			},
		}, nil
	}

	frontmatter := extractThoughtFrontmatter(content)
	thoughtType := determineThoughtTypeFromPath(cleanPath)
	contentStr := string(content)

	thought := api.Thought{
		Path:     cleanPath,
		Filename: filepath.Base(cleanPath),
		Type:     thoughtType,
		Content:  &contentStr,
	}

	if frontmatter != nil {
		thought.Frontmatter = &api.ThoughtFrontmatter{
			Date:        &frontmatter.Date,
			Topic:       &frontmatter.Topic,
			Researcher:  &frontmatter.Researcher,
			LastUpdated: &frontmatter.LastUpdated,
		}
		if frontmatter.Status != "" {
			status := api.ThoughtFrontmatterStatus(frontmatter.Status)
			thought.Frontmatter.Status = &status
		}
		if len(frontmatter.Tags) > 0 {
			thought.Frontmatter.Tags = &frontmatter.Tags
		}
	}

	return api.GetThought200JSONResponse{
		Data: thought,
	}, nil
}

func extractThoughtFrontmatter(content []byte) *ThoughtFrontmatter {
	re := regexp.MustCompile(`(?s)^---\n(.+?)\n---`)
	matches := re.FindSubmatch(content)
	if len(matches) < 2 {
		return nil
	}

	var fm ThoughtFrontmatter
	if err := yaml.Unmarshal(matches[1], &fm); err != nil {
		slog.Warn("failed to parse thought frontmatter", "error", err)
		return nil
	}
	return &fm
}

func determineThoughtType(subdir string) api.ThoughtType {
	switch subdir {
	case "research":
		return api.ThoughtTypeResearch
	case "plans":
		return api.ThoughtTypePlan
	case "tickets":
		return api.ThoughtTypeTicket
	case "handoffs":
		return api.ThoughtTypeHandoff
	default:
		return api.ThoughtTypeOther
	}
}

func determineThoughtTypeFromPath(path string) api.ThoughtType {
	if strings.Contains(path, "/research/") || strings.HasPrefix(path, "shared/research/") {
		return api.ThoughtTypeResearch
	} else if strings.Contains(path, "/plans/") || strings.HasPrefix(path, "shared/plans/") {
		return api.ThoughtTypePlan
	} else if strings.Contains(path, "/tickets/") || strings.HasPrefix(path, "shared/tickets/") {
		return api.ThoughtTypeTicket
	} else if strings.Contains(path, "/handoffs/") || strings.HasPrefix(path, "shared/handoffs/") {
		return api.ThoughtTypeHandoff
	}
	return api.ThoughtTypeOther
}
