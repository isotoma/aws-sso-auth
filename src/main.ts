import { ArgumentsError, MissingSSOConfigError, NoCachedCredentialsError, UnexpectedGetRoleCredentialsOutputError } from './errors';
import yargs from 'yargs';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
import { exec } from 'child_process';
import ini from 'ini';

const fsPromises = fs.promises;
const execPromise = util.promisify(exec);

interface SSOCacheToken {
    readonly accessToken: string;
    readonly expiresAt: Date;
    readonly region: string;
}

interface SSOConfigOptions {
    readonly roleName: string;
    readonly accountId: string;
}

interface Credentials {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken: string;
}

const hasKey = <K extends string>(key: K, obj: {}): obj is { [_ in K]: {} } => {
    return typeof obj === 'object' && key in obj;
};

const readCacheFile = async (filepath: string): Promise<SSOCacheToken | undefined> => {
    if (!filepath.endsWith('.json')) {
        return undefined;
    }
    const content = await fsPromises.readFile(filepath, 'utf8');
    let parsedContent: unknown;
    try {
        parsedContent = JSON.parse(content);
    } catch (err) {
        return undefined;
    }

    if (typeof parsedContent !== 'object') {
        return undefined;
    }

    if (!parsedContent) {
        return undefined;
    }

    if (!hasKey('accessToken', parsedContent)) {
        return undefined;
    }
    if (!hasKey('expiresAt', parsedContent)) {
        return undefined;
    }
    if (!hasKey('region', parsedContent)) {
        return undefined;
    }
    const accessToken: unknown = parsedContent.accessToken;
    const expiresAtRaw: unknown = parsedContent.expiresAt;
    const region: unknown = parsedContent.region;

    if (typeof accessToken !== 'string') {
        return undefined;
    }

    if (typeof region !== 'string') {
        return undefined;
    }

    if (typeof expiresAtRaw !== 'string') {
        return undefined;
    }

    const expiresAtDate = new Date(expiresAtRaw.replace('UTC', 'Z'));

    if (expiresAtDate.toString() === 'InvalidDate' || isNaN(expiresAtDate.getTime())) {
        return undefined;
    }

    return {
        accessToken,
        expiresAt: expiresAtDate,
        region,
    };
};

const reducePromises = async <A, B>(reducer: (b: B, a: A) => Promise<B>, items: Array<A>, initial: B): Promise<B> => {
    let current: B = initial;
    for (const item of items) {
        current = await reducer(current, item);
    }
    return current;
};

const latestCacheFile = async (cacheDirPath: string, filenames: Array<string>): Promise<SSOCacheToken | undefined> => {
    const reducer = async (currentBest: SSOCacheToken | undefined, filename: string): Promise<SSOCacheToken | undefined> => {
        const filepath = path.join(cacheDirPath, filename);
        const read = await readCacheFile(filepath);
        if (typeof read === 'undefined') {
            return currentBest;
        }

        if (typeof currentBest === 'undefined') {
            return read;
        }

        return read.expiresAt.getTime() > currentBest.expiresAt.getTime() ? read : currentBest;
    };
    return await reducePromises(reducer, filenames, undefined);
};

const findLatestCacheFile = async (): Promise<SSOCacheToken | undefined> => {
    const cacheDirPath = path.join(os.homedir(), '.aws/sso/cache/');
    const filenames = await fsPromises.readdir(cacheDirPath);
    return await latestCacheFile(cacheDirPath, filenames);
};

