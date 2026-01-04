package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/humanlayer/humanlayer/workspace-daemon/internal/api"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/config"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/orchestrator"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		slog.Error("Failed to load config", "error", err)
		os.Exit(1)
	}

	// Initialize logger
	level := slog.LevelInfo
	if cfg.LogLevel == "debug" {
		level = slog.LevelDebug
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(logger)

	slog.Info("Starting workspace daemon",
		"version", cfg.Version,
		"port", cfg.HTTPPort,
		"host", cfg.HTTPHost)

	// Set Gin mode based on log level
	if cfg.LogLevel != "debug" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize SQLite store
	st, err := store.NewSQLiteStore(cfg.DatabasePath)
	if err != nil {
		slog.Error("Failed to initialize store", "error", err)
		os.Exit(1)
	}
	defer st.Close()
	slog.Info("Store initialized", "path", cfg.DatabasePath)

	// Initialize Helm orchestrator
	var orch orchestrator.Orchestrator
	if cfg.HelmChartPath != "" {
		helmOrch, err := orchestrator.NewHelmOrchestrator(cfg.KubeConfig, cfg.HelmChartPath)
		if err != nil {
			slog.Warn("Failed to initialize Helm orchestrator - workspace deployment disabled", "error", err)
		} else {
			orch = helmOrch
			slog.Info("Helm orchestrator initialized", "chart", cfg.HelmChartPath)
		}
	} else {
		slog.Warn("Helm chart path not configured - workspace deployment disabled")
	}

	// Initialize router with all dependencies
	router := api.NewRouter(api.RouterConfig{
		Store:        st,
		Orchestrator: orch,
	})

	// Create HTTP server
	addr := fmt.Sprintf("%s:%d", cfg.HTTPHost, cfg.HTTPPort)
	srv := &http.Server{
		Addr:    addr,
		Handler: router,
	}

	// Start server in goroutine
	errChan := make(chan error, 1)
	go func() {
		slog.Info("HTTP server listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errChan <- err
		}
	}()

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errChan:
		slog.Error("Server error", "error", err)
		os.Exit(1)
	case sig := <-sigChan:
		slog.Info("Received shutdown signal", "signal", sig)
	}

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server shutdown error", "error", err)
		os.Exit(1)
	}

	slog.Info("Server stopped gracefully")
}
