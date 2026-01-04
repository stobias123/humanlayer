#!/bin/bash
set -euo pipefail

# Workspace Daemon Kubernetes Deploy Script
# Usage: ./deploy.sh [command] [options]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
K8S_DIR="${REPO_ROOT}/k8s/workspace-daemon"

# Default values
NAMESPACE="${NAMESPACE:-humanlayer}"
# Build registry (internal, for buildx to push)
BUILD_REGISTRY="${BUILD_REGISTRY:-registry.registry:5000/workspace-daemon}"
# Deploy registry (external, for k8s nodes to pull)
DEPLOY_REGISTRY="${DEPLOY_REGISTRY:-la-nuc-1:30500/workspace-daemon}"
VERSION_FILE="${SCRIPT_DIR}/VERSION"

# Builder configuration
BUILDER_NAME="${BUILDER_NAME:-la-nuc-1}"
BUILDER_ENDPOINT="${BUILDER_ENDPOINT:-tcp://la-nuc-1.local:31234}"

# Read current version from VERSION file
read_version() {
    if [[ -f "$VERSION_FILE" ]]; then
        cat "$VERSION_FILE" | tr -d '[:space:]'
    else
        echo "0.1.0"
    fi
}

# Increment patch version (0.1.0 -> 0.1.1)
increment_version() {
    local version="$1"
    local major minor patch
    IFS='.' read -r major minor patch <<< "$version"
    patch=$((patch + 1))
    echo "${major}.${minor}.${patch}"
}

# Write version to file
write_version() {
    echo "$1" > "$VERSION_FILE"
}

# Track if TAG was explicitly set (to skip auto-increment)
if [[ -n "${TAG:-}" ]]; then
    TAG_EXPLICIT=1
else
    TAG="v$(read_version)"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check required tools
check_prerequisites() {
    local missing=()

    if ! command -v docker &> /dev/null; then
        missing+=("docker")
    fi

    if ! command -v kubectl &> /dev/null; then
        missing+=("kubectl")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing[*]}"
        exit 1
    fi
}

# Ensure remote buildx builder exists
ensure_builder() {
    if ! docker buildx inspect "${BUILDER_NAME}" &> /dev/null; then
        log_info "Creating remote buildx builder: ${BUILDER_NAME}"
        docker buildx create --name "${BUILDER_NAME}" \
            --driver remote \
            "${BUILDER_ENDPOINT}"
    else
        log_info "Using existing builder: ${BUILDER_NAME}"
    fi
}

# Build Docker image using remote buildx builder
build() {
    ensure_builder

    # Auto-increment version unless TAG was explicitly set
    if [[ -z "${TAG_EXPLICIT:-}" ]]; then
        local current_version
        current_version=$(read_version)
        local new_version
        new_version=$(increment_version "$current_version")
        write_version "$new_version"
        TAG="v${new_version}"
        log_info "Incrementing version: ${current_version} -> ${new_version}"
    else
        log_info "Using explicit tag: ${TAG} (skipping version increment)"
    fi

    log_info "Building Docker image (tag: ${TAG}) using builder: ${BUILDER_NAME}"

    # Build from repo root since Dockerfile copies from parent directories
    docker buildx build \
        --builder "${BUILDER_NAME}" \
        --tag "${BUILD_REGISTRY}:${TAG}" \
        --tag "${BUILD_REGISTRY}:latest" \
        --file "${SCRIPT_DIR}/Dockerfile" \
        --push \
        "${REPO_ROOT}"

    log_info "Build complete"
}

# Push Docker image to registry (for manually pushing locally-built images)
push() {
    log_info "Pushing Docker image to ${BUILD_REGISTRY}"
    docker push "${BUILD_REGISTRY}:${TAG}"
    docker push "${BUILD_REGISTRY}:latest"
    log_info "Push complete"
}

# Deploy to Kubernetes (runs build first)
deploy() {
    log_info "Running build before deploy..."
    build

    log_info "Deploying to Kubernetes (namespace: ${NAMESPACE}, tag: ${TAG})"

    # Apply namespace (uses shared namespace)
    kubectl apply -f "${REPO_ROOT}/k8s/namespace.yaml"

    # Update deployment image tag (use DEPLOY_REGISTRY for k8s nodes to pull)
    local deployment_file="${K8S_DIR}/deployment.yaml"
    local temp_deployment=$(mktemp)
    sed "s|image: .*workspace-daemon.*|image: ${DEPLOY_REGISTRY}:${TAG}|" "$deployment_file" > "$temp_deployment"

    # Apply all k8s resources
    kubectl apply -f "${K8S_DIR}/rbac.yaml"
    kubectl apply -f "${K8S_DIR}/configmap.yaml" -n "${NAMESPACE}"
    kubectl apply -f "${K8S_DIR}/pvc.yaml" -n "${NAMESPACE}"
    kubectl apply -f "$temp_deployment" -n "${NAMESPACE}"
    kubectl apply -f "${K8S_DIR}/service.yaml" -n "${NAMESPACE}"
    kubectl apply -f "${K8S_DIR}/ingress.yaml" -n "${NAMESPACE}"

    rm -f "$temp_deployment"

    log_info "Deployment applied. Waiting for rollout..."

    # Wait for deployment to be ready
    kubectl rollout status deployment/workspace-daemon -n "${NAMESPACE}" --timeout=300s || true

    log_info "Deployment complete (version: ${TAG})"
}

