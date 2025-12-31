# Build stage
FROM golang:1.24-alpine AS builder

# Install build dependencies (CGO needed for SQLite)
RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /src

# Copy go.mod files first for better caching
COPY hld/go.mod hld/go.sum ./hld/
COPY claudecode-go/go.mod claudecode-go/go.sum ./claudecode-go/

# Download dependencies
WORKDIR /src/hld
RUN go mod download

# Copy source code
WORKDIR /src
COPY hld/ ./hld/
COPY claudecode-go/ ./claudecode-go/

# Build the binary
WORKDIR /src/hld
RUN CGO_ENABLED=1 GOOS=linux go build -o /hld ./cmd/hld

# Runtime stage
FROM alpine:3.19

# Install runtime dependencies including bash, curl, and other tools needed for Claude Code
RUN apk add --no-cache sqlite-libs ca-certificates bash curl unzip libstdc++ libgcc

# Install Node.js for running hlyr MCP server
RUN apk add --no-cache nodejs npm

# Install bun
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/bun && \
    rm -rf /root/.bun

# Install Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash

# Copy and build hlyr CLI (for MCP server) - install to /opt to avoid /src PVC mount
COPY hlyr/ /opt/hlyr/
WORKDIR /opt/hlyr
RUN bun install && bun run build

# Create hlyr wrapper script
RUN echo '#!/bin/sh' > /usr/local/bin/hlyr && \
    echo 'exec node /opt/hlyr/dist/index.js "$@"' >> /usr/local/bin/hlyr && \
    chmod +x /usr/local/bin/hlyr

WORKDIR /

# Create data directory
RUN mkdir -p /data 

# Copy binary from builder
COPY --from=builder /hld /usr/local/bin/hld

EXPOSE 7777

CMD ["hld"]
