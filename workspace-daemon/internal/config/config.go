package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

// Config holds the daemon configuration
type Config struct {
	// Server config
	HTTPPort int
	HTTPHost string

	// Storage
	DatabasePath string

	// Kubernetes
	KubeConfig string

	// Helm
	HelmChartPath string

	// Logging
	LogLevel string

	// Version
	Version string
}

var (
	DefaultDatabasePath  = "~/.humanlayer/workspace-daemon.db"
	DefaultHTTPPort      = 8888
	DefaultHelmChartPath = "./helm/hld-workspace"
)

// Load loads configuration from environment variables
func Load() (*Config, error) {
	v := viper.New()

	// Environment variables
	v.SetEnvPrefix("WORKSPACE")
	v.AutomaticEnv()

	// Defaults
	v.SetDefault("http_port", DefaultHTTPPort)
	v.SetDefault("http_host", "127.0.0.1")
	v.SetDefault("database_path", DefaultDatabasePath)
	v.SetDefault("helm_chart_path", DefaultHelmChartPath)
	v.SetDefault("log_level", "info")

	// Bind environment variables
	_ = v.BindEnv("http_port", "WORKSPACE_HTTP_PORT")
	_ = v.BindEnv("http_host", "WORKSPACE_HTTP_HOST")
	_ = v.BindEnv("database_path", "WORKSPACE_DATABASE_PATH")
	_ = v.BindEnv("kubeconfig", "KUBECONFIG")
	_ = v.BindEnv("helm_chart_path", "WORKSPACE_HELM_CHART_PATH")
	_ = v.BindEnv("log_level", "WORKSPACE_LOG_LEVEL")

	config := &Config{
		HTTPPort:      v.GetInt("http_port"),
		HTTPHost:      v.GetString("http_host"),
		DatabasePath:  expandPath(v.GetString("database_path")),
		KubeConfig:    v.GetString("kubeconfig"),
		HelmChartPath: v.GetString("helm_chart_path"),
		LogLevel:      v.GetString("log_level"),
		Version:       getVersion(),
	}

	// Ensure database directory exists
	dbDir := filepath.Dir(config.DatabasePath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	return config, nil
}

func expandPath(path string) string {
	if len(path) > 0 && path[0] == '~' {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, path[1:])
	}
	return path
}

func getVersion() string {
	if v := os.Getenv("WORKSPACE_VERSION"); v != "" {
		return v
	}
	return "dev"
}
