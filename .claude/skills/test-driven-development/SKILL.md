---
name: test-driven-development
description: >
  Red-green-refactor cycle adapted for the VS Code codebase. Write the test first,
  then make it pass, then refactor. Uses describe/test blocks, assert.deepStrictEqual
  for snapshots, and scripts/test.sh runner. Test naming: 'should <behaviour> when
  <scenario>'. Covers happy path, edge cases, and error cases.
  Trigger on: implementing any new function or class, fixing a bug, "write a test
  for", or any TDD request.
---

# Test-Driven Development for Son of Anton

Write the test before the implementation. This forces you to think about the interface, not the implementation, and gives you a working definition of "done".

## Red-Green-Refactor Cycle

### 1. Red — Write a Failing Test

Write the test for the behaviour you want. The test must fail before you write any implementation.

```typescript
// src/vs/workbench/services/myFeature/test/myFeatureService.test.ts

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'mocha';

suite('MyFeatureService', () => {
	suite('findRelated', () => {
		test('should return related files when given a valid file path', async () => {
			// arrange
			const service = new MyFeatureService(/* stub dependencies */);

			// act
			const result = await service.findRelated('/src/vs/workbench/browser/workbench.ts');

			// assert — one deep equality check
			assert.deepStrictEqual(result, {
				files: ['src/vs/workbench/browser/workbench.contribution.ts'],
				durationMs: 0, // stub returns 0
			});
		});
	});
});
```

Run the test and confirm it fails (compilation error or assertion failure):
```bash
npm run compile-check-ts-native
scripts/test.sh --grep "should return related files"
```

### 2. Green — Make the Test Pass

Write the minimum implementation to make the test pass. Do not add features not covered by the current test.

```typescript
// src/vs/workbench/services/myFeature/browser/myFeatureService.ts

export class MyFeatureService implements IMyFeatureService {
	declare readonly _serviceBrand: undefined;

	async findRelated(filePath: string): Promise<FindRelatedResult> {
		// Minimum implementation to pass the test
		return { files: [], durationMs: 0 };
	}
}
```

Run the test and confirm it now passes:
```bash
scripts/test.sh --grep "should return related files"
```

### 3. Refactor — Improve Without Breaking

Now that the test passes, refactor the implementation for clarity and correctness. Run the test after each change to confirm it still passes.

## Test Structure Rules

### File Location

Tests live beside the code they test:
```
src/vs/workbench/services/myFeature/
├── common/
│   └── myFeature.ts          (interface)
├── browser/
│   └── myFeatureService.ts   (implementation)
└── test/
    └── myFeatureService.test.ts
```

### Naming Convention

Test names must follow: `'should <behaviour> when <scenario>'`

```typescript
test('should return empty array when no results found', ...)
test('should throw when file path is invalid', ...)
test('should call FalkorDB with parameterised query when input contains special characters', ...)
```

### Assert Style

Use one `assert.deepStrictEqual` with the full expected shape. Do not write multiple small assertions.

```typescript
// PREFERRED
assert.deepStrictEqual(result, {
	files: ['a.ts', 'b.ts'],
	durationMs: 42,
});

// AVOID — multiple assertions are harder to read and update
assert.strictEqual(result.files.length, 2);
assert.strictEqual(result.files[0], 'a.ts');
assert.strictEqual(result.durationMs, 42);
```

### Three Test Cases Per Function

For every function, write tests for:

1. **Happy path** — valid input, expected output
2. **Edge case** — empty input, boundary values, maximum values
3. **Error case** — invalid input, dependency failure, thrown error

```typescript
suite('findRelated', () => {
	test('should return related files when given a valid TypeScript file path', async () => {
		// happy path
	});

	test('should return empty array when file has no relations in the graph', async () => {
		// edge case — valid path, empty result
	});

	test('should throw ServiceUnavailableError when FalkorDB is unreachable', async () => {
		// error case — dependency failure
		await assert.rejects(
			() => service.findRelated('/src/index.ts'),
			err => err instanceof ServiceUnavailableError
		);
	});
});
```

## Dependency Stubs

Use `TestInstantiationService` for VS Code DI in tests:

```typescript
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

suite('MyFeatureService', () => {
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		// Stub the FalkorDB service dependency
		instantiationService.stub(IFalkorDbService, {
			query: async (_cypher: string) => [],
		});
	});

	teardown(() => {
		instantiationService.dispose();
	});

	test('should return empty array when graph returns no nodes', async () => {
		const service = instantiationService.createInstance(MyFeatureService);
		const result = await service.findRelated('/src/index.ts');
		assert.deepStrictEqual(result, { files: [], durationMs: 0 });
	});
});
```

## Service Tests (Backend)

For `services/<name>/test/`:

```typescript
import * as assert from 'assert';
import request from 'supertest';
import { createApp } from '../src/index.js';

suite('my-service', () => {
	test('should return 200 and suggestions when query is valid', async () => {
		const app = createApp({ falkorDb: stubFalkorDb() });
		const response = await request(app)
			.post('/query')
			.send({ filePath: '/src/index.ts', lineNumber: 5 });

		assert.deepStrictEqual(response.status, 200);
		assert.ok(Array.isArray(response.body.suggestions));
	});
});
```

## Running Tests

```bash
# Mandatory: type-check first
npm run compile-check-ts-native

# Run all unit tests
scripts/test.sh

# Run filtered tests
scripts/test.sh --grep "MyFeatureService"

# Run integration tests
scripts/test-integration.sh
```

Never run tests if there are TypeScript compilation errors.

## TDD Cycle Summary

```
1. Write failing test  →  npm run compile-check-ts-native (expect error or test failure)
2. Implement minimum  →  scripts/test.sh --grep "<test name>" (expect pass)
3. Add edge case test  →  (expect failure)
4. Fix implementation  →  (expect pass)
5. Add error case test  →  (expect failure)
6. Fix implementation  →  (expect pass)
7. Refactor  →  all tests still pass
```
