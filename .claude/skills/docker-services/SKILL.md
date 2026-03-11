---
name: docker-services
description: >
  Manage the Son of Anton Docker Compose stack with 17 services. Use when starting,
  stopping, debugging, or adding services. Triggers on: docker compose commands, service
  health checks, container logs, adding new services, or any mention of "docker", "compose",
  "service", "container", "falkordb", "qdrant", "mcp-gateway", or service names.
---

# Docker Services Management

## Quick Reference

```bash
# Start all backend services
docker compose up -d

# Check service health
docker compose ps

# View logs for a specific service
docker compose logs -f <service-name>

# Tear down and remove all data
docker compose down -v

# Test FalkorDB
docker compose exec falkordb redis-cli GRAPH.QUERY son-of-anton "RETURN 1"

# Test Qdrant
curl http://localhost:6333/readyz
```

## Service Map

| Service | Port | Purpose |
|---------|------|---------|
| falkordb | 6379 | Graph database (code structure, AST, call graphs) |
| qdrant | 6333/6334 | Vector database (semantic code search) |
| indexer | 8080 | Tree-sitter code indexing into FalkorDB + Qdrant |
| lsif | 8081 | LSIF/SCIP language server indexing |
| mcp-gateway | 3100 | MCP server gateway for agent tool access |
| mcp-database | 3102 | MCP server for database operations |
| mcp-deployment | 3103 | MCP server for deployment operations |
| mcp-tickets | 3104 | MCP server for ticket/issue management |
| mcp-playwright | 3105 | MCP server for browser automation |
| model-router | 3200 | Routes LLM requests to appropriate model |
| checkpoints | 3201 | Git checkpoint management |
| walkthrough | 3202 | Code walkthrough generation |
| acp-client | 3300 | Agent Communication Protocol client |
| build-dag | 3301 | Build dependency graph |
| context-sanitiser | 3302 | Context sanitisation for LLM prompts |
| penetration-tester | 8092 | OWASP ZAP integration for security testing |
| owasp-zap | 8090 | OWASP ZAP daemon |
| spec-pipeline | 8090 | Specification pipeline |
| background-tasks | 8093 | Background task execution |
| visual-regression | 8094 | Visual regression testing |

## Adding a New Service

1. Create `services/<service-name>/` with Dockerfile, package.json, and health endpoint
2. Add service definition to `docker-compose.yml`
3. Include health check configuration
4. Add to the service map above
5. This is a **Tier 1** change (new files alongside core)

## Debugging

```bash
# Check which services are unhealthy
docker compose ps --format "table {{.Name}}\t{{.Status}}"

# Restart a specific service
docker compose restart <service-name>

# Rebuild after code changes
docker compose build <service-name> && docker compose up -d <service-name>

# Check resource usage
docker compose stats
```
