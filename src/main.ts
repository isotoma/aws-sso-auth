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
    profile: string | undefined;
    credentialsProcessOutput: boolean;
}

const getLogger = (verbose: boolean): ((msg: string) => void) => {
    return (msg: string): void => {
        if (verbose) {
            console.error('INFO:', msg);
        }
    };
};

export const run = async (props: RunProps): Promise<void> => {
    const log = getLogger(props.verbose);
    log('Starting');

    log('Checking CLI version...');

    if (!(await checkCLIVersion())) {
        throw new BadAWSCLIVersionError('Need CLI version 2, see https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html, run `aws --version` to inspect version');
    }

    log('CLI version OK');

    if (props.credentialsProcessOutput) {
        log('Attempting to retrieve credentials from role credentials cache file');
        const creds = await readCredentialsCacheFile();
        if (typeof creds !== 'undefined') {
            log('Found credentials in role credentials cache file, outputting');
            printCredentials(creds);
            return;
        }
        log('No valid credentials found in role credentials cache file, continuing');
    }

    log('Locating latest SSO cache file...');

    let latestCacheFile = await findLatestCacheFile();

    if (typeof latestCacheFile === 'undefined' || latestCacheFile.expiresAt.getTime() < new Date().getTime()) {
        log('No valid SSO cache file found, running login...');
        await execPromise('aws sso login', {
            env: {
                ...process.env,
                AWS_PROFILE: props.profile || 'default',
            },
        });
        log('Login completed, trying again to retrieve credentials from SSO cache');
        latestCacheFile = await findLatestCacheFile();
    }

    if (typeof latestCacheFile === 'undefined') {
        throw new NoCachedCredentialsError('Unable to retrieve credentials from SSO cache');
    }

    log('Retrieving SSO configuration from AWS config file...');
    const ssoConfig = await findSSOConfigFromAWSConfig(props.profile);
    log('Got SSO configuration');

    log('Using SSO credentials to get role credentials...');
    const getRoleCredentialsCmdOutput = await execPromise(
        `aws sso get-role-credentials --role-name "${ssoConfig.roleName}" --account-id "${ssoConfig.accountId}" --access-token "${latestCacheFile.accessToken}" --region "${latestCacheFile.region}"`,
        {
            env: {
                ...process.env,
                AWS_PROFILE: props.profile || 'default',
            },
        },
    );

    log('Parsing role credentials...');
    const roleCredentials = parseRoleCredentialsOutput(getRoleCredentialsCmdOutput.stdout);
    log('Got role credentials');

    if (props.credentialsProcessOutput) {
        log('Writing role credentials to cache in home directory...');
        await writeCredentialsCacheFile(roleCredentials);
        log('Wrote role credentials');

        log('Printing role credentials for credentials_process');
        printCredentials(roleCredentials);
        log('Printed role credentials');
    } else {
        log('Writing role credentials to AWS credentials file...');
        await writeCredentialsFile(roleCredentials, props.profile);
        log('Wrote role credentials');
    }

    log('Done, exiting cleanly');
};

export const main = async (args: Array<string>): Promise<void> => {
    const parsedArgs = yargs
        .boolean('verbose')
        .describe('verbose', 'Be verbose')
        .string('profile')
        .describe('profile', 'Specify an AWS profile (in ~/.aws/config) to use instead of the default profile')
        .usage('Usage: $0 [...options]')
        .strict()
        .fail((msg: string, err: Error | null, yargs: yargs.Argv): void => {
            /* istanbul ignore next */
            if (err) throw err;
            throw new ArgumentsError(msg);
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
        console.log(getVersionNumber());
        return;
    }

    await run({
        verbose: parsedArgs.verbose || false,
        profile: parsedArgs.profile || undefined,
        credentialsProcessOutput: positionalArgs[0] === 'credentials-process',
    });
};
