//go:build integration
// +build integration

package client_test

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/humanlayer/humanlayer/hld/api"
	"github.com/humanlayer/humanlayer/hld/client"
	"github.com/humanlayer/humanlayer/hld/daemon"
	"github.com/humanlayer/humanlayer/hld/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestRemoteDaemonConnection tests connecting to a remote daemon over HTTP
// and starting a session, similar to how the WUI would connect to a deployed daemon.
func TestRemoteDaemonConnection(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Setup test environment to simulate remote daemon
	socketPath := testutil.SocketPath(t, "remote-daemon")
	dbPath := testutil.DatabasePath(t, "remote-daemon")

	// Find a free port for HTTP server
	httpPort := getFreePort(t)

	// Set environment variables for daemon config
	// Save original values for cleanup
	oldSocketPath := os.Getenv("HUMANLAYER_DAEMON_SOCKET")
	oldHTTPPort := os.Getenv("HUMANLAYER_DAEMON_HTTP_PORT")
	oldHTTPHost := os.Getenv("HUMANLAYER_DAEMON_HTTP_HOST")

	os.Setenv("HUMANLAYER_DAEMON_SOCKET", socketPath)
	os.Setenv("HUMANLAYER_DATABASE_PATH", dbPath)
	os.Setenv("HUMANLAYER_DAEMON_HTTP_PORT", fmt.Sprintf("%d", httpPort))
	os.Setenv("HUMANLAYER_DAEMON_HTTP_HOST", "127.0.0.1")

	t.Cleanup(func() {
		if oldSocketPath != "" {
			os.Setenv("HUMANLAYER_DAEMON_SOCKET", oldSocketPath)
		} else {
			os.Unsetenv("HUMANLAYER_DAEMON_SOCKET")
		}
		if oldHTTPPort != "" {
			os.Setenv("HUMANLAYER_DAEMON_HTTP_PORT", oldHTTPPort)
		} else {
			os.Unsetenv("HUMANLAYER_DAEMON_HTTP_PORT")
		}
		if oldHTTPHost != "" {
			os.Setenv("HUMANLAYER_DAEMON_HTTP_HOST", oldHTTPHost)
		} else {
			os.Unsetenv("HUMANLAYER_DAEMON_HTTP_HOST")
		}
	})

	// Start daemon with HTTP server
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	d, err := daemon.New()
	require.NoError(t, err, "Failed to create daemon")

	errChan := make(chan error, 1)
	go func() {
		errChan <- d.Run(ctx)
	}()

	// Wait for HTTP server to be ready
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", httpPort)
	require.Eventually(t, func() bool {
		resp, err := http.Get(baseURL + "/api/v1/health")
		if err == nil {
			resp.Body.Close()
			return resp.StatusCode == 200
		}
		return false
	}, 10*time.Second, 100*time.Millisecond, "HTTP server failed to start")

	t.Run("health check via REST", func(t *testing.T) {
		restClient := client.NewRESTClient(baseURL)

		health, err := restClient.GetHealth(ctx)
		require.NoError(t, err)
		assert.Equal(t, api.Ok, health.Status)
	})

	t.Run("create session via REST like WUI would", func(t *testing.T) {
		restClient := client.NewRESTClient(baseURL)

		// Create a session request similar to what the WUI would send
		workingDir := t.TempDir()
		model := api.Sonnet // Using the simplified model constant
		query := "List files in current directory"

		req := api.CreateSessionRequest{
			Query:      query,
			Model:      &model,
			WorkingDir: &workingDir,
		}

		// Create the session
		resp, err := restClient.CreateSession(ctx, req)
		require.NoError(t, err, "Failed to create session")
		require.NotNil(t, resp)

		// Verify response contains session and run IDs
		assert.NotEmpty(t, resp.Data.SessionId, "Session ID should not be empty")
		assert.NotEmpty(t, resp.Data.RunId, "Run ID should not be empty")

		sessionID := resp.Data.SessionId

		t.Logf("Created session: %s with run: %s", sessionID, resp.Data.RunId)

		// Verify we can retrieve the session
		getResp, err := restClient.GetSession(ctx, sessionID)
		require.NoError(t, err, "Failed to get session")
		require.NotNil(t, getResp)

		assert.Equal(t, sessionID, getResp.Data.Id)
		assert.Equal(t, query, getResp.Data.Query)
		assert.NotNil(t, getResp.Data.WorkingDir, "Working directory should be set")
		if getResp.Data.WorkingDir != nil {
			assert.Equal(t, workingDir, *getResp.Data.WorkingDir)
		}
	})

	t.Run("list sessions via REST", func(t *testing.T) {
		restClient := client.NewRESTClient(baseURL)

		// List all sessions
		resp, err := restClient.ListSessions(ctx, false, false)
		require.NoError(t, err)
		require.NotNil(t, resp)

		// Should have at least one session from previous test
		assert.NotEmpty(t, resp.Data, "Should have at least one session")

		t.Logf("Found %d sessions", len(resp.Data))
	})

	t.Run("create session with additional options", func(t *testing.T) {
		restClient := client.NewRESTClient(baseURL)

		workingDir := t.TempDir()
		model := api.Sonnet
		query := "Test session with options"
		autoAccept := true

		req := api.CreateSessionRequest{
			Query:           query,
			Model:           &model,
			WorkingDir:      &workingDir,
			AutoAcceptEdits: &autoAccept,
		}

		resp, err := restClient.CreateSession(ctx, req)
		require.NoError(t, err)
		require.NotNil(t, resp)

		sessionID := resp.Data.SessionId

		// Verify the session has the correct settings
		getResp, err := restClient.GetSession(ctx, sessionID)
		require.NoError(t, err)

		assert.NotNil(t, getResp.Data.AutoAcceptEdits, "Auto accept edits should be set")
		if getResp.Data.AutoAcceptEdits != nil {
			assert.True(t, *getResp.Data.AutoAcceptEdits, "Auto accept edits should be enabled")
		}
	})

	t.Run("interrupt session via REST", func(t *testing.T) {
		restClient := client.NewRESTClient(baseURL)

		// Create a session first
		workingDir := t.TempDir()
		model := api.Sonnet

		createResp, err := restClient.CreateSession(ctx, api.CreateSessionRequest{
			Query:      "Long running task",
			Model:      &model,
			WorkingDir: &workingDir,
		})
		require.NoError(t, err)

		sessionID := createResp.Data.SessionId

		// Try to interrupt it
		interruptResp, err := restClient.InterruptSession(ctx, sessionID)
		require.NoError(t, err)
		require.NotNil(t, interruptResp)

		assert.True(t, interruptResp.Data.Success, "Interrupt should succeed")
		assert.Equal(t, sessionID, interruptResp.Data.SessionId)
	})

	t.Run("continue session via REST", func(t *testing.T) {
		t.Skip("Skipping continue session test - requires parent session to complete which makes test very slow")
		// Note: To properly test session continuation, you would need to:
		// 1. Create a parent session
		// 2. Wait for it to complete (could take many seconds)
		// 3. Then attempt to continue it
		// This is better suited for a longer-running integration test
	})

	t.Run("get session messages via REST", func(t *testing.T) {
		restClient := client.NewRESTClient(baseURL)

		// Create a session
		workingDir := t.TempDir()
		model := api.Sonnet

		createResp, err := restClient.CreateSession(ctx, api.CreateSessionRequest{
			Query:      "Test query for messages",
			Model:      &model,
			WorkingDir: &workingDir,
		})
		require.NoError(t, err)

		sessionID := createResp.Data.SessionId

		// Get messages (even if empty initially)
		messagesResp, err := restClient.GetSessionMessages(ctx, sessionID)
		require.NoError(t, err)
		require.NotNil(t, messagesResp)

		// The messages array should exist (may be empty for a new session)
		assert.NotNil(t, messagesResp.Data)
	})

	t.Run("SSE event stream works via REST", func(t *testing.T) {
		// THIS IS THE CRITICAL TEST - WUI needs SSE to work!
		sseURL := fmt.Sprintf("%s/api/v1/stream/events", baseURL)

		// Subscribe to SSE events
		resp, err := http.Get(sseURL)
		require.NoError(t, err)
		defer resp.Body.Close()

		// Verify SSE headers
		assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))
		assert.Equal(t, "no-cache", resp.Header.Get("Cache-Control"))

		t.Log("Successfully connected to SSE endpoint")

		// Note: We don't wait for actual events since that would make the test slow
		// The important part is verifying the connection works
	})

	// Cleanup
	cancel()

	select {
	case err := <-errChan:
		// Context cancelled error is expected
		if err != nil && err != context.Canceled {
			t.Fatalf("Daemon exited with error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Timeout waiting for daemon to shutdown")
	}
}

