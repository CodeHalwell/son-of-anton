/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Type stub for Microsoft's internal telemetry assignment service (tas-client).
// This module is not available in open-source builds; this stub satisfies type-only imports.

declare module 'tas-client' {
	export interface IExperimentationFilterProvider {
		getFilters(): Map<string, any>;
		getFilterValue(key: string): string | null;
	}

	export interface IExperimentationTelemetry {
		postEvent(eventName: string, props: Map<string, string>): void;
		setSharedProperty(name: string, value: string): void;
	}

	export interface ExperimentationService {
		readonly initializePromise: Promise<void>;
		isCachedFlightEnabled(flight: string): boolean;
		isFlightEnabled(flight: string): Promise<boolean>;
		getTreatmentVariable<T>(configId: string, name: string): T | undefined;
		getTreatmentVariableAsync<T>(configId: string, name: string): Promise<T | undefined>;
	}

	export function getExperimentationService(
		endpoint: string,
		apiKey: string,
		telemetry: IExperimentationTelemetry,
		filters: IExperimentationFilterProvider
	): ExperimentationService;
}
