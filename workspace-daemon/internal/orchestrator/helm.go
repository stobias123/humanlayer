package orchestrator

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
)

// HelmOrchestrator implements Orchestrator using Helm and Kubernetes
type HelmOrchestrator struct {
	helmChartPath string
	helmSettings  *cli.EnvSettings
	kubeClient    kubernetes.Interface
	restConfig    *rest.Config
}

// NewHelmOrchestrator creates a new Helm-based orchestrator
func NewHelmOrchestrator(kubeconfig, helmChartPath string) (*HelmOrchestrator, error) {
	var restConfig *rest.Config
	var err error

	if kubeconfig == "" {
		// Try in-cluster config first
		restConfig, err = rest.InClusterConfig()
		if err != nil {
			// Fall back to kubeconfig from environment
			kubeconfig = os.Getenv("KUBECONFIG")
			if kubeconfig == "" {
				kubeconfig = filepath.Join(os.Getenv("HOME"), ".kube", "config")
			}
			restConfig, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
			if err != nil {
				return nil, fmt.Errorf("failed to build kubeconfig: %w", err)
			}
			slog.Info("Using kubeconfig", "path", kubeconfig)
		} else {
			slog.Info("Using in-cluster Kubernetes config")
		}
	} else {
		restConfig, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to build kubeconfig: %w", err)
		}
		slog.Info("Using kubeconfig", "path", kubeconfig)
	}

	kubeClient, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
	}

	helmSettings := cli.New()

	return &HelmOrchestrator{
		helmChartPath: helmChartPath,
		helmSettings:  helmSettings,
		kubeClient:    kubeClient,
		restConfig:    restConfig,
	}, nil
}

// getActionConfig creates a Helm action configuration for a namespace
func (o *HelmOrchestrator) getActionConfig(namespace string) (*action.Configuration, error) {
	actionConfig := new(action.Configuration)

	// Use the REST config for Helm
	getter := &restClientGetter{
		restConfig: o.restConfig,
		namespace:  namespace,
	}

	if err := actionConfig.Init(getter, namespace, "secret", func(format string, v ...interface{}) {
		slog.Debug(fmt.Sprintf(format, v...))
	}); err != nil {
		return nil, fmt.Errorf("failed to init helm action config: %w", err)
	}

	return actionConfig, nil
}

// DeployWorkspace creates a new workspace deployment
func (o *HelmOrchestrator) DeployWorkspace(ctx context.Context, ws *store.Workspace, secrets []*store.WorkspaceSecret) error {
	slog.Info("Deploying workspace", "id", ws.ID, "name", ws.Name, "namespace", ws.Namespace)

	actionConfig, err := o.getActionConfig(ws.Namespace)
	if err != nil {
		return err
	}

	// Load the chart
	chart, err := loader.Load(o.helmChartPath)
	if err != nil {
		return fmt.Errorf("failed to load helm chart: %w", err)
	}

	// Build values
	values := o.buildValues(ws, secrets)

	// Create install action
	install := action.NewInstall(actionConfig)
	install.ReleaseName = ws.HelmReleaseName
	install.Namespace = ws.Namespace
	install.CreateNamespace = true
	install.Wait = false // Don't wait for pods to be ready
	install.Timeout = 5 * time.Minute

	// Run install
	rel, err := install.RunWithContext(ctx, chart, values)
	if err != nil {
		return fmt.Errorf("failed to install helm release: %w", err)
	}

	slog.Info("Workspace deployed", "release", rel.Name, "namespace", rel.Namespace, "status", rel.Info.Status)
	return nil
}

// StopWorkspace scales the workspace to 0 replicas
func (o *HelmOrchestrator) StopWorkspace(ctx context.Context, ws *store.Workspace) error {
	slog.Info("Stopping workspace", "id", ws.ID, "name", ws.Name)

	actionConfig, err := o.getActionConfig(ws.Namespace)
	if err != nil {
		return err
	}

	// Load the chart
	chart, err := loader.Load(o.helmChartPath)
	if err != nil {
		return fmt.Errorf("failed to load helm chart: %w", err)
	}

	// Build values with state.running = false
	values := map[string]interface{}{
		"state": map[string]interface{}{
			"running": false,
		},
	}

	// Create upgrade action
	upgrade := action.NewUpgrade(actionConfig)
	upgrade.Namespace = ws.Namespace
	upgrade.ReuseValues = true
	upgrade.Wait = false
	upgrade.Timeout = 2 * time.Minute

	// Run upgrade
	rel, err := upgrade.RunWithContext(ctx, ws.HelmReleaseName, chart, values)
	if err != nil {
		return fmt.Errorf("failed to stop workspace: %w", err)
	}

	slog.Info("Workspace stopped", "release", rel.Name, "status", rel.Info.Status)
	return nil
}

