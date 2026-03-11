/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const container = document.getElementById('root');
if (container) {
	const root = createRoot(container);
	root.render(<App />);
}