const findSSOConfigFromAWSConfig = async (): Promise<SSOConfigOptions> => {
    const filepath = path.join(os.homedir(), '.aws/config');
    const awsConfig = ini.parse(await fsPromises.readFile(filepath, 'utf8'));
    const sectionName = 'default';

    if (!hasKey(sectionName, awsConfig)) {
        throw new MissingSSOConfigError(`No [${sectionName}] section in ${filepath}`);
    }

    const section: unknown = awsConfig[sectionName];

    if (typeof section !== 'object') {
        throw new MissingSSOConfigError(`Malformed [${sectionName}] section in ${filepath}`);
    }

    if (!section) {
        throw new MissingSSOConfigError(`No [${sectionName}] section in ${filepath}`);
    }

    if (!hasKey('sso_role_name', section)) {
        throw new MissingSSOConfigError(`Missing sso_role_name from [${sectionName}] section in ${filepath}`);
    }
    const roleName = section['sso_role_name'];
    if (typeof roleName !== 'string') {
        throw new MissingSSOConfigError(`Bad type for sso_role_name from [${sectionName}] section in ${filepath}`);
    }

    if (!hasKey('sso_account_id', section)) {
        throw new MissingSSOConfigError(`Missing sso_account_id from [${sectionName}] section in ${filepath}`);
    }
    const accountId = section['sso_account_id'];
    if (typeof accountId !== 'string') {
        throw new MissingSSOConfigError(`Bad type for sso_role_name from [${sectionName}] section in ${filepath}`);
    }

    return {
        roleName,
        accountId,
    };
};

const parseRoleCredentialsOutput = (stdout: string): Credentials => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(stdout);
    } catch {
        throw new UnexpectedGetRoleCredentialsOutputError('Unable to parse output from command');
    }

    if (typeof parsed !== 'object') {
        throw new UnexpectedGetRoleCredentialsOutputError('Unable to parse output from command');
    }

    if (!parsed) {
        throw new UnexpectedGetRoleCredentialsOutputError('Unable to parse output from command');
    }

    if (!hasKey('roleCredentials', parsed)) {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "roleCredentials" in output from command');
    }

    const roleCredentials: unknown = parsed.roleCredentials;

    if (typeof roleCredentials !== 'object') {
        throw new UnexpectedGetRoleCredentialsOutputError('Unexpected value at "roleCredentials" key');
    }

    if (!roleCredentials) {
        throw new UnexpectedGetRoleCredentialsOutputError('Unexpected value at "roleCredentials" key');
    }

    if (!hasKey('accessKeyId', roleCredentials)) {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "accessKeyId" from "roleCredentials" in output');
    }
    const accessKeyId = roleCredentials.accessKeyId;
    if (typeof accessKeyId !== 'string') {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "accessKeyId" from "roleCredentials" in output');
    }

    if (!hasKey('secretAccessKey', roleCredentials)) {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "secretAccessKey" from "roleCredentials" in output');
    }
    const secretAccessKey = roleCredentials.secretAccessKey;
    if (typeof secretAccessKey !== 'string') {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "secretAccessKey" from "roleCredentials" in output');
    }

    if (!hasKey('sessionToken', roleCredentials)) {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "sessionToken" from "roleCredentials" in output');
    }
    const sessionToken = roleCredentials.sessionToken;
    if (typeof sessionToken !== 'string') {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "sessionToken" from "roleCredentials" in output');
    }

    return {
        accessKeyId,
        secretAccessKey,
        sessionToken,
    };
};

const writeCredentialsFile = async (roleCredentials: Credentials): Promise<void> => {
    const credentialsLines = [
        '[default]',
        `aws_access_key_id = ${roleCredentials.accessKeyId}`,
        `aws_secret_access_key = ${roleCredentials.secretAccessKey}`,
        `aws_session_token = ${roleCredentials.sessionToken}`,
        `aws_security_token = ${roleCredentials.sessionToken}`,
        '',
    ];

    const credentialsPath = path.join(os.homedir(), '.aws/credentials');
    await fsPromises.writeFile(credentialsPath, credentialsLines.join('\n'), 'utf8');
};

export const run = async (): Promise<void> => {
    let latestCacheFile = await findLatestCacheFile();

    if (typeof latestCacheFile === 'undefined' || latestCacheFile.expiresAt.getTime() < new Date().getTime()) {
        await execPromise('aws sso login');
        latestCacheFile = await findLatestCacheFile();
    }

    if (typeof latestCacheFile === 'undefined') {
        throw new NoCachedCredentialsError('Unable to retrieve credentials from SSO cache');
    }

    const ssoConfig = await findSSOConfigFromAWSConfig();

    const getRoleCredentialsCmdOutput = await execPromise(
        `aws sso get-role-credentials --role-name "${ssoConfig.roleName}" --account-id "${ssoConfig.accountId}" --access-token "${latestCacheFile.accessToken}" --region "${latestCacheFile.region}"`,
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