// StartWorkspace scales the workspace to 1 replica
func (o *HelmOrchestrator) StartWorkspace(ctx context.Context, ws *store.Workspace) error {
	slog.Info("Starting workspace", "id", ws.ID, "name", ws.Name)

	actionConfig, err := o.getActionConfig(ws.Namespace)
	if err != nil {
		return err
	}

	// Load the chart
	chart, err := loader.Load(o.helmChartPath)
	if err != nil {
		return fmt.Errorf("failed to load helm chart: %w", err)
	}

	// Build values with state.running = true
	values := map[string]interface{}{
		"state": map[string]interface{}{
			"running": true,
		},
	}

	// Create upgrade action
	upgrade := action.NewUpgrade(actionConfig)
	upgrade.Namespace = ws.Namespace
	upgrade.ReuseValues = true
	upgrade.Wait = false
	upgrade.Timeout = 2 * time.Minute

	// Run upgrade
	rel, err := upgrade.RunWithContext(ctx, ws.HelmReleaseName, chart, values)
	if err != nil {
		return fmt.Errorf("failed to start workspace: %w", err)
	}

	slog.Info("Workspace started", "release", rel.Name, "status", rel.Info.Status)
	return nil
}

// DeleteWorkspace removes the workspace deployment
func (o *HelmOrchestrator) DeleteWorkspace(ctx context.Context, ws *store.Workspace) error {
	slog.Info("Deleting workspace", "id", ws.ID, "name", ws.Name)

	actionConfig, err := o.getActionConfig(ws.Namespace)
	if err != nil {
		return err
	}

	// Create uninstall action
	uninstall := action.NewUninstall(actionConfig)
	uninstall.Timeout = 5 * time.Minute

	// Run uninstall
	resp, err := uninstall.Run(ws.HelmReleaseName)
	if err != nil {
		return fmt.Errorf("failed to uninstall helm release: %w", err)
	}

	slog.Info("Workspace deleted", "release", resp.Release.Name)

	// Delete namespace if it was created for this workspace
	if err := o.kubeClient.CoreV1().Namespaces().Delete(ctx, ws.Namespace, metav1.DeleteOptions{}); err != nil {
		slog.Warn("Failed to delete namespace", "namespace", ws.Namespace, "error", err)
		// Don't fail if namespace deletion fails
	}

	return nil
}

// GetWorkspaceStatus returns the current status of a workspace
func (o *HelmOrchestrator) GetWorkspaceStatus(ctx context.Context, ws *store.Workspace) (*WorkspaceStatus, error) {
	// Check Helm release status
	actionConfig, err := o.getActionConfig(ws.Namespace)
	if err != nil {
		return nil, err
	}

	status := action.NewStatus(actionConfig)
	rel, err := status.Run(ws.HelmReleaseName)
	if err != nil {
		return &WorkspaceStatus{
			Phase:   "unknown",
			Ready:   false,
			Message: fmt.Sprintf("failed to get release status: %v", err),
		}, nil
	}

	// Check pod status
	pods, err := o.kubeClient.CoreV1().Pods(ws.Namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("app.kubernetes.io/instance=%s", ws.HelmReleaseName),
	})
	if err != nil {
		return &WorkspaceStatus{
			Phase:   releaseStatusToPhase(rel.Info.Status),
			Ready:   false,
			Message: fmt.Sprintf("failed to list pods: %v", err),
		}, nil
	}

	if len(pods.Items) == 0 {
		return &WorkspaceStatus{
			Phase:   "stopped",
			Ready:   false,
			Message: "No pods found",
		}, nil
	}

	pod := pods.Items[0]
	return &WorkspaceStatus{
		Phase:     string(pod.Status.Phase),
		Ready:     isPodReady(&pod),
		Message:   getPodMessage(&pod),
		PodIP:     pod.Status.PodIP,
		NodeName:  pod.Spec.NodeName,
		StartTime: getStartTime(&pod),
	}, nil
}

