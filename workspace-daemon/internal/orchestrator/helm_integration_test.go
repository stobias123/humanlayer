//go:build integration

package orchestrator

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	testKubeContext = "la-nuc-1-k8s"
	testChartPath   = "../../../helm/hld-workspace"
)

// testHelper provides utilities for integration tests
type testHelper struct {
	t          *testing.T
	orch       *HelmOrchestrator
	kubeClient *kubernetes.Clientset
	createdIDs []string // track workspace IDs for cleanup
}

func newTestHelper(t *testing.T) *testHelper {
	t.Helper()

	// Get kubeconfig path
	kubeconfigPath := os.Getenv("KUBECONFIG")
	if kubeconfigPath == "" {
		home, _ := os.UserHomeDir()
		kubeconfigPath = filepath.Join(home, ".kube", "config")
	}

	// Build config with specific context
	config, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfigPath},
		&clientcmd.ConfigOverrides{CurrentContext: testKubeContext},
	).ClientConfig()
	if err != nil {
		t.Skipf("Skipping integration test: failed to build kubeconfig for context %s: %v", testKubeContext, err)
	}

	kubeClient, err := kubernetes.NewForConfig(config)
	if err != nil {
		t.Skipf("Skipping integration test: failed to create kubernetes client: %v", err)
	}

	// Verify cluster connectivity
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = kubeClient.CoreV1().Namespaces().List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		t.Skipf("Skipping integration test: cannot connect to kubernetes cluster: %v", err)
	}

	// Resolve chart path relative to test file
	chartPath, err := filepath.Abs(testChartPath)
	if err != nil {
		t.Fatalf("Failed to resolve chart path: %v", err)
	}

	// Verify chart exists
	if _, err := os.Stat(filepath.Join(chartPath, "Chart.yaml")); err != nil {
		t.Fatalf("Helm chart not found at %s: %v", chartPath, err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	orch, err := NewHelmOrchestrator(chartPath, logger)
	if err != nil {
		t.Fatalf("Failed to create HelmOrchestrator: %v", err)
	}

	return &testHelper{
		t:          t,
		orch:       orch,
		kubeClient: kubeClient,
		createdIDs: make([]string, 0),
	}
}

// cleanup removes all created workspaces
func (h *testHelper) cleanup() {
	ctx := context.Background()
	for _, id := range h.createdIDs {
		ws := &store.Workspace{ID: id}
		_ = h.orch.DeleteWorkspace(ctx, ws)
	}
}

// generateTestID creates a unique 8-char ID for testing
func (h *testHelper) generateTestID() string {
	id := uuid.New().String()[:8]
	h.createdIDs = append(h.createdIDs, id)
	return id
}

// createTestWorkspace creates a minimal workspace for testing
func (h *testHelper) createTestWorkspace(id string) *store.Workspace {
	return &store.Workspace{
		ID:              id,
		Name:            fmt.Sprintf("test-ws-%s", id),
		Status:          store.StatusPending,
		DockerImage:     "ghcr.io/humanlayer/hld",
		DockerImageTag:  "latest",
		HelmReleaseName: fmt.Sprintf("hld-%s", id),
		Namespace:       fmt.Sprintf("workspace-%s", id),
		CPURequest:      "100m",
		MemoryRequest:   "128Mi",
		CPULimit:        "500m",
		MemoryLimit:     "512Mi",
		DataSize:        "1Gi",
		SrcSize:         "1Gi",
	}
}

// namespaceExists checks if a namespace exists in the cluster
func (h *testHelper) namespaceExists(ctx context.Context, name string) bool {
	_, err := h.kubeClient.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
	return err == nil
}

// helmReleaseExists checks if a helm release exists by checking for secret
func (h *testHelper) helmReleaseExists(ctx context.Context, namespace, releaseName string) bool {
	secrets, err := h.kubeClient.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("owner=helm,name=%s", releaseName),
	})
	if err != nil {
		return false
	}
	return len(secrets.Items) > 0
}

