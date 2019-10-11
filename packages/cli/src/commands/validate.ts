import {
  validate as validateDocuments,
  InvalidDocument,
} from '@graphql-inspector/core';
import {loadSchema, loadDocuments} from '@graphql-inspector/load';
import {Source, GraphQLSchema} from 'graphql';

import {
  Renderer,
  ConsoleRenderer,
  renderInvalidDocument,
  renderDeprecatedUsageInDocument,
} from '../render';

export async function runValidate({
  documents,
  schema,
  renderer,
  options,
}: {
  documents: Source[];
  schema: GraphQLSchema;
  renderer: Renderer;
  options: {
    deprecated: boolean;
    noStrictFragments: boolean;
    apollo?: boolean;
    keepClientFields?: boolean;
    maxDepth?: number;
  };
}) {
  const invalidDocuments = validateDocuments(schema, documents, {
    strictFragments: !options.noStrictFragments,
    maxDepth: options.maxDepth || undefined,
    apollo: options.apollo || false,
    keepClientFields: options.keepClientFields || false,
  });

  if (!invalidDocuments.length) {
    renderer.success('All documents are valid');
    return;
  }

  const errorsCount = countErrors(invalidDocuments);
  const deprecated = countDeprecated(invalidDocuments);

  if (errorsCount) {
    renderer.emit(
      `\nDetected ${errorsCount} invalid document${
        errorsCount > 1 ? 's' : ''
      }:\n`,
    );

    invalidDocuments.forEach(doc => {
      if (doc.errors.length) {
        renderer.emit(...renderInvalidDocument(doc));
      }
    });
  } else if (!options.deprecated) {
    renderer.success('All documents are valid');
  }

  if (deprecated) {
    renderer.emit(
      `\nDetected ${deprecated} document${
        deprecated > 1 ? 's' : ''
      } with deprecated fields:\n`,
    );

    invalidDocuments.forEach(doc => {
      if (doc.deprecated.length) {
        renderer.emit(
          ...renderDeprecatedUsageInDocument(doc, options.deprecated),
        );
      }
    });
  }

  if (errorsCount || (deprecated && options.deprecated)) {
    throw new Error('Some documents are invalid');
  }
}

export async function validate(
  documentsPointer: string,
  schemaPointer: string,
  options: {
    require?: string[];
    deprecated: boolean;
    noStrictFragments: boolean;
    apollo?: boolean;
    keepClientFields?: boolean;
    maxDepth?: number;
    renderer?: Renderer;
    headers?: Record<string, string>;
  },
) {
  const renderer = options.renderer || new ConsoleRenderer();

  try {
    const schema = await loadSchema(schemaPointer, {
      headers: options.headers,
    });
    const documents = await loadDocuments(documentsPointer);

    await runValidate({
      schema,
      documents,
      renderer,
      options,
    });
  } catch (e) {
    renderer.error(e.message || e);
    process.exit(1);
  }
}

function countErrors(invalidDocuments: InvalidDocument[]): number {
  if (invalidDocuments.length) {
    return invalidDocuments.filter(doc => doc.errors && doc.errors.length)
      .length;
  }

  return 0;
}

function countDeprecated(invalidDocuments: InvalidDocument[]): number {
  if (invalidDocuments.length) {
    return invalidDocuments.filter(
      doc => doc.deprecated && doc.deprecated.length,
    ).length;
  }

  return 0;
}