// buildValues creates Helm values from workspace and secrets
func (o *HelmOrchestrator) buildValues(ws *store.Workspace, secrets []*store.WorkspaceSecret) map[string]interface{} {
	values := map[string]interface{}{
		"workspace": map[string]interface{}{
			"id":   ws.ID,
			"name": ws.Name,
		},
		"image": map[string]interface{}{
			"repository": ws.DockerImage,
			"tag":        ws.DockerImageTag,
		},
		"state": map[string]interface{}{
			"running": true,
		},
	}

	// Add resource limits if specified
	resources := map[string]interface{}{}
	if ws.CPURequest != "" || ws.MemoryRequest != "" {
		requests := map[string]interface{}{}
		if ws.CPURequest != "" {
			requests["cpu"] = ws.CPURequest
		}
		if ws.MemoryRequest != "" {
			requests["memory"] = ws.MemoryRequest
		}
		resources["requests"] = requests
	}
	if ws.CPULimit != "" || ws.MemoryLimit != "" {
		limits := map[string]interface{}{}
		if ws.CPULimit != "" {
			limits["cpu"] = ws.CPULimit
		}
		if ws.MemoryLimit != "" {
			limits["memory"] = ws.MemoryLimit
		}
		resources["limits"] = limits
	}
	if len(resources) > 0 {
		values["resources"] = resources
	}

	// Add storage sizes
	if ws.DataSize != "" || ws.SrcSize != "" {
		storage := map[string]interface{}{}
		if ws.DataSize != "" {
			storage["dataSize"] = ws.DataSize
		}
		if ws.SrcSize != "" {
			storage["srcSize"] = ws.SrcSize
		}
		values["storage"] = storage
	}

	// Add git configuration
	if ws.GitEnabled {
		git := map[string]interface{}{
			"enabled":   true,
			"userName":  ws.GitUserName,
			"userEmail": ws.GitUserEmail,
		}
		// Find gh_token in secrets
		for _, secret := range secrets {
			if secret.Key == "gh_token" {
				git["ghToken"] = secret.Value
				break
			}
		}
		values["git"] = git
	}

	// Add API secrets
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

	// Add ingress if host is set
	if ws.IngressHost != "" {
		values["ingress"] = map[string]interface{}{
			"enabled": true,
			"host":    ws.IngressHost,
		}
	}

	return values
}

// Helper functions

func releaseStatusToPhase(status release.Status) string {
	switch status {
	case release.StatusDeployed:
		return "running"
	case release.StatusFailed:
		return "error"
	case release.StatusPendingInstall, release.StatusPendingUpgrade, release.StatusPendingRollback:
		return "pending"
	case release.StatusUninstalling:
		return "stopping"
	default:
		return "unknown"
	}
}

func isPodReady(pod *corev1.Pod) bool {
	for _, cond := range pod.Status.Conditions {
		if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

func getPodMessage(pod *corev1.Pod) string {
	for _, cond := range pod.Status.Conditions {
		if cond.Type == corev1.PodReady {
			if cond.Message != "" {
				return cond.Message
			}
			if cond.Reason != "" {
				return cond.Reason
			}
		}
	}
	return ""
}

func getStartTime(pod *corev1.Pod) string {
	if pod.Status.StartTime != nil {
		return pod.Status.StartTime.Format(time.RFC3339)
	}
	return ""
}

// restClientGetter implements genericclioptions.RESTClientGetter for Helm
type restClientGetter struct {
	restConfig *rest.Config
	namespace  string
}

func (r *restClientGetter) ToRESTConfig() (*rest.Config, error) {
	return r.restConfig, nil
}

func (r *restClientGetter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	config, err := r.ToRESTConfig()
	if err != nil {
		return nil, err
	}
	discoveryClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, err
	}
	return memory.NewMemCacheClient(discoveryClient), nil
}

func (r *restClientGetter) ToRESTMapper() (meta.RESTMapper, error) {
	discoveryClient, err := r.ToDiscoveryClient()
	if err != nil {
		return nil, err
	}
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(discoveryClient)
	return mapper, nil
}

func (r *restClientGetter) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{},
		&clientcmd.ConfigOverrides{Context: clientcmdapi.Context{Namespace: r.namespace}},
	)
}
