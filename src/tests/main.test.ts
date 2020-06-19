jest.mock('child_process');

import os from 'os';
import path from 'path';
import fs from 'fs';

import mockfs from 'mock-fs';
import { exec } from 'child_process';

import { run } from '../main';

beforeEach(() => {
    mockfs({
        [path.join(os.homedir(), '.aws/')]: {},
        [path.join(os.homedir(), '.aws/sso/cache/')]: {},
    });
    const execMock = (exec as unknown) as jest.Mock<void>;
    execMock.mockClear();
});

afterEach(() => {
    mockfs.restore();
});

describe('run', () => {
    test('run', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation((cmd: string, options: object, callback: (err: Error | null, out: { stdout: string; stderr: string }) => void) => {
            if (cmd.startsWith('aws sso login')) {
                const content = {
                    expiresAt: new Date(new Date().getTime() + 60 * 1000),
                    region: 'myregion',
                    accessToken: 'myaccesstoken',
                };
                fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/example.json'), JSON.stringify(content), 'utf8');
                callback(null, {
                    stdout: '',
                    stderr: '',
                });
            } else if (cmd.startsWith('aws sso get-role-credentials')) {
                const content = {
                    roleCredentials: {
                        accessKeyId: 'myaccesskeyid',
                        secretAccessKey: 'mysecretaccesskey',
                        sessionToken: 'mysessiontoken',
                    },
                };
                callback(null, {
                    stdout: JSON.stringify(content),
                    stderr: '',
                });
            } else {
                callback(new Error('Unknown command'), {
                    stdout: '',
                    stderr: '',
                });
            }
        });

        await run();

        const foundCredentialsContent = fs.readFileSync(path.join(os.homedir(), '.aws/credentials'), 'utf8');

        const expectedLines = [
            '[default]',
            'aws_access_key_id = myaccesskeyid',
            'aws_secret_access_key = mysecretaccesskey',
            'aws_session_token = mysessiontoken',
            'aws_security_token = mysessiontoken',
            '',
        ];
        expect(foundCredentialsContent).toEqual(expectedLines.join('\n'));
    });
});
