# Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the HumanLayer daemon (HLD).

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Docker for building the image

## Files

| File | Description |
|------|-------------|
| `namespace.yaml` | Creates the `humanlayer` namespace |
| `hld-configmap.yaml` | Non-sensitive configuration |
| `hld-secret.yaml.example` | Template for secrets (copy and fill in) |
| `hld-pvc.yaml` | Persistent volume claim for SQLite database |
| `hld-deployment.yaml` | HLD daemon deployment |
| `hld-service.yaml` | ClusterIP service for internal access |

## Quick Start

### 1. Build the Docker image

From the repository root:

```bash
docker build -f hld/Dockerfile -t humanlayer/hld:latest .
```

### 2. Push to your registry

```bash
docker tag humanlayer/hld:latest your-registry/humanlayer/hld:latest
docker push your-registry/humanlayer/hld:latest
```

Update `hld-deployment.yaml` with your image registry.

### 3. Create secrets

```bash
cp hld-secret.yaml.example hld-secret.yaml
# Edit hld-secret.yaml with your actual API keys
```

### 4. Deploy

```bash
kubectl apply -f namespace.yaml
kubectl apply -f hld-configmap.yaml
kubectl apply -f hld-secret.yaml
kubectl apply -f hld-pvc.yaml
kubectl apply -f hld-deployment.yaml
kubectl apply -f hld-service.yaml
```

Or apply all at once:

```bash
kubectl apply -f namespace.yaml
kubectl apply -f .
```

### 5. Verify

```bash
kubectl -n humanlayer get pods
kubectl -n humanlayer logs -f deployment/hld
```

## Accessing the Service

The service is exposed as ClusterIP on port 7777. To access it:

**Port forward (development):**
```bash
kubectl -n humanlayer port-forward svc/hld 7777:7777
curl http://localhost:7777/api/v1/health
```

**From within the cluster:**
```
http://hld.humanlayer.svc.cluster.local:7777
```

**External access:**
Add an Ingress or change the service type to LoadBalancer.

## Configuration

### Environment Variables

Set in `hld-configmap.yaml`:
- `HUMANLAYER_DAEMON_HTTP_PORT` - HTTP port (default: 7777)
- `HUMANLAYER_DAEMON_HTTP_HOST` - Bind address (0.0.0.0 for k8s)
- `HUMANLAYER_DATABASE_PATH` - SQLite database path
- `HUMANLAYER_LOG_LEVEL` - Log level (debug, info, warn, error)
- `HUMANLAYER_API_BASE_URL` - HumanLayer API URL

Set in `hld-secret.yaml`:
- `HUMANLAYER_API_KEY` - Your HumanLayer API key
- `ANTHROPIC_API_KEY` - (optional) For Anthropic proxy
- `OPENROUTER_API_KEY` - (optional) For OpenRouter proxy

## Storage

The deployment uses a 1Gi PersistentVolumeClaim for the SQLite database. Adjust the size in `hld-pvc.yaml` if needed.

**Note:** This deployment runs a single replica due to SQLite's single-writer limitation.
