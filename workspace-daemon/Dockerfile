# Build stage
FROM golang:1.24-alpine AS builder

# Install build dependencies (CGO needed for SQLite)
RUN apk add --no-cache gcc musl-dev sqlite-dev make

WORKDIR /src

# Copy go.mod files first for better caching
COPY workspace-daemon/go.mod workspace-daemon/go.sum ./workspace-daemon/

# Download dependencies
WORKDIR /src/workspace-daemon
RUN go mod download

# Copy source code
WORKDIR /src
COPY workspace-daemon/ ./workspace-daemon/

# Build the binary
WORKDIR /src/workspace-daemon
RUN CGO_ENABLED=1 GOOS=linux go build -o /workspace-daemon ./cmd/workspace-daemon

# Runtime stage
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache sqlite-libs ca-certificates bash curl git

# Install Helm
RUN curl -fsSL https://get.helm.sh/helm-v3.14.0-linux-amd64.tar.gz | tar xz && \
    mv linux-amd64/helm /usr/local/bin/helm && \
    rm -rf linux-amd64

# Install kubectl
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/kubectl

WORKDIR /

# Create data directory
RUN mkdir -p /data

# Copy helm chart for workspace deployments
COPY helm/hld-workspace /opt/helm/hld-workspace

# Copy binary from builder
COPY --from=builder /workspace-daemon /usr/local/bin/workspace-daemon

# Default environment variables
ENV WORKSPACE_HTTP_PORT=8888 \
    WORKSPACE_HTTP_HOST=0.0.0.0 \
    WORKSPACE_DATABASE_PATH=/data/workspace-daemon.db \
    WORKSPACE_HELM_CHART_PATH=/opt/helm/hld-workspace \
    WORKSPACE_LOG_LEVEL=info

EXPOSE 8888

CMD ["workspace-daemon"]
