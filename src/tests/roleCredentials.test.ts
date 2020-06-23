import os from 'os';
import fs from 'fs';
import path from 'path';

import mockfs from 'mock-fs';

import { parseRoleCredentialsOutput, readCredentialsCacheFile, printCredentials, writeCredentialsCacheFile } from '../roleCredentials';
import { UnexpectedGetRoleCredentialsOutputError } from '../errors';

describe('parseRoleCredentialsOutput', () => {
    test('valid', () => {
        const input = [
            '{',
            '  "roleCredentials": {',
            '    "accessKeyId": "my_access_key_id",',
            '    "secretAccessKey": "my_secret_access_key",',
            '    "sessionToken": "my_session_token",',
            '    "expiration": 1577881800000',
            '  }',
            '}',
        ].join('\n');

        const creds = parseRoleCredentialsOutput(input);
        expect(creds).toEqual({
            accessKeyId: 'my_access_key_id',
            secretAccessKey: 'my_secret_access_key',
            sessionToken: 'my_session_token',
            expiration: new Date(2020, 0, 1, 12, 30, 0),
        });
    });

    test('not json', () => {
        const input = 'not json';
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('not object', () => {
        const input = '1';
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('null json', () => {
        const input = 'null';
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('no roleCredentials key', () => {
        const input = '{}';
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials not an object', () => {
        const input = '{"roleCredentials": 123}';
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials is null', () => {
        const input = '{"roleCredentials": null}';
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials accessKeyId missing', () => {
        const input = ['{', '  "roleCredentials": {', '    "secretAccessKey": "my_secret_access_key",', '    "sessionToken": "my_session_token",', '    "expiration": 1577881800000', '  }', '}'].join(
            '\n',
        );
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials accessKeyId not string', () => {
        const input = [
            '{',
            '  "roleCredentials": {',
            '    "accessKeyId": 123,',
            '    "secretAccessKey": "my_secret_access_key",',
            '    "sessionToken": "my_session_token",',
            '    "expiration": 1577881800000',
            '  }',
            '}',
        ].join('\n');
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials secretAccessKey missing', () => {
        const input = ['{', '  "roleCredentials": {', '    "accessKeyId": "my_access_key_id",', '    "sessionToken": "my_session_token",', '    "expiration": 1577881800000', '  }', '}'].join('\n');
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials secretAccessKey not string', () => {
        const input = [
            '{',
            '  "roleCredentials": {',
            '    "accessKeyId": "my_access_key_id",',
            '    "secretAccessKey": 123,',
            '    "sessionToken": "my_session_token",',
            '    "expiration": 1577881800000',
            '  }',
            '}',
        ].join('\n');
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials sessionToken missing', () => {
        const input = ['{', '  "roleCredentials": {', '    "accessKeyId": "my_access_key_id",', '    "secretAccessKey": "my_secret_access_key",', '    "expiration": 1577881800000', '  }', '}'].join(
            '\n',
        );
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials sessionToken not string', () => {
        const input = [
            '{',
            '  "roleCredentials": {',
            '    "accessKeyId": "my_access_key_id",',
            '    "secretAccessKey": "my_secret_access_key",',
            '    "sessionToken": 123,',
            '    "expiration": 1577881800000',
            '  }',
            '}',
        ].join('\n');
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials expiration missing', () => {
        const input = [
            '{',
            '  "roleCredentials": {',
            '    "accessKeyId": "my_access_key_id",',
            '    "secretAccessKey": "my_secret_access_key",',
            '    "sessionToken": "my_session_token"',
            '  }',
            '}',
        ].join('\n');
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });

    test('roleCredentials expiration not number', () => {
        const input = [
            '{',
            '  "roleCredentials": {',
            '    "accessKeyId": "my_access_key_id",',
            '    "secretAccessKey": "my_secret_access_key",',
            '    "sessionToken": "my_session_token",',
            '    "expiration": "not number"',
            '  }',
            '}',
        ].join('\n');
        expect(() => parseRoleCredentialsOutput(input)).toThrow(UnexpectedGetRoleCredentialsOutputError);
    });
});

describe('readCredentialsCacheFile', () => {
    afterEach(() => {
        mockfs.restore();
    });

    test('readCredentialsCacheFile', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "SessionToken": "my_session_token",',
                '  "Expiration": "3020-01-01T12:30:00.000Z"', // happy to conclude this will always be in the future
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toEqual({
            accessKeyId: 'my_access_key_id',
            secretAccessKey: 'my_secret_access_key',
            sessionToken: 'my_session_token',
            expiration: new Date(3020, 0, 1, 12, 30, 0),
        });
    });

    test('no file', async () => {
        mockfs({});

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('not json', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: 'not json',
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('not object', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: '1',
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('null', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: 'null',
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('no AccessKeyId', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "SessionToken": "my_session_token",',
                '  "Expiration": "3020-01-01T12:30:00.000Z"',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('no SecretAccessKey', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SessionToken": "my_session_token",',
                '  "Expiration": "3020-01-01T12:30:00.000Z"',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('no SessionToken', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "Expiration": "3020-01-01T12:30:00.000Z"',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('no Expiration', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "SessionToken": "my_session_token"',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('AccessKeyId not string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": 123,',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "SessionToken": "my_session_token",',
                '  "Expiration": "3020-01-01T12:30:00.000Z"',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('SecretAccessKey not string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SecretAccessKey": 123,',
                '  "SessionToken": "my_session_token",',
                '  "Expiration": "3020-01-01T12:30:00.000Z"',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('SessionToken not string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "SessionToken": 123,',
                '  "Expiration": "3020-01-01T12:30:00.000Z"',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('Expiration not string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "SessionToken": "my_session_token",',
                '  "Expiration": 123',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('Expiration not valid iso date', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "SessionToken": "my_session_token",',
                '  "Expiration": "this is not a valid ISO date"',
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });

    test('Expiration in the past', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws-sso-auth-credentials.json')]: [
                '{',
                '  "AccessKeyId": "my_access_key_id",',
                '  "SecretAccessKey": "my_secret_access_key",',
                '  "SessionToken": "my_session_token",',
                '  "Expiration": "1020-01-01T12:30:00.000Z"', // This is always in the past
                '}',
            ].join('\n'),
        });

        expect(await readCredentialsCacheFile()).toBeUndefined();
    });
});

describe('printCredentials', () => {
    test('printCredentials', () => {
        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        printCredentials({
            accessKeyId: 'my_access_key_id',
            secretAccessKey: 'my_secret_access_key',
            sessionToken: 'my_session_token',
            expiration: new Date(2020, 0, 1, 12, 30, 0),
        });

        const expected = [
            '{',
            '"Version":1,',
            '"AccessKeyId":"my_access_key_id",',
            '"SecretAccessKey":"my_secret_access_key",',
            '"SessionToken":"my_session_token",',
            '"Expiration":"2020-01-01T12:30:00.000Z"',
            '}',
        ].join('');

        expect(consoleLogSpy).toHaveBeenCalledWith(expected);
    });
});

describe('writeCredentialsCacheFile', () => {
    afterEach(() => {
        mockfs.restore();
    });

    test('writeCredentialsCacheFile', async () => {
        mockfs({});

        await writeCredentialsCacheFile({
            accessKeyId: 'my_access_key_id',
            secretAccessKey: 'my_secret_access_key',
            sessionToken: 'my_session_token',
            expiration: new Date(2020, 0, 1, 12, 30, 0),
        });

        const expected = [
            '{',
            '"Version":1,',
            '"AccessKeyId":"my_access_key_id",',
            '"SecretAccessKey":"my_secret_access_key",',
            '"SessionToken":"my_session_token",',
            '"Expiration":"2020-01-01T12:30:00.000Z"',
            '}',
        ].join('');

        const expectedPath = path.join(os.homedir(), '.aws-sso-auth-credentials.json');
        expect(fs.readFileSync(expectedPath, 'utf8')).toEqual(expected);
        const fileModeOctal = '0' + (fs.lstatSync(expectedPath).mode & parseInt('777', 8)).toString(8);
        expect(fileModeOctal).toEqual('0600');
    });
});
