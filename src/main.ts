import { ArgumentsError } from './errors';
import yargs from 'yargs';

export const run = async (): Promise<void> => {
    console.log('run');
};

export const main = async (args: Array<string>): Promise<void> => {
    const parsedArgs = yargs
        .boolean('verbose')
        .describe('verbose', 'Be verbose')
        .usage('Usage: $0 [...options]')
        .strict()
        .fail((msg: string, err: Error | null, yargs: yargs.Argv): void => {
            /* istanbul ignore next */
            if (err) throw err;
            console.error(yargs.help());
            throw new Error(msg);
        })
        .parse(args);

    const positionalArgs: Array<string> = parsedArgs._;

    if (positionalArgs.length > 1) {
        throw new ArgumentsError('Too many positional arguments');
    }
    await run();
};
