# Workspace Daemon

A Go-based HTTP service that manages workspace lifecycle via Helm and Kubernetes APIs.

## Overview

The workspace daemon provides a REST API for creating, managing, and deleting isolated HLD daemon instances in Kubernetes. Each workspace gets its own pod with isolated SQLite database, PVCs, secrets, and network access.

## Configuration

Configuration is done via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_HTTP_PORT` | 8888 | HTTP server port |
| `WORKSPACE_HTTP_HOST` | 127.0.0.1 | HTTP server host |
| `WORKSPACE_DATABASE_PATH` | ~/.humanlayer/workspace-daemon.db | SQLite database path |
| `WORKSPACE_HELM_CHART_PATH` | ./helm/hld-workspace | Path to Helm chart |
| `WORKSPACE_LOG_LEVEL` | info | Log level (info, debug) |
| `KUBECONFIG` | - | Path to kubeconfig file |

## Development

```bash
# Build the daemon
make build

# Run the daemon
make run

# Run tests
make test

# Run linter
make lint

# Clean build artifacts
make clean
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/health | Health check |

More endpoints will be added in future tickets.
