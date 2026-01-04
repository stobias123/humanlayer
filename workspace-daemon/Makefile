.PHONY: build run test lint clean

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