// TestRemoteDaemonWithRealHostname tests connecting to daemon using hostname
// This simulates the actual deployment scenario where the daemon is accessed
// via a hostname like "hld.la-nuc-1.local"
func TestRemoteDaemonWithRealHostname(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// This test is designed to be run manually against a real remote daemon
	// Skip if the environment variable is not set
	remoteHost := os.Getenv("TEST_REMOTE_DAEMON_HOST")
	if remoteHost == "" {
		t.Skip("Skipping remote daemon test - set TEST_REMOTE_DAEMON_HOST to enable")
	}

	baseURL := fmt.Sprintf("http://%s", remoteHost)
	restClient := client.NewRESTClient(baseURL)

	ctx := context.Background()

	t.Run("health check against remote daemon", func(t *testing.T) {
		health, err := restClient.GetHealth(ctx)
		require.NoError(t, err, "Failed to connect to remote daemon at %s", remoteHost)
		assert.Equal(t, api.Ok, health.Status)

		t.Logf("Successfully connected to remote daemon at %s", remoteHost)
	})

	t.Run("create session on remote daemon", func(t *testing.T) {
		model := api.Sonnet
		query := "Test query from integration test"

		req := api.CreateSessionRequest{
			Query: query,
			Model: &model,
		}

		resp, err := restClient.CreateSession(ctx, req)
		require.NoError(t, err, "Failed to create session on remote daemon")
		require.NotNil(t, resp)

		assert.NotEmpty(t, resp.Data.SessionId, "Session ID should not be empty")
		assert.NotEmpty(t, resp.Data.RunId, "Run ID should not be empty")

		t.Logf("Created session %s on remote daemon", resp.Data.SessionId)
	})
}

// getFreePort finds an available port on localhost
func getFreePort(t *testing.T) int {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer listener.Close()

	return listener.Addr().(*net.TCPAddr).Port
}