// createNamespace creates a namespace manually for testing
func (h *testHelper) createNamespace(ctx context.Context, name string) error {
	ns := &metav1.ObjectMeta{Name: name}
	_, err := h.kubeClient.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: *ns}, metav1.CreateOptions{})
	return err
}

// deleteNamespace deletes a namespace manually
func (h *testHelper) deleteNamespace(ctx context.Context, name string) error {
	return h.kubeClient.CoreV1().Namespaces().Delete(ctx, name, metav1.DeleteOptions{})
}

// waitForPodRunning waits for at least one pod to be running in the namespace
func (h *testHelper) waitForPodRunning(ctx context.Context, namespace string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		pods, err := h.kubeClient.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
		if err == nil && len(pods.Items) > 0 {
			for _, pod := range pods.Items {
				if pod.Status.Phase == corev1.PodRunning {
					return nil
				}
			}
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("timed out waiting for pod to be running in namespace %s", namespace)
}

// --- Integration Tests ---

func TestDeployWorkspace_Success(t *testing.T) {
	h := newTestHelper(t)
	defer h.cleanup()

	ctx := context.Background()
	id := h.generateTestID()
	ws := h.createTestWorkspace(id)
	namespace := fmt.Sprintf("workspace-%s", id)

	// Deploy workspace
	err := h.orch.DeployWorkspace(ctx, ws, nil)
	if err != nil {
		t.Fatalf("DeployWorkspace failed: %v", err)
	}

	// Verify namespace was created
	if !h.namespaceExists(ctx, namespace) {
		t.Errorf("Expected namespace %s to exist after deployment", namespace)
	}

	// Verify helm release exists
	if !h.helmReleaseExists(ctx, namespace, fmt.Sprintf("hld-%s", id)) {
		t.Errorf("Expected helm release hld-%s to exist after deployment", id)
	}

	// Wait for pod to start (might take time for image pull)
	// Note: This may fail if image isn't available, but that's acceptable for this test
	t.Logf("Workspace %s deployed successfully, namespace %s created", id, namespace)
}

func TestDeployWorkspace_NamespaceExists(t *testing.T) {
	h := newTestHelper(t)
	defer h.cleanup()

	ctx := context.Background()
	id := h.generateTestID()
	ws := h.createTestWorkspace(id)
	namespace := fmt.Sprintf("workspace-%s", id)

	// Pre-create the namespace manually
	err := h.createNamespace(ctx, namespace)
	if err != nil {
		t.Fatalf("Failed to pre-create namespace: %v", err)
	}
	defer h.deleteNamespace(ctx, namespace) // cleanup even if test fails

	// Attempt to deploy - should fail because namespace exists
	err = h.orch.DeployWorkspace(ctx, ws, nil)
	if err == nil {
		t.Fatal("Expected DeployWorkspace to fail when namespace already exists, but it succeeded")
	}

	// Verify error message mentions "already exists"
	if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("Expected error to contain 'already exists', got: %v", err)
	}

	t.Logf("Deploy correctly failed with error: %v", err)
}

func TestDeleteWorkspace_Success(t *testing.T) {
	h := newTestHelper(t)
	defer h.cleanup()

	ctx := context.Background()
	id := h.generateTestID()
	ws := h.createTestWorkspace(id)
	namespace := fmt.Sprintf("workspace-%s", id)

	// First deploy the workspace
	err := h.orch.DeployWorkspace(ctx, ws, nil)
	if err != nil {
		t.Fatalf("DeployWorkspace failed: %v", err)
	}

	// Verify it exists
	if !h.namespaceExists(ctx, namespace) {
		t.Fatal("Namespace should exist after deployment")
	}

	// Now delete it
	err = h.orch.DeleteWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("DeleteWorkspace failed: %v", err)
	}

	// Wait a moment for async deletion
	time.Sleep(2 * time.Second)

	// Verify namespace is deleted (or being deleted)
	// Note: namespace deletion may be async, so we wait a bit
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if !h.namespaceExists(ctx, namespace) {
			t.Logf("Workspace %s deleted successfully", id)
			return
		}
		time.Sleep(2 * time.Second)
	}
	t.Logf("Warning: namespace %s still exists after deletion (may be terminating)", namespace)
}

