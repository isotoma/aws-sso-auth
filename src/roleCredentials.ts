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

    return {
        accessKeyId,
        secretAccessKey,
        sessionToken,
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
