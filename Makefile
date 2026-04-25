.PHONY: help run build tidy test fmt vet lint migrate-up migrate-down migrate-status docker-up docker-down docker-logs

SHELL := /bin/sh
APP_NAME := gpt2api
BIN_DIR := bin

CONFIG ?= configs/config.yaml
DSN ?= $(shell awk '\
	/^[[:space:]]*mysql:[[:space:]]*$$/ { in_mysql=1; next } \
	in_mysql && /^[^[:space:]]/ { in_mysql=0 } \
	in_mysql && /^[[:space:]]*dsn:[[:space:]]*/ { \
		line = $$0; \
		sub(/^[[:space:]]*dsn:[[:space:]]*/, "", line); \
		sub(/[[:space:]]+#.*$$/, "", line); \
		if (line ~ /^".*"$$/ || line ~ /^'\''.*'\''$$/) { \
			line = substr(line, 2, length(line) - 2); \
		} \
		print line; \
		exit; \
	}\
' $(CONFIG))
GOOSE_DSN ?= $(shell printf '%s\n' "$(DSN)" | awk '\
	$$0 ~ /(^|[?&])multiStatements=/ { print; next } \
	index($$0, "?") { print $$0 "&multiStatements=true"; next } \
	{ print $$0 "?multiStatements=true" }\
')

help:
	@echo "Targets:"
	@echo "  run              - go run cmd/server"
	@echo "  build            - build binary to bin/$(APP_NAME)"
	@echo "  tidy             - go mod tidy"
	@echo "  test             - go test ./..."
	@echo "  fmt              - gofmt -w"
	@echo "  vet              - go vet ./..."
	@echo "  migrate-up       - goose up"
	@echo "  migrate-down     - goose down"
	@echo "  migrate-status   - goose status"
	@echo "  docker-up        - docker compose up -d"
	@echo "  docker-down      - docker compose down"
	@echo "  docker-logs      - docker compose logs -f"

run:
	go run ./cmd/server

build:
	@mkdir -p $(BIN_DIR)
	go build -ldflags "-s -w" -o $(BIN_DIR)/$(APP_NAME) ./cmd/server

tidy:
	go mod tidy

test:
	go test ./...

fmt:
	gofmt -w .

vet:
	go vet ./...

migrate-up:
	goose -allow-missing -dir sql/migrations mysql "$(GOOSE_DSN)" up

migrate-down:
	goose -dir sql/migrations mysql "$(GOOSE_DSN)" down

migrate-status:
	goose -dir sql/migrations mysql "$(GOOSE_DSN)" status

docker-up:
	docker compose -f deploy/docker-compose.yml up -d

docker-down:
	docker compose -f deploy/docker-compose.yml down

docker-logs:
	docker compose -f deploy/docker-compose.yml logs -f
