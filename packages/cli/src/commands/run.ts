import * as Listr from 'listr';
import chalk from 'chalk';
import {GraphQLSchema, Source as GSource, print} from 'graphql';
import {GraphQLConfig, GraphQLProjectConfig, Source} from 'graphql-config';
import {
  findAndLoadConfig,
  transformProject,
  isDiffCommand,
  isCoverageCommand,
  isValidateCommand,
  isSimilarCommand,
} from '../config';
import {Renderer, ConsoleBufferRenderer, ConsoleRenderer} from '../render';
import {runDiff} from './diff';
import {runCoverage} from './coverage';
import {runValidate} from './validate';
import {runSimilar} from './similar';

function isNonNullable<T>(val: T): val is NonNullable<T> {
  return typeof val !== 'undefined' && val !== null;
}

function pick<T>(
  val: T | null | undefined,
  defaultValue: NonNullable<T>,
): NonNullable<T> {
  return isNonNullable(val) ? val : defaultValue;
}

export async function run(options: {
  renderer?: Renderer;
  config?: string;
  project?: string;
}) {
  const commandRenderer =
    (options && options.renderer) || new ConsoleRenderer();
  const listr = new Listr<{
    config: GraphQLConfig;
    project: GraphQLProjectConfig;
    schema: GraphQLSchema;
    documents?: Source[];
    renderers: Renderer[];
    ok: boolean;
  }>({
    exitOnError: true,
  });

  listr.add({
    title: 'Loading config',
    task: async ctx => {
      ctx.config = await findAndLoadConfig(options.config);
    },
  });

  listr.add({
    title: 'Picking project',
    task: async ctx => {
      ctx.project = options.project
        ? ctx.config.getDefault()
        : ctx.config.getProject(options.project);
    },
  });

  listr.add({
    title: 'Checking for extension',
    task: async ctx => {
      if (!ctx.project.hasExtension('inspector')) {
        throw new Error(
          `You GraphQL Config has no 'inspector' extension: ${ctx.config.filepath}`,
        );
      }
    },
  });

  listr.add({
    title: 'Loading schema',
    task: async ctx => {
      ctx.schema = await ctx.project.getSchema('GraphQLSchema');
    },
  });

  listr.add({
    title: 'Loading documents',
    skip: ctx => !ctx.project.documents,
    task: async ctx => {
      ctx.documents = await ctx.project.getDocuments();
    },
  });

  listr.add({
    title: 'Running commands',
    task: async ctx => {
      const config = transformProject(ctx.project);
      const tasks: Listr.ListrTask[] = [];

      ctx.renderers = [];
      ctx.ok = true;

      for (const taskName in config.inspector.commands) {
        const command = config.inspector.commands[taskName];
        const renderer = new ConsoleBufferRenderer();

        ctx.renderers.push(renderer);

        tasks.push({
          title: `${taskName} - ${command.command}`,
          task: async () => {
            try {
              renderer.emit(
                `\n${chalk.bgBlue.white(' command ')}`,
                chalk.bold(taskName),
              );
              const schema = ctx.schema;

              if (isDiffCommand(command)) {
                const oldSchema = await ctx.project.loadSchema(
                  command.schema,
                  'GraphQLSchema',
                );

                return await runDiff({
                  newSchema: schema,
                  oldSchema,
                  renderer,
                  rule: command.rule,
                });
              }

              if (isCoverageCommand(command)) {
                if (!ctx.documents && !command.documents) {
                  throw new Error('Documents are missing');
                }
                const documents =
                  ctx.documents ||
                  (await ctx.project.loadDocuments(command.documents!));
                return await runCoverage({
                  schema,
                  documents: documents.map(
                    source =>
                      new GSource(print(source.document), source.location),
                  ),
                  renderer,
                  writePath: command.write,
                  silent: pick(command.silent, false),
                });
              }

              if (isValidateCommand(command)) {
                if (!ctx.documents && !command.documents) {
                  throw new Error('Documents are missing');
                }

                const documents =
                  ctx.documents ||
                  (await ctx.project.loadDocuments(command.documents!));

                return await runValidate({
                  schema,
                  documents: documents.map(
                    source =>
                      new GSource(print(source.document), source.location),
                  ),
                  renderer,
                  options: {
                    deprecated: pick(command.deprecated, false),
                    noStrictFragments: pick(command.noStrictFragments, false),
                    apollo: pick(command.apollo, false),
                  },
                });
              }

              if (isSimilarCommand(command)) {
                return await runSimilar({
                  schema,
                  renderer,
                  name: command.name,
                  threshold: command.threshold,
                  write: command.write,
                });
              }

              throw new Error(
                `Command ${(command as any).command} not supported`,
              );
            } catch (error) {
              ctx.ok = false;
              renderer.error(error.message || error);
            }
          },
        });
      }

      return new Listr(tasks, {
        concurrent: true,
      });
    },
  });

  try {
    const {renderers, ok} = await listr.run();

    renderers.forEach(r => {
      if (r.print) {
        r.print();
      }
    });

    if (!ok) {
      throw new Error(`Something went wrong - check the above report`);
    }
  } catch (error) {
    commandRenderer.error(error.message || error);
    commandRenderer.emit('\n');
    process.exit(1);
  }
}