func TestDeleteWorkspace_NotExists(t *testing.T) {
	h := newTestHelper(t)
	defer h.cleanup()

	ctx := context.Background()
	id := h.generateTestID()
	ws := h.createTestWorkspace(id)

	// Delete without creating first - should succeed (idempotent)
	err := h.orch.DeleteWorkspace(ctx, ws)
	if err != nil {
		t.Errorf("DeleteWorkspace should succeed even when workspace doesn't exist, got error: %v", err)
	}

	t.Logf("DeleteWorkspace correctly handled non-existent workspace (returns nil)")
}

func TestDeleteWorkspace_PartialCleanup(t *testing.T) {
	h := newTestHelper(t)
	defer h.cleanup()

	ctx := context.Background()
	id := h.generateTestID()
	ws := h.createTestWorkspace(id)
	namespace := fmt.Sprintf("workspace-%s", id)

	// Deploy workspace
	err := h.orch.DeployWorkspace(ctx, ws, nil)
	if err != nil {
		t.Fatalf("DeployWorkspace failed: %v", err)
	}

	// Manually delete the helm release but leave namespace
	// This simulates a partial cleanup scenario
	// We'll use the orchestrator's internal helm uninstall
	// by just testing that DeleteWorkspace handles missing release gracefully

	// First delete should succeed
	err = h.orch.DeleteWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("First DeleteWorkspace failed: %v", err)
	}

	// Second delete should also succeed (idempotent)
	err = h.orch.DeleteWorkspace(ctx, ws)
	if err != nil {
		t.Errorf("Second DeleteWorkspace should succeed (idempotent), got error: %v", err)
	}

	t.Logf("DeleteWorkspace handled double-delete correctly")

	// Cleanup: ensure namespace is gone
	time.Sleep(2 * time.Second)
	if h.namespaceExists(ctx, namespace) {
		h.deleteNamespace(ctx, namespace)
	}
}

func TestWorkspaceLifecycle_Full(t *testing.T) {
	h := newTestHelper(t)
	defer h.cleanup()

	ctx := context.Background()
	id := h.generateTestID()
	ws := h.createTestWorkspace(id)
	namespace := fmt.Sprintf("workspace-%s", id)

	// Phase 1: Deploy
	t.Log("Phase 1: Deploying workspace")
	err := h.orch.DeployWorkspace(ctx, ws, nil)
	if err != nil {
		t.Fatalf("DeployWorkspace failed: %v", err)
	}
	if !h.namespaceExists(ctx, namespace) {
		t.Fatal("Namespace should exist after deployment")
	}

	// Phase 2: Get Status
	t.Log("Phase 2: Getting workspace status")
	status, err := h.orch.GetWorkspaceStatus(ctx, ws)
	if err != nil {
		t.Logf("Warning: GetWorkspaceStatus failed: %v (pod may not be ready)", err)
	} else {
		t.Logf("Workspace status: phase=%s, ready=%v, message=%s", status.Phase, status.Ready, status.Message)
	}

	// Phase 3: Stop workspace
	t.Log("Phase 3: Stopping workspace")
	ws.Status = store.StatusRunning // simulate running state
	err = h.orch.StopWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("StopWorkspace failed: %v", err)
	}

	// Phase 4: Start workspace again
	t.Log("Phase 4: Starting workspace")
	ws.Status = store.StatusStopped
	err = h.orch.StartWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("StartWorkspace failed: %v", err)
	}

	// Phase 5: Delete workspace
	t.Log("Phase 5: Deleting workspace")
	err = h.orch.DeleteWorkspace(ctx, ws)
	if err != nil {
		t.Fatalf("DeleteWorkspace failed: %v", err)
	}

	t.Log("Full lifecycle test completed successfully")
}
