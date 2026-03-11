/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatProvider } from './context/ChatContext';
import { ChatView } from './components/ChatView';

export function App() {
	return (
		<ChatProvider>
			<ChatView />
		</ChatProvider>
	);
}
