package store

import (
	"context"
	"os"
	"testing"
	"time"
)

func setupTestStore(t *testing.T) (*SQLiteStore, func()) {
	t.Helper()

	tmpFile, err := os.CreateTemp("", "workspace-test-*.db")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	tmpFile.Close()

	store, err := NewSQLiteStore(tmpFile.Name())
	if err != nil {
		os.Remove(tmpFile.Name())
		t.Fatalf("failed to create store: %v", err)
	}

	cleanup := func() {
		store.Close()
		os.Remove(tmpFile.Name())
	}

	return store, cleanup
}

func TestWorkspaceCRUD(t *testing.T) {
	store, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create
	ws := &Workspace{
		ID:              "test-ws-1",
		Name:            "Test Workspace",
		Status:          StatusPending,
		DockerImage:     "hld",
		DockerImageTag:  "latest",
		HelmReleaseName: "ws-test-ws-1",
		Namespace:       "ws-test-ws-1",
		CPURequest:      "100m",
		MemoryRequest:   "256Mi",
		GitEnabled:      true,
		GitUserName:     "Test User",
		GitUserEmail:    "test@example.com",
	}

	err := store.CreateWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("CreateWorkspace failed: %v", err)
	}

	// Read
	retrieved, err := store.GetWorkspace(ctx, "test-ws-1")
	if err != nil {
		t.Fatalf("GetWorkspace failed: %v", err)
	}

	if retrieved.Name != ws.Name {
		t.Errorf("expected name %q, got %q", ws.Name, retrieved.Name)
	}
	if retrieved.Status != StatusPending {
		t.Errorf("expected status %q, got %q", StatusPending, retrieved.Status)
	}
	if !retrieved.GitEnabled {
		t.Error("expected GitEnabled to be true")
	}

	// Update
	retrieved.Status = StatusRunning
	retrieved.IngressHost = "test.workspaces.local"
	err = store.UpdateWorkspace(ctx, retrieved)
	if err != nil {
		t.Fatalf("UpdateWorkspace failed: %v", err)
	}

	updated, err := store.GetWorkspace(ctx, "test-ws-1")
	if err != nil {
		t.Fatalf("GetWorkspace after update failed: %v", err)
	}
	if updated.Status != StatusRunning {
		t.Errorf("expected status %q, got %q", StatusRunning, updated.Status)
	}
	if updated.IngressHost != "test.workspaces.local" {
		t.Errorf("expected ingress host %q, got %q", "test.workspaces.local", updated.IngressHost)
	}

	// List
	workspaces, err := store.ListWorkspaces(ctx)
	if err != nil {
		t.Fatalf("ListWorkspaces failed: %v", err)
	}
	if len(workspaces) != 1 {
		t.Errorf("expected 1 workspace, got %d", len(workspaces))
	}

	// Delete
	err = store.DeleteWorkspace(ctx, "test-ws-1")
	if err != nil {
		t.Fatalf("DeleteWorkspace failed: %v", err)
	}

	_, err = store.GetWorkspace(ctx, "test-ws-1")
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}

func TestSecretsCRUD(t *testing.T) {
	store, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create workspace first
	ws := &Workspace{
		ID:              "test-ws-secrets",
		Name:            "Secrets Test",
		Status:          StatusPending,
		DockerImage:     "hld",
		DockerImageTag:  "latest",
		HelmReleaseName: "ws-test",
		Namespace:       "ws-test",
	}
	err := store.CreateWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("CreateWorkspace failed: %v", err)
	}

	// Set secrets
	secrets := []*WorkspaceSecret{
		{WorkspaceID: ws.ID, Key: "humanlayer_api_key", Value: "hl_test_key"},
		{WorkspaceID: ws.ID, Key: "gh_token", Value: "ghp_test_token"},
	}

	for _, secret := range secrets {
		err := store.SetSecret(ctx, secret)
		if err != nil {
			t.Fatalf("SetSecret failed: %v", err)
		}
	}

	// Get single secret
	value, err := store.GetSecret(ctx, ws.ID, "humanlayer_api_key")
	if err != nil {
		t.Fatalf("GetSecret failed: %v", err)
	}
	if value != "hl_test_key" {
		t.Errorf("expected %q, got %q", "hl_test_key", value)
	}

	// Get all secrets
	allSecrets, err := store.GetSecrets(ctx, ws.ID)
	if err != nil {
		t.Fatalf("GetSecrets failed: %v", err)
	}
	if len(allSecrets) != 2 {
		t.Errorf("expected 2 secrets, got %d", len(allSecrets))
	}

	// Update secret (upsert)
	err = store.SetSecret(ctx, &WorkspaceSecret{
		WorkspaceID: ws.ID,
		Key:         "humanlayer_api_key",
		Value:       "hl_new_key",
	})
	if err != nil {
		t.Fatalf("SetSecret update failed: %v", err)
	}

	updatedValue, err := store.GetSecret(ctx, ws.ID, "humanlayer_api_key")
	if err != nil {
		t.Fatalf("GetSecret after update failed: %v", err)
	}
	if updatedValue != "hl_new_key" {
		t.Errorf("expected %q, got %q", "hl_new_key", updatedValue)
	}

	// Delete secrets
	err = store.DeleteSecrets(ctx, ws.ID)
	if err != nil {
		t.Fatalf("DeleteSecrets failed: %v", err)
	}

	remainingSecrets, err := store.GetSecrets(ctx, ws.ID)
	if err != nil {
		t.Fatalf("GetSecrets after delete failed: %v", err)
	}
	if len(remainingSecrets) != 0 {
		t.Errorf("expected 0 secrets, got %d", len(remainingSecrets))
	}
}

