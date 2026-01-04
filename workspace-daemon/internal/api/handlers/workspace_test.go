package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/api"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/orchestrator"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
)

// MockStore implements store.Store for testing
type MockStore struct {
	workspaces map[string]*store.Workspace
	secrets    map[string][]*store.WorkspaceSecret
	events     map[string][]*store.WorkspaceEvent
}

func NewMockStore() *MockStore {
	return &MockStore{
		workspaces: make(map[string]*store.Workspace),
		secrets:    make(map[string][]*store.WorkspaceSecret),
		events:     make(map[string][]*store.WorkspaceEvent),
	}
}

func (m *MockStore) CreateWorkspace(ctx context.Context, ws *store.Workspace) error {
	m.workspaces[ws.ID] = ws
	return nil
}

func (m *MockStore) GetWorkspace(ctx context.Context, id string) (*store.Workspace, error) {
	return m.workspaces[id], nil
}

func (m *MockStore) ListWorkspaces(ctx context.Context) ([]*store.Workspace, error) {
	result := make([]*store.Workspace, 0, len(m.workspaces))
	for _, ws := range m.workspaces {
		result = append(result, ws)
	}
	return result, nil
}

func (m *MockStore) UpdateWorkspace(ctx context.Context, ws *store.Workspace) error {
	m.workspaces[ws.ID] = ws
	return nil
}

func (m *MockStore) DeleteWorkspace(ctx context.Context, id string) error {
	delete(m.workspaces, id)
	return nil
}

func (m *MockStore) SetSecret(ctx context.Context, s *store.WorkspaceSecret) error {
	m.secrets[s.WorkspaceID] = append(m.secrets[s.WorkspaceID], s)
	return nil
}

func (m *MockStore) GetSecret(ctx context.Context, workspaceID, key string) (string, error) {
	for _, s := range m.secrets[workspaceID] {
		if s.Key == key {
			return s.Value, nil
		}
	}
	return "", nil
}

func (m *MockStore) GetSecrets(ctx context.Context, workspaceID string) ([]*store.WorkspaceSecret, error) {
	return m.secrets[workspaceID], nil
}

func (m *MockStore) DeleteSecrets(ctx context.Context, workspaceID string) error {
	delete(m.secrets, workspaceID)
	return nil
}

func (m *MockStore) LogEvent(ctx context.Context, e *store.WorkspaceEvent) error {
	m.events[e.WorkspaceID] = append(m.events[e.WorkspaceID], e)
	return nil
}

func (m *MockStore) GetEvents(ctx context.Context, workspaceID string, limit int) ([]*store.WorkspaceEvent, error) {
	events := m.events[workspaceID]
	if len(events) > limit {
		events = events[:limit]
	}
	return events, nil
}

func (m *MockStore) Close() error { return nil }

// MockOrchestrator implements orchestrator.Orchestrator for testing
type MockOrchestrator struct {
	deployError error
}

func (m *MockOrchestrator) DeployWorkspace(ctx context.Context, ws *store.Workspace, secrets []*store.WorkspaceSecret) error {
	return m.deployError
}

func (m *MockOrchestrator) StopWorkspace(ctx context.Context, ws *store.Workspace) error {
	return nil
}

func (m *MockOrchestrator) StartWorkspace(ctx context.Context, ws *store.Workspace) error {
	return nil
}

func (m *MockOrchestrator) DeleteWorkspace(ctx context.Context, ws *store.Workspace) error {
	return nil
}

func (m *MockOrchestrator) GetWorkspaceStatus(ctx context.Context, ws *store.Workspace) (*orchestrator.WorkspaceStatus, error) {
	return &orchestrator.WorkspaceStatus{
		Phase: "Running",
		Ready: true,
	}, nil
}

func setupTestRouter(h *WorkspaceHandlers) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	apiGroup := r.Group("/api/v1")
	{
		apiGroup.GET("/workspaces", h.ListWorkspaces())
		apiGroup.POST("/workspaces", h.CreateWorkspace())
		apiGroup.GET("/workspaces/:id", h.GetWorkspace())
		apiGroup.DELETE("/workspaces/:id", h.DeleteWorkspace())
		apiGroup.POST("/workspaces/:id/start", h.StartWorkspace())
		apiGroup.POST("/workspaces/:id/stop", h.StopWorkspace())
		apiGroup.GET("/workspaces/:id/events", h.GetEvents())
	}
	return r
}

