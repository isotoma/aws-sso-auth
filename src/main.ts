import util from 'util';
import { exec } from 'child_process';

import yargs from 'yargs';

import { ArgumentsError, NoCachedCredentialsError } from './errors';
import { findLatestCacheFile } from './cache';
import { findSSOConfigFromAWSConfig } from './ssoConfig';
import { parseRoleCredentialsOutput, writeCredentialsFile } from './roleCredentials';

const execPromise = util.promisify(exec);

export const run = async (): Promise<void> => {
    let latestCacheFile = await findLatestCacheFile();

    if (typeof latestCacheFile === 'undefined' || latestCacheFile.expiresAt.getTime() < new Date().getTime()) {
        await execPromise('aws sso login', {
            env: {
                ...process.env,
                AWS_PROFILE: 'default',
            },
        });
        latestCacheFile = await findLatestCacheFile();
    }

    if (typeof latestCacheFile === 'undefined') {
        throw new NoCachedCredentialsError('Unable to retrieve credentials from SSO cache');
    }

    const ssoConfig = await findSSOConfigFromAWSConfig();

    const getRoleCredentialsCmdOutput = await execPromise(
        `aws sso get-role-credentials --role-name "${ssoConfig.roleName}" --account-id "${ssoConfig.accountId}" --access-token "${latestCacheFile.accessToken}" --region "${latestCacheFile.region}"`,
        {
            env: {
                ...process.env,
                AWS_PROFILE: 'default',
            },
        },
    );

    const roleCredentials = parseRoleCredentialsOutput(getRoleCredentialsCmdOutput.stdout);
    await writeCredentialsFile(roleCredentials);
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
