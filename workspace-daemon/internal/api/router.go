package api

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/humanlayer/humanlayer/workspace-daemon/internal/api/handlers"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/orchestrator"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/store"
)

// RouterConfig holds configuration for the API router
type RouterConfig struct {
	Store        store.Store
	Orchestrator orchestrator.Orchestrator
}

// NewRouter creates a new API router with all endpoints configured
func NewRouter(cfg RouterConfig) *gin.Engine {
	router := gin.New()

	// Middleware
	router.Use(gin.Recovery())
	router.Use(requestLogger())
	router.Use(correlationID())
	router.Use(corsMiddleware())

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Health check
		v1.GET("/health", handlers.Health())

		// Workspace routes
		wsHandler := handlers.NewWorkspaceHandler(cfg.Store, cfg.Orchestrator)
		workspaces := v1.Group("/workspaces")
		{
			workspaces.GET("", wsHandler.List)
			workspaces.POST("", wsHandler.Create)
			workspaces.GET("/:id", wsHandler.Get)
			workspaces.DELETE("/:id", wsHandler.Delete)
			workspaces.POST("/:id/start", wsHandler.Start)
			workspaces.POST("/:id/stop", wsHandler.Stop)
			workspaces.GET("/:id/events", wsHandler.Events)
		}
	}

	return router
}

// requestLogger logs HTTP requests with timing
func requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		slog.Info("HTTP request",
			"method", c.Request.Method,
			"path", path,
			"status", status,
			"latency", latency,
			"correlation_id", c.GetString("correlation_id"),
		)
	}
}

// correlationID adds a correlation ID to each request
func correlationID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Correlation-ID")
		if id == "" {
			id = uuid.New().String()
		}
		c.Set("correlation_id", id)
		c.Header("X-Correlation-ID", id)
		c.Next()
	}
}

// corsMiddleware adds CORS headers for WUI access
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Correlation-ID")
		c.Header("Access-Control-Expose-Headers", "X-Correlation-ID")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
