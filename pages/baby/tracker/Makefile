PORT ?= 8765
export BABY_PORT := $(PORT)

.PHONY: up down logs build test lint update

build:
	docker compose build

up:
	docker compose up --build -d --wait
	@echo "Baby tracker: http://localhost:$(PORT)"

down:
	docker compose down

logs:
	docker compose logs -f --tail 100

test:
	uv run pytest

lint:
	uv run ruff check . && uv run mypy babytracker

# Stop, snapshot the DB to backups/, and replace the code from a code-only zip.
#   make update                      (looks for ../baby-tracker-update.zip, then ~/baby-tracker-update.zip)
#   make update ZIP=/path/to.zip UP=1   (UP=1 also rebuilds and starts)
update:
	./update.sh $(ZIP) $(if $(UP),--up)