func TestEventsCRUD(t *testing.T) {
	store, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create workspace first
	ws := &Workspace{
		ID:              "test-ws-events",
		Name:            "Events Test",
		Status:          StatusPending,
		DockerImage:     "hld",
		DockerImageTag:  "latest",
		HelmReleaseName: "ws-test",
		Namespace:       "ws-test",
	}
	err := store.CreateWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("CreateWorkspace failed: %v", err)
	}

	// Log events
	events := []*WorkspaceEvent{
		{WorkspaceID: ws.ID, EventType: "created", Message: "Workspace created"},
		{WorkspaceID: ws.ID, EventType: "started", Message: "Workspace started"},
		{WorkspaceID: ws.ID, EventType: "stopped", Message: "Workspace stopped"},
	}

	for _, event := range events {
		err := store.LogEvent(ctx, event)
		if err != nil {
			t.Fatalf("LogEvent failed: %v", err)
		}
		if event.ID == 0 {
			t.Error("expected event ID to be set")
		}
	}

	// Get events with limit
	retrievedEvents, err := store.GetEvents(ctx, ws.ID, 2)
	if err != nil {
		t.Fatalf("GetEvents failed: %v", err)
	}
	if len(retrievedEvents) != 2 {
		t.Errorf("expected 2 events, got %d", len(retrievedEvents))
	}

	// Events should be in reverse chronological order
	if retrievedEvents[0].EventType != "stopped" {
		t.Errorf("expected first event to be 'stopped', got %q", retrievedEvents[0].EventType)
	}
}

func TestCascadeDelete(t *testing.T) {
	store, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create workspace with secrets and events
	ws := &Workspace{
		ID:              "test-ws-cascade",
		Name:            "Cascade Test",
		Status:          StatusPending,
		DockerImage:     "hld",
		DockerImageTag:  "latest",
		HelmReleaseName: "ws-test",
		Namespace:       "ws-test",
	}
	err := store.CreateWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("CreateWorkspace failed: %v", err)
	}

	err = store.SetSecret(ctx, &WorkspaceSecret{
		WorkspaceID: ws.ID,
		Key:         "test_key",
		Value:       "test_value",
	})
	if err != nil {
		t.Fatalf("SetSecret failed: %v", err)
	}

	err = store.LogEvent(ctx, &WorkspaceEvent{
		WorkspaceID: ws.ID,
		EventType:   "created",
		Message:     "Test event",
	})
	if err != nil {
		t.Fatalf("LogEvent failed: %v", err)
	}

	// Delete workspace - should cascade delete secrets and events
	err = store.DeleteWorkspace(ctx, ws.ID)
	if err != nil {
		t.Fatalf("DeleteWorkspace failed: %v", err)
	}

	// Verify cascade delete
	secrets, err := store.GetSecrets(ctx, ws.ID)
	if err != nil {
		t.Fatalf("GetSecrets failed: %v", err)
	}
	if len(secrets) != 0 {
		t.Errorf("expected 0 secrets after cascade delete, got %d", len(secrets))
	}

	events, err := store.GetEvents(ctx, ws.ID, 10)
	if err != nil {
		t.Fatalf("GetEvents failed: %v", err)
	}
	if len(events) != 0 {
		t.Errorf("expected 0 events after cascade delete, got %d", len(events))
	}
}

func TestWorkspaceNotFound(t *testing.T) {
	store, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()

	_, err := store.GetWorkspace(ctx, "nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent workspace")
	}
}

func TestSecretNotFound(t *testing.T) {
	store, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()

	_, err := store.GetSecret(ctx, "nonexistent", "key")
	if err == nil {
		t.Error("expected error for nonexistent secret")
	}
}

func TestTimestamps(t *testing.T) {
	store, cleanup := setupTestStore(t)
	defer cleanup()

	ctx := context.Background()

	ws := &Workspace{
		ID:              "test-ws-timestamps",
		Name:            "Timestamps Test",
		Status:          StatusPending,
		DockerImage:     "hld",
		DockerImageTag:  "latest",
		HelmReleaseName: "ws-test",
		Namespace:       "ws-test",
	}

	beforeCreate := time.Now().Add(-time.Second)
	err := store.CreateWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("CreateWorkspace failed: %v", err)
	}

	retrieved, err := store.GetWorkspace(ctx, ws.ID)
	if err != nil {
		t.Fatalf("GetWorkspace failed: %v", err)
	}

	if retrieved.CreatedAt.Before(beforeCreate) {
		t.Error("created_at should be after test start")
	}
	if retrieved.UpdatedAt.Before(beforeCreate) {
		t.Error("updated_at should be after test start")
	}
}
