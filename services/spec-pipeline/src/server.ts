// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import { parseRequirements, parseDesign, parseTasks } from './parser';
import { generateRequirementsMarkdown, generateDesignMarkdown, generateTasksMarkdown } from './generator';
import { generatePropertyTests, generatePropertyTestFile } from './propertyTestGenerator';
import { checkCodeToSpecSync, checkSpecToCodeSync } from './syncChecker';
import { SpecPipelineConfig } from './types';
import { MetricRegistry, prometheusHandler } from '@son-of-anton/lib-metrics';

/**
 * HTTP server for the spec pipeline service.
 * Exposes endpoints for parsing, generating, and syncing specs.
 */
export class SpecPipelineServer {
	private server: http.Server | null = null;
	private readonly config: SpecPipelineConfig;
	private readonly metricRegistry = new MetricRegistry();
	private readonly requestDuration = this.metricRegistry.histogram('http_request_duration_ms', 'HTTP request duration in milliseconds');
	private readonly requestsTotal = this.metricRegistry.counter('http_requests_total', 'Total number of HTTP requests');

	constructor(config: SpecPipelineConfig) {
		this.config = config;
	}

	/**
	 * Start the HTTP server.
	 */
	start(): void {
		this.server = http.createServer(async (req, res) => {
			try {
				await this.handleRequest(req, res);
			} catch (err) {
				console.error('[spec-pipeline] Request error:', err);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Internal server error' }));
			}
		});

		this.server.listen(this.config.server.port, () => {
			console.log(`[spec-pipeline] Listening on port ${this.config.server.port}`);
		});
	}

	/**
	 * Stop the HTTP server.
	 */
	async stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.server) {
				this.server.close(() => resolve());
			} else {
				resolve();
			}
		});
	}

	private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const url = new URL(req.url ?? '/', `http://localhost:${this.config.server.port}`);
		const method = req.method ?? 'GET';
		const start = Date.now();
		res.on('finish', () => {
			const labels = { service: 'spec-pipeline', method, route: url.pathname, status: String(res.statusCode) };
			this.requestDuration.observe(labels, Date.now() - start);
			this.requestsTotal.inc(labels);
		});

		// GET /metrics — Prometheus metrics
		if (method === 'GET' && url.pathname === '/metrics') {
			prometheusHandler(this.metricRegistry)(req, res);
			return;
		}

		// GET /health
		if (method === 'GET' && url.pathname === '/health') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', service: 'spec-pipeline' }));
			return;
		}

		// POST /parse/requirements — parse requirements.md content
		if (method === 'POST' && url.pathname === '/parse/requirements') {
			const body = await readBody(req);
			const spec = parseRequirements(body);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(spec, null, 2));
			return;
		}

		// POST /parse/design — parse design.md content
		if (method === 'POST' && url.pathname === '/parse/design') {
			const body = await readBody(req);
			const spec = parseDesign(body);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(spec, null, 2));
			return;
		}

		// POST /parse/tasks — parse tasks.md content
		if (method === 'POST' && url.pathname === '/parse/tasks') {
			const body = await readBody(req);
			const spec = parseTasks(body);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(spec, null, 2));
			return;
		}

		// POST /generate/requirements — generate requirements.md from JSON spec
		if (method === 'POST' && url.pathname === '/generate/requirements') {
			const body = await readBody(req);
			const spec = JSON.parse(body);
			const markdown = generateRequirementsMarkdown(spec);
			res.writeHead(200, { 'Content-Type': 'text/markdown' });
			res.end(markdown);
			return;
		}

		// POST /generate/design — generate design.md from JSON spec
		if (method === 'POST' && url.pathname === '/generate/design') {
			const body = await readBody(req);
			const spec = JSON.parse(body);
			const markdown = generateDesignMarkdown(spec);
			res.writeHead(200, { 'Content-Type': 'text/markdown' });
			res.end(markdown);
			return;
		}

		// POST /generate/tasks — generate tasks.md from JSON spec
		if (method === 'POST' && url.pathname === '/generate/tasks') {
			const body = await readBody(req);
			const spec = JSON.parse(body);
			const markdown = generateTasksMarkdown(spec);
			res.writeHead(200, { 'Content-Type': 'text/markdown' });
			res.end(markdown);
			return;
		}

		// POST /generate/property-tests — generate property tests from requirements spec
		if (method === 'POST' && url.pathname === '/generate/property-tests') {
			const body = await readBody(req);
			const { spec: requirementsContent, featureName } = JSON.parse(body);
			const spec = parseRequirements(requirementsContent);
			const testFile = generatePropertyTestFile(spec, featureName ?? 'Feature');
			res.writeHead(200, { 'Content-Type': 'text/typescript' });
			res.end(testFile);
			return;
		}

		// POST /sync/code-to-spec — check if a code change affects specs
		if (method === 'POST' && url.pathname === '/sync/code-to-spec') {
			const body = await readBody(req);
			const { changedFilePath, tasksSpec, specDir } = JSON.parse(body);
			const results = checkCodeToSpecSync(changedFilePath, tasksSpec, specDir);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(results, null, 2));
			return;
		}

		// POST /sync/spec-to-code — check if a spec change implies code changes
		if (method === 'POST' && url.pathname === '/sync/spec-to-code') {
			const body = await readBody(req);
			const { changedSpecFile, designSpec, specDir } = JSON.parse(body);
			const results = checkSpecToCodeSync(changedSpecFile, designSpec, specDir);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(results, null, 2));
			return;
		}

		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
	}
}

/**
 * Read the full request body as a string.
 */
function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
		req.on('error', reject);
	});
}
