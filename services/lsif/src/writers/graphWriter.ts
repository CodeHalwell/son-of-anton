// Son of Anton — LSIF Graph Writer
// Writes LSIF/SCIP cross-reference data to FalkorDB, enriching the graph
// created by the Tree-sitter indexer with precise cross-file relationships.

import { FalkorDBClient } from '../clients/falkordb';
import { LsifParseResult, SymbolDefinition, SymbolReference, TypeRelation } from '../parsers/lsifParser';

export class LsifGraphWriter {
	private readonly db: FalkorDBClient;

	constructor(db: FalkorDBClient) {
		this.db = db;
	}

	/**
	 * Write parsed LSIF/SCIP data to the graph.
	 * This enriches existing nodes (created by Tree-sitter) with precise cross-references.
	 */
	async writeParseResult(result: LsifParseResult): Promise<WriteStats> {
		const stats: WriteStats = {
			referencesWritten: 0,
			callsWritten: 0,
			typeRelationsWritten: 0,
			errors: 0,
		};

		// Write REFERENCES and CALLS edges in batches
		const BATCH_SIZE = 1000;

		for (let i = 0; i < result.references.length; i += BATCH_SIZE) {
			const batch = result.references.slice(i, i + BATCH_SIZE);

			// 1. Write REFERENCES edges for the batch
			try {
				await this.db.write(
					`UNWIND $refs AS ref
					MATCH (source:Function)
					WHERE source.file = ref.referenceFile
						AND source.startLine <= ref.referenceLine
						AND source.endLine >= ref.referenceLine
					MATCH (target:Function {name: ref.symbolName})
					WHERE target.file = ref.definitionFile OR ref.definitionFile = ''
					CREATE (source)-[:REFERENCES {line: ref.referenceLine, column: ref.referenceColumn, kind: ref.kind}]->(target)`,
					{ refs: batch }
				);
				stats.referencesWritten += batch.length;
			} catch (err) {
				stats.errors++;
				if (stats.errors <= 10) {
					console.warn('[lsif-writer] Error writing reference batch:', err instanceof Error ? err.message : err);
				}
			}

			// 2. Write CALLS edges for the batch (filtering for kind === 'call')
			const callRefs = batch.filter(ref => ref.kind === 'call');
			if (callRefs.length > 0) {
				try {
					await this.db.write(
						`UNWIND $refs AS ref
						MATCH (caller:Function)
						WHERE caller.file = ref.referenceFile
							AND caller.startLine <= ref.referenceLine
							AND caller.endLine >= ref.referenceLine
						MATCH (called:Function {name: ref.symbolName})
						WHERE called.file = ref.definitionFile OR ref.definitionFile = ''
						MERGE (caller)-[:CALLS {line: ref.referenceLine, column: ref.referenceColumn}]->(called)`,
						{ refs: callRefs }
					);
					stats.callsWritten += callRefs.length;
				} catch (err) {
					stats.errors++;
					if (stats.errors <= 10) {
						console.warn('[lsif-writer] Error writing calls batch:', err instanceof Error ? err.message : err);
					}
				}
			}
		}

		// Write type relations (EXTENDS, IMPLEMENTS) in batches
		const extendsRels = result.typeRelations.filter(rel => rel.relationType === 'extends');
		const implementsRels = result.typeRelations.filter(rel => rel.relationType === 'implements');

		for (let i = 0; i < extendsRels.length; i += BATCH_SIZE) {
			const batch = extendsRels.slice(i, i + BATCH_SIZE);
			try {
				await this.db.write(
					`UNWIND $rels AS rel
					MATCH (child:Class {name: rel.childName}), (parent:Class {name: rel.parentName})
					MERGE (child)-[:EXTENDS]->(parent)`,
					{ rels: batch }
				);
				stats.typeRelationsWritten += batch.length;
			} catch (err) {
				stats.errors++;
			}
		}

		for (let i = 0; i < implementsRels.length; i += BATCH_SIZE) {
			const batch = implementsRels.slice(i, i + BATCH_SIZE);
			try {
				await this.db.write(
					`UNWIND $rels AS rel
					MATCH (child:Class {name: rel.childName}), (iface:Type {name: rel.parentName})
					MERGE (child)-[:IMPLEMENTS]->(iface)`,
					{ rels: batch }
				);
				stats.typeRelationsWritten += batch.length;
			} catch (err) {
				stats.errors++;
			}
		}

		console.log(
			`[lsif-writer] Written: ${stats.referencesWritten} references, ` +
			`${stats.callsWritten} calls, ` +
			`${stats.typeRelationsWritten} type relations, ` +
			`${stats.errors} errors`
		);

		return stats;
	}

}

export interface WriteStats {
	referencesWritten: number;
	callsWritten: number;
	typeRelationsWritten: number;
	errors: number;
}
