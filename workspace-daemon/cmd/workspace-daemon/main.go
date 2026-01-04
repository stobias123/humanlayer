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

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/api/handlers"
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

	// Initialize store
	dbStore, err := store.NewSQLiteStore(cfg.DatabasePath)
	if err != nil {
		slog.Error("Failed to initialize store", "error", err)
		os.Exit(1)
	}
	defer dbStore.Close()
	slog.Info("Database initialized", "path", cfg.DatabasePath)

	// Initialize orchestrator
	orch, err := orchestrator.NewHelmOrchestrator(cfg.HelmChartPath, logger)
	if err != nil {
		slog.Error("Failed to initialize orchestrator", "error", err)
		os.Exit(1)
	}
	slog.Info("Orchestrator initialized", "chart_path", cfg.HelmChartPath)

	// Create workspace handlers
	wsHandlers := handlers.NewWorkspaceHandlers(dbStore, orch, logger)

	// Set Gin mode based on log level
	if cfg.LogLevel != "debug" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize router
	router := gin.New()
	router.Use(gin.Recovery())

	// Configure CORS
	corsConfig := cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}
	router.Use(cors.New(corsConfig))

	// API routes
	api := router.Group("/api/v1")
	{
		api.GET("/health", handlers.Health())

		// Workspace routes
		api.GET("/workspaces", wsHandlers.ListWorkspaces())
		api.POST("/workspaces", wsHandlers.CreateWorkspace())
		api.GET("/workspaces/:id", wsHandlers.GetWorkspace())
		api.DELETE("/workspaces/:id", wsHandlers.DeleteWorkspace())
		api.POST("/workspaces/:id/start", wsHandlers.StartWorkspace())
		api.POST("/workspaces/:id/stop", wsHandlers.StopWorkspace())
		api.GET("/workspaces/:id/events", wsHandlers.GetEvents())
	}

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
