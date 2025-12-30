package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/humanlayer/humanlayer/hld/daemon"
)

func main() {
	// Parse command line flags
	debug := flag.Bool("debug", false, "Enable debug logging")
	httpHost := flag.String("http-host", "", "HTTP server host (overrides HUMANLAYER_DAEMON_HTTP_HOST)")
	httpPort := flag.Int("http-port", 0, "HTTP server port (overrides HUMANLAYER_DAEMON_HTTP_PORT)")
	flag.Parse()

	// Set up structured logging
	level := slog.LevelInfo
	if *debug || os.Getenv("HUMANLAYER_DEBUG") == "true" {
		level = slog.LevelDebug
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: level,
	}))
	slog.SetDefault(logger)

	if level == slog.LevelDebug {
		slog.Debug("debug logging enabled")
	}

	// Apply CLI flag overrides via environment variables
	// This ensures CLI flags take precedence over config file and existing env vars
	if *httpHost != "" {
		if err := os.Setenv("HUMANLAYER_DAEMON_HTTP_HOST", *httpHost); err != nil {
			slog.Warn("failed to set HTTP host from flag", "error", err)
		} else {
			slog.Info("HTTP host set from CLI flag", "host", *httpHost)
		}
	}
	if *httpPort > 0 {
		if err := os.Setenv("HUMANLAYER_DAEMON_HTTP_PORT", fmt.Sprintf("%d", *httpPort)); err != nil {
			slog.Warn("failed to set HTTP port from flag", "error", err)
		} else {
			slog.Info("HTTP port set from CLI flag", "port", *httpPort)
		}
	}

	// Log current PATH environment variable (debug level to avoid test noise)
	if path := os.Getenv("PATH"); path != "" {
		slog.Debug("hld daemon starting with PATH", "path", path)
	} else {
		slog.Debug("hld daemon starting with no PATH environment variable")
	}

	// Create daemon instance
	d, err := daemon.New()
	if err != nil {
		slog.Error("failed to create daemon", "error", err)
		os.Exit(1)
	}

	// Set up signal handling with modern pattern
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Run the daemon
	if err := d.Run(ctx); err != nil {
		slog.Error("daemon error", "error", err)
		os.Exit(1)
	}

	// After first signal, allow force quit on second signal
	stop()
	slog.Info("shutting down gracefully, press Ctrl+C again to force")
	slog.Info("daemon shutdown complete")
}
