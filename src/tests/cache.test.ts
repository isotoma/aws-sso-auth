import os from 'os';
import path from 'path';

import mockfs from 'mock-fs';

import { findLatestCacheFile } from '../cache';

describe('findLatestCacheFile', () => {
    afterEach(() => {
        mockfs.restore();
    });

    test('findLatestCacheFile', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/newer.json')]: ['{', '  "accessToken": "my_access_token_newer",', '  "expiresAt": "2020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'].join(
                '\n',
            ),
            [path.join(os.homedir(), '.aws/sso/cache/older.json')]: ['{', '  "accessToken": "my_access_token_older",', '  "expiresAt": "2019-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'].join(
                '\n',
            ),
        });

        const latest = await findLatestCacheFile();
        expect(latest?.accessToken).toEqual('my_access_token_newer');
    });

    test('selects correct file from comparison', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/a.json')]: ['{', '  "accessToken": "my_access_token_a",', '  "expiresAt": "2019-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'].join('\n'),
            [path.join(os.homedir(), '.aws/sso/cache/b.json')]: [
                '{',
                '  "accessToken": "my_access_token_b",',
                '  "expiresAt": "2021-01-01T12:30:00Z",', // Is most recent
                '  "region": "eu-west-1"',
                '}',
            ].join('\n'),
            [path.join(os.homedir(), '.aws/sso/cache/c.json')]: ['{', '  "accessToken": "my_access_token_c",', '  "expiresAt": "2020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'].join('\n'),
        });

        const latest = await findLatestCacheFile();
        expect(latest?.accessToken).toEqual('my_access_token_b');
    });

    test('no files, empty directory', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/')]: {},
        });

        const latest = await findLatestCacheFile();
        expect(latest).toBeUndefined();
    });

    test('no files, directory does not exist', async () => {
        mockfs({});

        const latest = await findLatestCacheFile();
        expect(latest).toBeUndefined();
    });

    test('ignores invalid', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/valid.json')]: ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "2020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'].join('\n'),
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: 'not valid',
        });

        const latest = await findLatestCacheFile();
        expect(latest?.accessToken).toEqual('my_access_token');
    });

    test('ignores if not .json', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/valid.notdotjson')]: ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "2020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'].join(
                '\n',
            ),
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if not object', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: '123',
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if null', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: 'null',
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if accessToken missing', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: ['{', '  "expiresAt": "2020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'].join('\n'),
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if expiresAt missing', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: ['{', '  "accessToken": "my_access_token",', '  "region": "eu-west-1"', '}'].join('\n'),
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if region missing', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "2020-01-01T12:30:00Z"', '}'].join('\n'),
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if accessToken not string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: ['{', '  "accessToken": false,', '  "expiresAt": "2020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'].join('\n'),
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if expiresAt not string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: ['{', '  "accessToken": "my_access_token",', '  "expiresAt": {},', '  "region": "eu-west-1"', '}'].join('\n'),
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if expiresAt not valid date', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "not a valid iso date",', '  "region": "eu-west-1"', '}'].join('\n'),
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });

    test('ignores if region not string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/sso/cache/invalid.json')]: ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "2020-01-01T12:30:00Z",', '  "region": []', '}'].join('\n'),
        });

        expect(await findLatestCacheFile()).toBeUndefined();
    });
});
