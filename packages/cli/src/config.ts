import {
  loadConfig,
  GraphQLExtensionDeclaration,
  GraphQLProjectConfig,
  SchemaPointer,
  DocumentPointer,
} from 'graphql-config';
import {CodeFileLoader} from '@graphql-toolkit/code-file-loader';
import {GithubLoader} from '@graphql-toolkit/github-loader';
import {GitLoader} from '@graphql-toolkit/git-loader';

type WithIndex<T> = T & {[key: string]: any};

// Diff
interface DiffCommand {
  command: 'diff';
  schema: SchemaPointer;
  rule?: string[];
}
interface DiffCommandShort {
  diff: Exclude<DiffCommand, 'command'>;
}

// Coverage
interface CoverageCommand {
  command: 'coverage';
  documents?: DocumentPointer;
  write?: string;
  silent?: boolean;
}
interface CoverageCommandShort {
  coverage: Exclude<CoverageCommand, 'command'>;
}

// Similar
interface SimilarCommand {
  command: 'similar';
  name?: string;
  threshold?: number;
  write?: string;
}
interface SimilarCommandShort {
  similar: Exclude<SimilarCommand, 'command'>;
}

// Validate
interface ValidateCommand {
  command: 'validate';
  documents?: DocumentPointer;
  deprecated?: boolean;
  noStrictFragments?: boolean;
  maxDepth?: number;
  apollo?: boolean;
}
interface ValidateCommandShort {
  validate: Exclude<SimilarCommand, 'command'>;
}

type CommandNames = 'diff' | 'coverage' | 'similar' | 'validate';
type CommandsShort =
  | DiffCommandShort
  | CoverageCommandShort
  | SimilarCommandShort
  | ValidateCommandShort;
type Commands =
  | DiffCommand
  | CoverageCommand
  | SimilarCommand
  | ValidateCommand;

interface InspectorExtensionConfigRaw {
  commands:
    | WithIndex<CommandsShort>
    | {
        [name: string]: Commands;
      };
}

interface InspectorExtensionConfig {
  commands: {
    [name: string]: Commands;
  };
}

export interface InspectorConfig {
  schema: GraphQLProjectConfig['schema'];
  documents?: GraphQLProjectConfig['documents'];
  inspector: InspectorExtensionConfig;
}

const supportedCommands: CommandNames[] = [
  'diff',
  'coverage',
  'similar',
  'validate',
];

export function isDiffCommand(command: any): command is DiffCommand {
  return command.command === 'diff';
}

export function isCoverageCommand(command: any): command is CoverageCommand {
  return command.command === 'coverage';
}

export function isSimilarCommand(command: any): command is SimilarCommand {
  return command.command === 'similar';
}

export function isValidateCommand(command: any): command is ValidateCommand {
  return command.command === 'validate';
}

function isCommandName(name: string): name is CommandNames {
  return supportedCommands.includes(name as any);
}

const graphqlInspectorExtension: GraphQLExtensionDeclaration = api => {
  // schema
  api.loaders.schema.register(new GithubLoader());
  api.loaders.schema.register(new GitLoader());
  api.loaders.schema.register(new CodeFileLoader());
  // documents
  api.loaders.documents.register(new CodeFileLoader());

  return {
    name: 'inspector',
  };
};

export function transformProject(
  project: GraphQLProjectConfig,
): InspectorConfig {
  const inspector: InspectorExtensionConfigRaw = project.extension('inspector');
  const commands: InspectorExtensionConfig['commands'] = {};

  for (const name in inspector.commands) {
    const config = inspector.commands[name];

    if (isCommandName(name)) {
      commands[name] = {
        command: name,
        ...config,
      };
    } else {
      commands[name] = config;
    }
  }

  return {
    schema: project.schema,
    documents: project.documents,
    inspector: {
      commands,
    },
  };
}

export async function findAndLoadConfig(filepath?: string) {
  const config = await loadConfig({
    filepath,
    rootDir: process.cwd(),
    throwOnEmpty: true,
    throwOnMissing: true,
    extensions: [graphqlInspectorExtension],
  });

  return config!;
}