# Delete deployment
destroy() {
    log_info "Destroying Kubernetes deployment (namespace: ${NAMESPACE})"

    read -p "Are you sure you want to delete the deployment? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted"
        exit 0
    fi

    kubectl delete -f "${K8S_DIR}/ingress.yaml" -n "${NAMESPACE}" --ignore-not-found || true
    kubectl delete -f "${K8S_DIR}/deployment.yaml" -n "${NAMESPACE}" --ignore-not-found || true
    kubectl delete -f "${K8S_DIR}/service.yaml" -n "${NAMESPACE}" --ignore-not-found || true
    kubectl delete -f "${K8S_DIR}/configmap.yaml" -n "${NAMESPACE}" --ignore-not-found || true
    kubectl delete -f "${K8S_DIR}/rbac.yaml" --ignore-not-found || true
    # Don't delete PVC by default to preserve data
    log_warn "PVC not deleted (preserves data). Delete manually if needed: kubectl delete -f ${K8S_DIR}/pvc.yaml -n ${NAMESPACE}"

    log_info "Destruction complete"
}

# Get status of deployment
status() {
    log_info "Deployment status for namespace: ${NAMESPACE}"

    echo ""
    echo "=== Pods ==="
    kubectl get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=workspace-daemon -o wide 2>/dev/null || echo "No pods found"

    echo ""
    echo "=== Services ==="
    kubectl get services -n "${NAMESPACE}" -l app.kubernetes.io/name=workspace-daemon 2>/dev/null || echo "No services found"

    echo ""
    echo "=== Deployments ==="
    kubectl get deployments -n "${NAMESPACE}" -l app.kubernetes.io/name=workspace-daemon 2>/dev/null || echo "No deployments found"

    echo ""
    echo "=== Ingress ==="
    kubectl get ingress -n "${NAMESPACE}" -l app.kubernetes.io/name=workspace-daemon 2>/dev/null || echo "No ingress found"
}

# View logs
logs() {
    local follow="${1:-}"

    local follow_flag=""
    if [[ "$follow" == "-f" || "$follow" == "true" ]]; then
        follow_flag="-f"
    fi

    log_info "Fetching logs for workspace-daemon"
    kubectl logs -l "app.kubernetes.io/name=workspace-daemon" -n "${NAMESPACE}" $follow_flag --tail=100
}

# Port forward for local access
port_forward() {
    local local_port="${1:-8888}"

    log_info "Port forwarding workspace-daemon to localhost:${local_port}"
    kubectl port-forward service/workspace-daemon -n "${NAMESPACE}" "${local_port}:8888"
}

# Print usage
usage() {
    cat <<EOF
Workspace Daemon Kubernetes Deploy Script

Usage: $0 [command] [options]

Commands:
    build              Build Docker image (auto-increments version)
    push               Push Docker image to registry
    deploy             Build and deploy to Kubernetes (runs build first)
    destroy            Delete Kubernetes deployment
    status             Show deployment status
    logs [-f]          View logs (use -f to follow)
    port-forward [port] Port forward service (default: 8888)

Environment Variables:
    NAMESPACE          Kubernetes namespace - default: humanlayer
    BUILD_REGISTRY     Registry for buildx push - default: registry.registry:5000/workspace-daemon
    DEPLOY_REGISTRY    Registry for k8s pull - default: la-nuc-1:30500/workspace-daemon
    TAG                Image tag - auto-incremented from VERSION file (can override)
    BUILDER_NAME       Remote buildx builder name - default: la-nuc-1
    BUILDER_ENDPOINT   Remote buildx endpoint - default: tcp://la-nuc-1.local:31234

Files:
    VERSION            Semver version file, auto-incremented on each build

Examples:
    $0 build                      # Build image (increments version)
    $0 deploy                     # Build and deploy (increments version)
    $0 logs -f                    # Follow logs
    $0 port-forward 9999          # Forward to localhost:9999
    TAG=v1.0.0 $0 build           # Build with specific tag (skips increment)

EOF
}

# Main entry point
main() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        build)
            check_prerequisites
            build "$@"
            ;;
        push)
            check_prerequisites
            push "$@"
            ;;
        deploy)
            check_prerequisites
            deploy "$@"
            ;;
        destroy)
            check_prerequisites
            destroy "$@"
            ;;
        status)
            check_prerequisites
            status "$@"
            ;;
        logs)
            check_prerequisites
            logs "$@"
            ;;
        port-forward|pf)
            check_prerequisites
            port_forward "$@"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: ${command}"
            usage
            exit 1
            ;;
    esac
}

main "$@"
