package orchestrator

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// HelmOrchestrator implements Orchestrator using Helm for deployments
type HelmOrchestrator struct {
	chartPath  string
	kubeClient *kubernetes.Clientset
	restConfig *rest.Config
	logger     *slog.Logger
}

// NewHelmOrchestrator creates a new HelmOrchestrator with fallback kubeconfig logic
func NewHelmOrchestrator(chartPath string, logger *slog.Logger) (*HelmOrchestrator, error) {
	if logger == nil {
		logger = slog.Default()
	}

	var restConfig *rest.Config
	var err error

	// Try kubeconfig first (from env or default location)
	kubeconfigPath := os.Getenv("KUBECONFIG")
	if kubeconfigPath == "" {
		home, _ := os.UserHomeDir()
		kubeconfigPath = filepath.Join(home, ".kube", "config")
	}

	if _, statErr := os.Stat(kubeconfigPath); statErr == nil {
		restConfig, err = clientcmd.BuildConfigFromFlags("", kubeconfigPath)
		if err != nil {
			return nil, fmt.Errorf("failed to build config from kubeconfig: %w", err)
		}
		logger.Info("Using kubeconfig", "path", kubeconfigPath)
	} else {
		// Fall back to in-cluster config
		restConfig, err = rest.InClusterConfig()
		if err != nil {
			return nil, fmt.Errorf("failed to get in-cluster config: %w", err)
		}
		logger.Info("Using in-cluster config")
	}

	kubeClient, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
	}

	return &HelmOrchestrator{
		chartPath:  chartPath,
		kubeClient: kubeClient,
		restConfig: restConfig,
		logger:     logger,
	}, nil
}

// getHelmActionConfig creates a Helm action configuration for a namespace
func (h *HelmOrchestrator) getHelmActionConfig(namespace string) (*action.Configuration, error) {
	settings := cli.New()
	actionConfig := new(action.Configuration)

	// Use REST config getter that returns our existing config
	if err := actionConfig.Init(settings.RESTClientGetter(), namespace, "secret", func(format string, v ...interface{}) {
		h.logger.Debug(fmt.Sprintf(format, v...))
	}); err != nil {
		return nil, fmt.Errorf("failed to init helm action config: %w", err)
	}

	return actionConfig, nil
}

// buildHelmValues converts workspace and secrets to Helm values map
func (h *HelmOrchestrator) buildHelmValues(ws *store.Workspace, secrets []*store.WorkspaceSecret) map[string]interface{} {
	values := map[string]interface{}{
		"workspace": map[string]interface{}{
			"id":   ws.ID,
			"name": ws.Name,
		},
		"state": map[string]interface{}{
			"running": ws.Status == store.StatusRunning || ws.Status == store.StatusPending,
		},
		"resources": map[string]interface{}{
			"requests": map[string]interface{}{
				"cpu":    ws.CPURequest,
				"memory": ws.MemoryRequest,
			},
			"limits": map[string]interface{}{
				"cpu":    ws.CPULimit,
				"memory": ws.MemoryLimit,
			},
		},
		"storage": map[string]interface{}{
			"dataSize": ws.DataSize,
			"srcSize":  ws.SrcSize,
		},
	}

	// Add git configuration if enabled
	if ws.GitEnabled {
		gitConfig := map[string]interface{}{
			"enabled":   true,
			"userName":  ws.GitUserName,
			"userEmail": ws.GitUserEmail,
		}
		// Find GitHub token from secrets
		for _, secret := range secrets {
			if secret.Key == "gh_token" {
				gitConfig["ghToken"] = secret.Value
				break
			}
		}
		values["git"] = gitConfig
	}

	// Add other secrets
	secretsMap := map[string]interface{}{}
	for _, secret := range secrets {
		switch secret.Key {
		case "humanlayer_api_key":
			secretsMap["humanlayerApiKey"] = secret.Value
		case "anthropic_api_key":
			secretsMap["anthropicApiKey"] = secret.Value
		case "openrouter_api_key":
			secretsMap["openrouterApiKey"] = secret.Value
		}
	}
	if len(secretsMap) > 0 {
		values["secrets"] = secretsMap
	}

	return values
}

// DeployWorkspace creates a new workspace deployment via Helm install
func (h *HelmOrchestrator) DeployWorkspace(ctx context.Context, ws *store.Workspace, secrets []*store.WorkspaceSecret) error {
	namespace := fmt.Sprintf("workspace-%s", ws.ID)
	releaseName := fmt.Sprintf("hld-%s", ws.ID)

	h.logger.Info("Deploying workspace", "id", ws.ID, "namespace", namespace, "release", releaseName)

	actionConfig, err := h.getHelmActionConfig(namespace)
	if err != nil {
		return err
	}

	// Load the chart
	chart, err := loader.Load(h.chartPath)
	if err != nil {
		return fmt.Errorf("failed to load helm chart from %s: %w", h.chartPath, err)
	}

	// Build values
	values := h.buildHelmValues(ws, secrets)

	// Create install action
	install := action.NewInstall(actionConfig)
	install.ReleaseName = releaseName
	install.Namespace = namespace
	install.CreateNamespace = true
	install.Wait = false // Don't wait for pods to be ready
	install.Timeout = 5 * time.Minute

	_, err = install.RunWithContext(ctx, chart, values)
	if err != nil {
		return fmt.Errorf("failed to install helm release: %w", err)
	}

	h.logger.Info("Workspace deployed successfully", "id", ws.ID)
	return nil
}