func TestListWorkspaces_Empty(t *testing.T) {
	mockStore := NewMockStore()
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	req := httptest.NewRequest("GET", "/api/v1/workspaces", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp api.WorkspaceListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Error != nil {
		t.Errorf("expected no error, got %s", *resp.Error)
	}
	if len(resp.Data) != 0 {
		t.Errorf("expected empty list, got %d items", len(resp.Data))
	}
}

func TestListWorkspaces_WithData(t *testing.T) {
	mockStore := NewMockStore()
	mockStore.workspaces["test-1"] = &store.Workspace{
		ID:     "test-1",
		Name:   "Test Workspace",
		Status: store.StatusRunning,
	}
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	req := httptest.NewRequest("GET", "/api/v1/workspaces", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp api.WorkspaceListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Error != nil {
		t.Errorf("expected no error, got %s", *resp.Error)
	}
	if len(resp.Data) != 1 {
		t.Errorf("expected 1 workspace, got %d", len(resp.Data))
	}
	if resp.Data[0].Name != "Test Workspace" {
		t.Errorf("expected name 'Test Workspace', got '%s'", resp.Data[0].Name)
	}
}

func TestCreateWorkspace_Success(t *testing.T) {
	mockStore := NewMockStore()
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	reqBody := api.CreateWorkspaceRequest{Name: "test-workspace"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/v1/workspaces", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp api.WorkspaceResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Error != nil {
		t.Errorf("expected no error, got %s", *resp.Error)
	}
	if resp.Data.Name != "test-workspace" {
		t.Errorf("expected name 'test-workspace', got '%s'", resp.Data.Name)
	}
	if resp.Data.Status != "running" {
		t.Errorf("expected status 'running', got '%s'", resp.Data.Status)
	}
}

func TestCreateWorkspace_MissingName(t *testing.T) {
	mockStore := NewMockStore()
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	reqBody := api.CreateWorkspaceRequest{} // Missing name
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/v1/workspaces", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestGetWorkspace_Found(t *testing.T) {
	mockStore := NewMockStore()
	mockStore.workspaces["test-1"] = &store.Workspace{
		ID:     "test-1",
		Name:   "Test Workspace",
		Status: store.StatusRunning,
	}
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	req := httptest.NewRequest("GET", "/api/v1/workspaces/test-1", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp api.WorkspaceResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Error != nil {
		t.Errorf("expected no error, got %s", *resp.Error)
	}
	if resp.Data.ID != "test-1" {
		t.Errorf("expected id 'test-1', got '%s'", resp.Data.ID)
	}
	// Check deployment status is populated
	if resp.Data.DeploymentStatus == nil {
		t.Error("expected deployment status to be populated")
	}
}

func TestGetWorkspace_NotFound(t *testing.T) {
	mockStore := NewMockStore()
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	req := httptest.NewRequest("GET", "/api/v1/workspaces/nonexistent", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestDeleteWorkspace_Success(t *testing.T) {
	mockStore := NewMockStore()
	mockStore.workspaces["test-1"] = &store.Workspace{
		ID:     "test-1",
		Name:   "Test Workspace",
		Status: store.StatusRunning,
	}
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	req := httptest.NewRequest("DELETE", "/api/v1/workspaces/test-1", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp api.MessageResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Error != nil {
		t.Errorf("expected no error, got %s", *resp.Error)
	}

	// Verify workspace was deleted
	if _, exists := mockStore.workspaces["test-1"]; exists {
		t.Error("expected workspace to be deleted from store")
	}
}

func TestStartWorkspace_Success(t *testing.T) {
	mockStore := NewMockStore()
	mockStore.workspaces["test-1"] = &store.Workspace{
		ID:     "test-1",
		Name:   "Test Workspace",
		Status: store.StatusStopped,
	}
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	req := httptest.NewRequest("POST", "/api/v1/workspaces/test-1/start", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp api.WorkspaceResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Error != nil {
		t.Errorf("expected no error, got %s", *resp.Error)
	}
	if resp.Data.Status != "running" {
		t.Errorf("expected status 'running', got '%s'", resp.Data.Status)
	}
}

func TestStopWorkspace_Success(t *testing.T) {
	mockStore := NewMockStore()
	mockStore.workspaces["test-1"] = &store.Workspace{
		ID:     "test-1",
		Name:   "Test Workspace",
		Status: store.StatusRunning,
	}
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	req := httptest.NewRequest("POST", "/api/v1/workspaces/test-1/stop", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp api.WorkspaceResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Error != nil {
		t.Errorf("expected no error, got %s", *resp.Error)
	}
	if resp.Data.Status != "stopped" {
		t.Errorf("expected status 'stopped', got '%s'", resp.Data.Status)
	}
}

func TestGetEvents_Empty(t *testing.T) {
	mockStore := NewMockStore()
	mockStore.workspaces["test-1"] = &store.Workspace{
		ID:   "test-1",
		Name: "Test Workspace",
	}
	mockOrch := &MockOrchestrator{}
	handlers := NewWorkspaceHandlers(mockStore, mockOrch, slog.Default())
	router := setupTestRouter(handlers)

	req := httptest.NewRequest("GET", "/api/v1/workspaces/test-1/events", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp api.EventListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Error != nil {
		t.Errorf("expected no error, got %s", *resp.Error)
	}
	if len(resp.Data) != 0 {
		t.Errorf("expected empty events list, got %d", len(resp.Data))
	}
}
