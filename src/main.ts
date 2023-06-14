import util from 'util';
import { exec } from 'child_process';

import yargs from 'yargs';

import { ArgumentsError, NoCachedCredentialsError, BadAWSCLIVersionError, MisbehavingExpiryDateError } from './errors';
import { checkCLIVersion } from './checkCLIVersion';
import { getVersionNumber } from './getVersion';
import { findLatestCacheFile, SSOCacheToken, deleteCredentialsAndCaches } from './cache';
import { findSSOConfigFromAWSConfig, SSOConfigOptions } from './ssoConfig';
import { parseRoleCredentialsOutput, writeCredentialsFile, writeCredentialsCacheFile, readCredentialsCacheFile, printCredentials } from './roleCredentials';
import { hasKey } from './utils';

const execPromise = util.promisify(exec);

interface RunProps {
    verbose: boolean;
    profile: string | undefined;
    credentialsProcessOutput: boolean;
    force: boolean;
    skipExpiryCheck: boolean;
}

type LogFn = (msg: string) => void;

const getLogger = (verbose: boolean): LogFn => {
    return (msg: string): void => {
        if (verbose) {
            console.error('INFO:', msg);
        }
    };
};

let log: LogFn;

interface GetRoleContext {
    ssoConfig: SSOConfigOptions;
    ssoLoginContext: SSOLoginContext;
}

const runGetRoleCredentialsCmdOutput = async (context: GetRoleContext): Promise<string> => {
    if (typeof context.ssoLoginContext.latestCacheFile === 'undefined') {
        throw new NoCachedCredentialsError('Unable to retrieve credentials from SSO cache');
    }

    try {
        const getRoleCredentialsCmdOutput = await execPromise(
            `aws sso get-role-credentials --role-name "${context.ssoConfig.roleName}" --account-id "${context.ssoConfig.accountId}" --access-token "${context.ssoLoginContext.latestCacheFile.accessToken}" --region "${context.ssoLoginContext.latestCacheFile.region}"`,
            {
                env: {
                    ...process.env,
                    AWS_PROFILE: context.ssoLoginContext.awsProfile || 'default',
                },
            },
        );
        return getRoleCredentialsCmdOutput.stdout;
    } catch (err) {
        if (
            hasKey('stderr', err) &&
            err.stderr &&
            typeof err.stderr === 'string' &&
            err.stderr.trim() === 'An error occurred (UnauthorizedException) when calling the GetRoleCredentials operation: Session token not found or invalid'
        ) {
            throw new MisbehavingExpiryDateError('Expiry date is in the future, but the credentials appear to have expired');
        }
        throw err;
    }
};

interface SSOLoginContext {
    haveRunSsoLogin: boolean;
    latestCacheFile: SSOCacheToken | undefined;
    awsProfile: string | undefined;
}

const runSsoLogin = async (context: SSOLoginContext): Promise<void> => {
    log('No valid SSO cache file found, running login...');
    await execPromise('aws sso login', {
        env: {
            ...process.env,
            AWS_PROFILE: context.awsProfile || 'default',
        },
    });
    context.haveRunSsoLogin = true;

    log('Login completed, trying again to retrieve credentials from SSO cache');
    context.latestCacheFile = await findLatestCacheFile();
};

export const run = async (props: RunProps): Promise<void> => {
    log = getLogger(props.verbose);

    log('Starting');

    log(`Application version: ${getVersionNumber()}`);

    log('Checking CLI version...');

    if (!(await checkCLIVersion())) {
        throw new BadAWSCLIVersionError('Need CLI version 2, see https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html, run `aws --version` to inspect version');
    }

    log('CLI version OK');

    if (props.force) {
        log('Deleting credentials, and SSO and CLI caches');
        await deleteCredentialsAndCaches();
    }

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

    const ssoLoginContext: SSOLoginContext = {
        haveRunSsoLogin: false,
        latestCacheFile: await findLatestCacheFile(),
        awsProfile: props.profile,
    };

    if (props.skipExpiryCheck || typeof ssoLoginContext.latestCacheFile === 'undefined' || ssoLoginContext.latestCacheFile.expiresAt.getTime() < new Date().getTime()) {
        await runSsoLogin(ssoLoginContext);
    }

    log('Retrieving SSO configuration from AWS config file...');
    const ssoConfig = await findSSOConfigFromAWSConfig(props.profile);
    log('Got SSO configuration');

    log('Using SSO credentials to get role credentials...');

    let roleCredentialsOutput: string;
    const getRoleContext = {
        ssoConfig,
        ssoLoginContext,
    };
    try {
        roleCredentialsOutput = await runGetRoleCredentialsCmdOutput(getRoleContext);
    } catch (err) {
        if (err instanceof MisbehavingExpiryDateError) {
            if (ssoLoginContext.haveRunSsoLogin) {
                throw err;
            } else {
                log('Expiry date appears to be deceptive, running login...');
                await runSsoLogin(ssoLoginContext);
                log('Again using SSO credentials to get role credentials...');
                roleCredentialsOutput = await runGetRoleCredentialsCmdOutput(getRoleContext);
            }
        } else {
            throw err;
        }
    }

    log('Parsing role credentials...');
    const roleCredentials = parseRoleCredentialsOutput(roleCredentialsOutput);
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
        .boolean('force')
        .describe('force', 'Delete all credential and cache files before authenticating')
        .boolean('skip-expiry-check')
        .describe('skip-expiry-check', 'Do not check expiry of existing credentials, always reauthenticate')
        .usage('Usage: $0 [...options]')
        .strict()
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .fail((msg: string, err: Error | null, yargsObj: yargs.Argv): void => {
            /* istanbul ignore next */
            if (err) throw err;
            throw new ArgumentsError(msg);
        })
        .parse(args);

    const positionalArgs: Array<string> = parsedArgs._.map((arg: string | number): string => `${arg}`);

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
        skipExpiryCheck: !!parsedArgs.skipExpiryCheck,
        force: !!parsedArgs.force,
        credentialsProcessOutput: positionalArgs[0] === 'credentials-process',
    });
};
