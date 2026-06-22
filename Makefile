# NV-Agent — Makefile
# Usage: make <target>
# Run `make help` to see all available targets.

# ── Config ───────────────────────────────────────────────────
PYTHON       ?= python
PIP          ?= pip
DOCKER       ?= docker
IMAGE_NAME   ?= nv-agent
IMAGE_TAG    ?= latest
PORT         ?= 8000
HOST         ?= 0.0.0.0

# ── Colors ───────────────────────────────────────────────────
BLUE  := \033[0;34m
GREEN := \033[0;32m
BOLD  := \033[1m
RESET := \033[0m

# ── Phony targets ────────────────────────────────────────────
.PHONY: help install install-dev lint format test test-cov \
        typecheck run run-dev docker-build docker-run docker-stop \
        compose-up compose-down compose-reset compose-logs compose-ps \
        clean

# ── Default ──────────────────────────────────────────────────
help: ## Show this help
	@echo "$(BOLD)NV-Agent — Available targets$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(BLUE)%-18s$(RESET) %s\n", $$1, $$2}'

# ── Setup ────────────────────────────────────────────────────
install: ## Install runtime dependencies
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

install-dev: ## Install runtime + dev dependencies
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt
	$(PIP) install -r requirements-dev.txt

# ── Linting & Formatting ─────────────────────────────────────
lint: ## Run all linters (flake8, ruff, pylint)
	@echo "$(BOLD)Running flake8...$(RESET)"
	@flake8 . --exclude=.venv,venv,build,dist --count --select=E9,F63,F7 --show-source --statistics
	@flake8 . --exclude=.venv,venv,build,dist --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
	@echo "$(BOLD)Running ruff...$(RESET)"
	@ruff check . --exit-zero
	@echo "$(BOLD)Running pylint...$(RESET)"
	@pylint $(shell git ls-files '*.py') --rcfile=.pylintrc --exit-zero 2>/dev/null || true
	@echo "$(GREEN)Lint complete.$(RESET)"

format: ## Auto-format code with ruff
	ruff format .
	ruff check --fix .
	@echo "$(GREEN)Format complete.$(RESET)"

# ── Testing ──────────────────────────────────────────────────
test: ## Run all tests
	$(PYTHON) -m pytest tests/ -v

test-cov: ## Run tests with coverage report
	$(PYTHON) -m pytest tests/ -v --cov=. --cov-report=term-missing --cov-report=html

test-quick: ## Run tests (fail fast, no verbose output)
	$(PYTHON) -m pytest tests/ -x -q

# ── Type Checking ─────────────────────────────────────────────
typecheck: ## Run mypy type checking
	$(PYTHON) -m mypy . --ignore-missing-imports

# ── Run the Server ───────────────────────────────────────────
run: ## Run the production server
	$(PYTHON) main.py

run-dev: ## Run with auto-reload (uvicorn --reload)
	$(PYTHON) -m uvicorn chat.app:create_app --factory \
		--host $(HOST) --port $(PORT) --reload

# ── Docker ───────────────────────────────────────────────────
docker-build: ## Build the Docker image
	$(DOCKER) build -t $(IMAGE_NAME):$(IMAGE_TAG) .

docker-run: ## Run the Docker container (needs .env)
	$(DOCKER) run -d --name $(IMAGE_NAME) \
		-p $(PORT):8000 \
		--env-file .env \
		-v $(IMAGE_NAME)-data:/app/data \
		-v $(IMAGE_NAME)-index:/app/kb/index \
		$(IMAGE_NAME):$(IMAGE_TAG)

docker-stop: ## Stop and remove the Docker container
	-$(DOCKER) stop $(IMAGE_NAME) 2>/dev/null
	-$(DOCKER) rm $(IMAGE_NAME) 2>/dev/null

docker-logs: ## Follow Docker container logs
	$(DOCKER) logs -f $(IMAGE_NAME)

docker-test: docker-stop docker-build ## Build & run container, test health, then stop
	@echo "$(BOLD)Starting container...$(RESET)"
	$(DOCKER) run -d --name $(IMAGE_NAME)-test -p 8001:8000 \
		-e NVIDIA_API_KEY=nvapi-test $(IMAGE_NAME):$(IMAGE_TAG)
	@sleep 3
	@echo "$(BOLD)Health check...$(RESET)"
	@curl -sf http://localhost:8001/api/health && echo " $(GREEN)✓ OK$(RESET)" || echo " $(RED)✗ FAIL$(RESET)"
	@echo "$(BOLD)Stopping container...$(RESET)"
	-$(DOCKER) stop $(IMAGE_NAME)-test >/dev/null 2>&1
	-$(DOCKER) rm $(IMAGE_NAME)-test >/dev/null 2>&1

# ── Docker Compose ───────────────────────────────────────────
compose-up: ## Start all services (rebuilds image first to pick up code/UI changes)
	$(DOCKER) compose up -d --build

compose-down: ## Stop all services
	$(DOCKER) compose down

compose-reset: ## Stop, remove volumes, and restart clean (all services)
	$(DOCKER) compose down -v
	$(DOCKER) compose up -d --build

compose-logs: ## Follow compose logs
	$(DOCKER) compose logs -f

compose-ps: ## List compose services
	$(DOCKER) compose ps

# ── Cleanup ──────────────────────────────────────────────────
clean: ## Remove caches, temp files, and build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
	rm -rf htmlcov/ .coverage coverage.xml
	@echo "$(GREEN)Clean complete.$(RESET)"

# ── CI (run everything) ──────────────────────────────────────
ci: lint test typecheck ## Run the full CI pipeline locally
	@echo "$(GREEN)$(BOLD)All CI checks passed!$(RESET)"

# ── Smoke tests ──────────────────────────────────────────────
smoke: test docker-test ## Quick smoke test: unit tests + Docker health check
