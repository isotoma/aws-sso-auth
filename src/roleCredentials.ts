import fs from 'fs';
import path from 'path';
import os from 'os';

import { UnexpectedGetRoleCredentialsOutputError } from './errors';
import { hasKey } from './utils';

const fsPromises = fs.promises;

interface Credentials {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken: string;
    readonly expiration: Date;
}

export const parseRoleCredentialsOutput = (stdout: string): Credentials => {
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

    if (!hasKey('expiration', roleCredentials)) {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "expiration" from "roleCredentials" in output');
    }
    const expirationNumber = roleCredentials.expiration;
    if (typeof expirationNumber !== 'number') {
        throw new UnexpectedGetRoleCredentialsOutputError('Missing key "expiration" from "roleCredentials" in output');
    }

    const expiration = new Date(expirationNumber);

    return {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiration,
    };
};

export const writeCredentialsFile = async (roleCredentials: Credentials): Promise<void> => {
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

export const readCredentialsCacheFile = async (): Promise<Credentials | undefined> => {
    const credentialsCachePath = path.join(os.homedir(), '.aws-sso-auth-credentials.json');
    let content;
    try {
        content = await fsPromises.readFile(credentialsCachePath, 'utf8');
    } catch {
        return undefined;
    }

    // TODO: type checking
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return undefined;
    }

    if (typeof parsed !== 'object') {
        return undefined;
    }
    if (!parsed) {
        return undefined;
    }

    if (!hasKey('AccessKeyId', parsed)) {
        return undefined;
    }
    if (!hasKey('SecretAccessKey', parsed)) {
        return undefined;
    }
    if (!hasKey('SessionToken', parsed)) {
        return undefined;
    }
    if (!hasKey('Expiration', parsed)) {
        return undefined;
    }

    const accessKeyId = parsed.AccessKeyId;
    const secretAccessKey = parsed.SecretAccessKey;
    const sessionToken = parsed.SessionToken;
    const expirationIsoString = parsed.Expiration;

    if (typeof accessKeyId !== 'string') {
        return undefined;
    }
    if (typeof secretAccessKey !== 'string') {
        return undefined;
    }
    if (typeof sessionToken !== 'string') {
        return undefined;
    }
    if (typeof expirationIsoString !== 'string') {
        return undefined;
    }

    const creds = {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiration: new Date(Date.parse(expirationIsoString)),
    };

    if (creds.expiration.getTime() < new Date().getTime()) {
        return undefined;
    }
    return creds;
};

const credentialsToJson = (roleCredentials: Credentials): string => {
    return JSON.stringify({
        Version: 1,
        AccessKeyId: roleCredentials.accessKeyId,
        SecretAccessKey: roleCredentials.secretAccessKey,
        SessionToken: roleCredentials.sessionToken,
        Expiration: roleCredentials.expiration.toISOString(),
    });
};

export const printCredentials = (roleCredentials: Credentials): void => {
    console.log(credentialsToJson(roleCredentials));
};

export const writeCredentialsCacheFile = async (roleCredentials: Credentials): Promise<void> => {
    const credentialsCachePath = path.join(os.homedir(), '.aws-sso-auth-credentials.json');
    await fsPromises.writeFile(credentialsCachePath, credentialsToJson(roleCredentials), 'utf8');
};
