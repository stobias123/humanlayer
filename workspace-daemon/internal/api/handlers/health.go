package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/humanlayer/humanlayer/workspace-daemon/internal/version"
)

// HealthResponse represents the health check response
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// Health returns a health check handler
func Health() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, HealthResponse{
			Status:  "ok",
			Version: version.GetVersion(),
		})
	}
}
