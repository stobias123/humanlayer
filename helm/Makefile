.PHONY: lint template install upgrade uninstall test

CHART_DIR = hld-workspace
RELEASE_NAME ?= test-workspace
NAMESPACE ?= workspace-test

lint:
	helm lint $(CHART_DIR)

template:
	helm template test $(CHART_DIR) \
		--set workspace.id=test \
		--set workspace.name="Test Workspace"

install:
	helm install $(RELEASE_NAME) $(CHART_DIR) \
		--set workspace.id=test-001 \
		--set workspace.name="Test Workspace"

upgrade:
	helm upgrade $(RELEASE_NAME) $(CHART_DIR) --reuse-values

uninstall:
	helm uninstall $(RELEASE_NAME)

test: lint
	helm install test-chart $(CHART_DIR) \
		--set workspace.id=test \
		--set workspace.name="Test Workspace" \
		--dry-run --debug
