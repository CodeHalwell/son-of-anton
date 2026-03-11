/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Builds the React webview UI into dist/webview/.
 * Produces index.js (single bundle) and index.css.
 *
 * Usage:
 *   node webview-ui/esbuild.mjs           # one-shot build
 *   node webview-ui/esbuild.mjs --watch   # watch mode
 */

import * as esbuild from 'esbuild';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.resolve(__dirname, '..', 'dist', 'webview');

const buildOptions = {
	entryPoints: [path.join(__dirname, 'src', 'index.tsx')],
	bundle: true,
	minify: true,
	sourcemap: true,
	target: ['es2022'],
	format: 'iife',
	outdir,
	entryNames: 'index',
	jsx: 'automatic',
	loader: {
		'.tsx': 'tsx',
		'.ts': 'ts',
		'.css': 'css',
	},
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
	},
	logLevel: 'info',
};

const isWatch = process.argv.includes('--watch');

if (isWatch) {
	const ctx = await esbuild.context(buildOptions);
	await ctx.watch();
	console.log('Watching webview-ui for changes...');
} else {
	await esbuild.build(buildOptions);
}
