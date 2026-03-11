/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

// Build extension host (Node.js)
run({
	platform: 'node',
	entryPoints: {
		'extension': path.join(srcDir, 'extension.ts'),
	},
	srcDir,
	outdir: outDir,
}, process.argv).then(() => {
	// Also build the webview UI (browser)
	const webviewScript = path.join(import.meta.dirname, 'webview-ui', 'esbuild.mjs');
	const args = process.argv.includes('--watch') ? ['--watch'] : [];
	try {
		execFileSync('node', [webviewScript, ...args], {
			stdio: 'inherit',
			cwd: import.meta.dirname,
		});
	} catch {
		console.error('Webview build failed');
		if (!process.argv.includes('--watch')) {
			process.exit(1);
		}
	}
});
