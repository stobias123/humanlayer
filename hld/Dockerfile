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

# Install runtime dependencies
RUN apk add --no-cache sqlite-libs ca-certificates

# Create non-root user
RUN adduser -D -u 1000 hld

# Create data directory
RUN mkdir -p /data && chown hld:hld /data

# Copy binary from builder
COPY --from=builder /hld /usr/local/bin/hld

USER hld

EXPOSE 7777

CMD ["hld"]