// StopWorkspace scales the workspace to 0 replicas via Helm upgrade
func (h *HelmOrchestrator) StopWorkspace(ctx context.Context, ws *store.Workspace) error {
	h.logger.Info("Stopping workspace", "id", ws.ID)
	return h.setWorkspaceRunning(ctx, ws, false)
}

// StartWorkspace scales the workspace to 1 replica via Helm upgrade
func (h *HelmOrchestrator) StartWorkspace(ctx context.Context, ws *store.Workspace) error {
	h.logger.Info("Starting workspace", "id", ws.ID)
	return h.setWorkspaceRunning(ctx, ws, true)
}

// setWorkspaceRunning updates the state.running value via Helm upgrade
func (h *HelmOrchestrator) setWorkspaceRunning(ctx context.Context, ws *store.Workspace, running bool) error {
	namespace := fmt.Sprintf("workspace-%s", ws.ID)
	releaseName := fmt.Sprintf("hld-%s", ws.ID)

	actionConfig, err := h.getHelmActionConfig(namespace)
	if err != nil {
		return err
	}

	// Get current release values
	getValues := action.NewGetValues(actionConfig)
	existingValues, err := getValues.Run(releaseName)
	if err != nil {
		return fmt.Errorf("failed to get existing values: %w", err)
	}

	// Update state.running
	if state, ok := existingValues["state"].(map[string]interface{}); ok {
		state["running"] = running
	} else {
		existingValues["state"] = map[string]interface{}{"running": running}
	}

	// Load chart
	chart, err := loader.Load(h.chartPath)
	if err != nil {
		return fmt.Errorf("failed to load helm chart: %w", err)
	}

	// Upgrade release
	upgrade := action.NewUpgrade(actionConfig)
	upgrade.Namespace = namespace
	upgrade.Wait = false
	upgrade.Timeout = 2 * time.Minute

	_, err = upgrade.RunWithContext(ctx, releaseName, chart, existingValues)
	if err != nil {
		return fmt.Errorf("failed to upgrade helm release: %w", err)
	}

	h.logger.Info("Workspace running state updated", "id", ws.ID, "running", running)
	return nil
}

// DeleteWorkspace removes the workspace deployment via Helm uninstall
func (h *HelmOrchestrator) DeleteWorkspace(ctx context.Context, ws *store.Workspace) error {
	namespace := fmt.Sprintf("workspace-%s", ws.ID)
	releaseName := fmt.Sprintf("hld-%s", ws.ID)

	h.logger.Info("Deleting workspace", "id", ws.ID, "namespace", namespace)

	actionConfig, err := h.getHelmActionConfig(namespace)
	if err != nil {
		return err
	}

	// Uninstall release
	uninstall := action.NewUninstall(actionConfig)
	uninstall.Timeout = 2 * time.Minute
	uninstall.Wait = true

	_, err = uninstall.Run(releaseName)
	if err != nil {
		h.logger.Warn("Failed to uninstall helm release", "error", err)
		// Continue to try deleting namespace
	}

	// Delete namespace (Helm doesn't delete namespaces it creates)
	err = h.kubeClient.CoreV1().Namespaces().Delete(ctx, namespace, metav1.DeleteOptions{})
	if err != nil {
		h.logger.Warn("Failed to delete namespace", "namespace", namespace, "error", err)
		// Don't fail - namespace might already be gone
	}

	h.logger.Info("Workspace deleted", "id", ws.ID)
	return nil
}

// GetWorkspaceStatus returns the current status of a workspace by querying K8s
func (h *HelmOrchestrator) GetWorkspaceStatus(ctx context.Context, ws *store.Workspace) (*WorkspaceStatus, error) {
	namespace := fmt.Sprintf("workspace-%s", ws.ID)
	labelSelector := fmt.Sprintf("app.kubernetes.io/instance=hld-%s", ws.ID)

	// List pods matching the workspace
	pods, err := h.kubeClient.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pods: %w", err)
	}

	status := &WorkspaceStatus{
		Phase: "Unknown",
		Ready: false,
	}

	if len(pods.Items) == 0 {
		status.Phase = "Stopped"
		status.Message = "No pods running"
		return status, nil
	}

	// Use first pod's status
	pod := pods.Items[0]
	status.Phase = string(pod.Status.Phase)
	status.PodIP = pod.Status.PodIP
	status.NodeName = pod.Spec.NodeName

	if pod.Status.StartTime != nil {
		status.StartTime = pod.Status.StartTime.Format(time.RFC3339)
	}

	// Check container readiness
	for _, cond := range pod.Status.Conditions {
		if cond.Type == corev1.PodReady {
			status.Ready = cond.Status == corev1.ConditionTrue
			if cond.Message != "" {
				status.Message = cond.Message
			}
			break
		}
	}

	// Check for error conditions
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			status.Message = fmt.Sprintf("%s: %s", cs.State.Waiting.Reason, cs.State.Waiting.Message)
		}
		if cs.State.Terminated != nil && cs.State.Terminated.Reason != "" {
			status.Message = fmt.Sprintf("Terminated: %s", cs.State.Terminated.Reason)
		}
	}

	return status, nil
}
