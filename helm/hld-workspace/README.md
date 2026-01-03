# HLD Workspace Helm Chart

Deploys an isolated HLD daemon instance for Claude Code development.

## Installation

```bash
helm install my-workspace ./hld-workspace \
  --set workspace.id=dev-001 \
  --set workspace.name="Development Workspace" \
  --set secrets.humanlayerApiKey=hl_xxx \
  --set git.enabled=true \
  --set git.ghToken=ghp_xxx \
  --set git.userName="Your Name" \
  --set git.userEmail=you@example.com
```

## Configuration

See `values.yaml` for all available options.

### Required Values

- `workspace.id` - Unique identifier (lowercase alphanumeric and hyphens)
- `workspace.name` - Human-readable name

### Git Configuration

Enable gh CLI authentication:

```bash
--set git.enabled=true \
--set git.ghToken=ghp_xxx \
--set git.userName="Your Name" \
--set git.userEmail=you@example.com
```

### Starting/Stopping

Stop workspace (keeps data):
```bash
helm upgrade my-workspace . --reuse-values --set state.running=false
```

Start workspace:
```bash
helm upgrade my-workspace . --reuse-values --set state.running=true
```

## Uninstallation

```bash
helm uninstall my-workspace
```

This will delete all Kubernetes resources including PVCs (data loss).
