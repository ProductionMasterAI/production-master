.DEFAULT_GOAL := help

.PHONY: help install update uninstall build test lint dev clean agent\:check

help: ## Show this help
	@grep -E '^[a-zA-Z_:\\-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (clean, lockfile-driven)
	npm ci

update: ## Update to latest main and reinstall dependencies
	git pull --ff-only
	npm ci

uninstall: ## Remove installed dependencies and build artifacts
	rm -rf node_modules packages/*/node_modules packages/*/dist

build: ## Build all workspaces
	npm run build

test: ## Run the test suite
	npm test

lint: ## Lint all workspaces
	npm run lint

dev: ## Start development mode
	npm run dev --workspaces --if-present

clean: ## Remove build artifacts and caches
	npm run clean
	rm -rf node_modules/.cache

agent\:check: ## Verify AI-agent adapters reference AGENTS.md
	bash scripts/check-agent-drift.sh
