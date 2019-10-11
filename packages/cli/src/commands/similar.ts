import chalk from 'chalk';
import {GraphQLNamedType, GraphQLSchema} from 'graphql';
import indent = require('indent-string');
import * as isValidPath from 'is-valid-path';
import * as figures from 'figures';
import {extname} from 'path';
import {writeFileSync} from 'fs';
import {
  similar as findSimilar,
  getTypePrefix,
  SimilarMap,
  Rating,
} from '@graphql-inspector/core';
import {loadSchema} from '@graphql-inspector/load';

import {Renderer, ConsoleRenderer} from '../render';
import {ensureAbsolute} from '../utils/fs';

export async function runSimilar({
  schema,
  name,
  threshold,
  renderer,
  write,
}: {
  schema: GraphQLSchema;
  renderer: Renderer;
  name: string | undefined;
  threshold: number | undefined;
  write?: string;
}) {
  const shouldWrite = typeof write !== 'undefined';
  const similarMap = findSimilar(schema, name, threshold);

  if (!Object.keys(similarMap).length) {
    renderer.emit('\nNo similar types found');
    return;
  }

  for (const typeName in similarMap) {
    if (similarMap.hasOwnProperty(typeName)) {
      const matches = similarMap[typeName];
      const prefix = getTypePrefix(schema.getType(
        typeName,
      ) as GraphQLNamedType);
      const sourceType = chalk.bold(typeName);
      const name = matches.bestMatch.target.typeId;

      renderer.emit();
      renderer.emit(`${prefix} ${sourceType}`);
      renderer.emit(printResult(name, matches.bestMatch.rating));

      matches.ratings.forEach(match => {
        renderer.emit(printResult(match.target.typeId, match.rating));
      });
    }
  }

  if (shouldWrite) {
    if (typeof write !== 'string' || !isValidPath(write)) {
      throw new Error(`--write is not valid file path: ${write}`);
    }

    const absPath = ensureAbsolute(write);
    const ext = extname(absPath)
      .replace('.', '')
      .toLocaleLowerCase();

    let output: string | undefined = undefined;
    const results = transformMap(similarMap);

    if (ext === 'json') {
      output = outputJSON(results);
    }

    if (output) {
      writeFileSync(absPath, output, {
        encoding: 'utf-8',
      });

      renderer.success('Available at', absPath, '\n');
    } else {
      throw new Error(`Extension ${ext} is not supported`);
    }
  }

  renderer.emit();
}

export async function similar(
  schemaPointer: string,
  name: string | undefined,
  threshold: number | undefined,
  options: {
    require?: string[];
    headers?: Record<string, string>;
    write?: string;
    renderer?: Renderer;
  },
) {
  const renderer = options.renderer || new ConsoleRenderer();

  try {
    const schema = await loadSchema(schemaPointer, {
      headers: options.headers,
    });

    await runSimilar({schema, threshold, renderer, write: options.write, name});
  } catch (e) {
    renderer.error(e.message || e);
    process.exit(1);
  }
}

interface SimilarRecord {
  typename: string;
  rating: number;
}

interface SimilarResults {
  [typename: string]: SimilarRecord[];
}

function transformMap(similarMap: SimilarMap): SimilarResults {
  const results: SimilarResults = {};

  for (const typename in similarMap) {
    if (similarMap.hasOwnProperty(typename)) {
      const result = similarMap[typename];

      results[typename] = [];

      if (result.bestMatch) {
        results[typename].push(trasformResult(result.bestMatch));
      }

      if (result.ratings) {
        results[typename].push(...result.ratings.map(trasformResult));
      }
    }
  }

  return results;
}

function trasformResult(record: Rating): SimilarRecord {
  return {
    typename: record.target.typeId,
    rating: record.rating,
  };
}

function outputJSON(results: SimilarResults): string {
  return JSON.stringify(results);
}

function printResult(name: string, rating: number): string {
  const percentage = chalk.grey(`(${formatRating(rating)}%)`);

  return indent(`${printScale(rating)} ${percentage} ${name}`, 0);
}

function printScale(ratio: number): string {
  const percentage = Math.floor(ratio * 100);
  const levels = [0, 30, 50, 70, 90];

  return levels
    .map(level => percentage >= level)
    .map(enabled => (enabled ? figures.bullet : chalk.gray(figures.bullet)))
    .join('');
}

function formatRating(ratio: number): number {
  return Math.floor(ratio * 100);
}
