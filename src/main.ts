import util from 'util';
import { exec } from 'child_process';

import yargs from 'yargs';

import { ArgumentsError, NoCachedCredentialsError, BadAWSCLIVersionError } from './errors';
import { checkCLIVersion } from './checkCLIVersion';
import { getVersionNumber } from './getVersion';
import { findLatestCacheFile } from './cache';
import { findSSOConfigFromAWSConfig } from './ssoConfig';
import { parseRoleCredentialsOutput, writeCredentialsFile, writeCredentialsCacheFile, readCredentialsCacheFile, printCredentials } from './roleCredentials';

const execPromise = util.promisify(exec);

interface RunProps {
    verbose: boolean;
    credentialsProcessOutput: boolean;
}

export const run = async (props: RunProps): Promise<void> => {
    if (!(await checkCLIVersion())) {
        throw new BadAWSCLIVersionError('Need CLI version 2, see https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html, run `aws --version` to inspect version');
    }

    if (props.credentialsProcessOutput) {
        const creds = await readCredentialsCacheFile();
        if (typeof creds !== 'undefined') {
            printCredentials(creds);
            return;
        }
    }

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
    if (props.credentialsProcessOutput) {
        await writeCredentialsCacheFile(roleCredentials);
        printCredentials(roleCredentials);
    } else {
        await writeCredentialsFile(roleCredentials);
    }
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

    if (positionalArgs.length > 2) {
        throw new ArgumentsError('Too many positional arguments');
    }
    const commands = ['credentials-process', 'version'];

    if (positionalArgs.length > 0 && !commands.includes(positionalArgs[0])) {
        throw new ArgumentsError(`Unexpected argument, expected one of ${commands.join(',')}`);
    }

    if (positionalArgs[0] === 'version') {
        console.log(await getVersionNumber());
        return;
    }

    await run({
        verbose: parsedArgs.verbose || false,
        credentialsProcessOutput: positionalArgs[0] === 'credentials-process',
    });
};
