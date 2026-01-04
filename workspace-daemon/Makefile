.PHONY: build run test lint clean docker-build docker-push k8s-deploy k8s-destroy k8s-status k8s-logs k8s-logs-f k8s-port-forward

# Build the daemon binary
build:
	go build -o workspace-daemon ./cmd/workspace-daemon

# Run the daemon (for development)
run: build
	./workspace-daemon

# Run all tests
test:
	go test ./...

# Run linter
lint:
	@which golangci-lint > /dev/null 2>&1 || echo "golangci-lint not installed, skipping"
	@which golangci-lint > /dev/null 2>&1 && golangci-lint run || true

# Clean build artifacts
clean:
	rm -f workspace-daemon

# Docker/Kubernetes deployment targets
docker-build:
	./deploy.sh build

docker-push:
	./deploy.sh push

k8s-deploy:
	./deploy.sh deploy

k8s-destroy:
	./deploy.sh destroy

k8s-status:
	./deploy.sh status

k8s-logs:
	./deploy.sh logs

k8s-logs-f:
	./deploy.sh logs -f

k8s-port-forward:
	./deploy.sh port-forward 8888
