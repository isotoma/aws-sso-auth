jest.mock('child_process');

import { exec } from 'child_process';

import { checkCLIVersion } from '../checkCLIVersion';

interface CmdOutput {
    stdout: string;
    stderr: string;
}

describe('checkCLIVersion', () => {
    beforeEach(() => {
        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockClear();
    });

    test('checkCLIVersion', async () => {
        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation((cmd: string, options: unknown, callback: (err: Error | null, out: CmdOutput) => void): void => {
            callback(null, {
                stdout: 'aws-cli/2.0.0',
                stderr: '',
            });
        });

        expect(await checkCLIVersion()).toBe(true);
    });

    test('throw error', async () => {
        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation((cmd: string, options: unknown, callback: (err: Error | null, out: CmdOutput) => void): void => {
            callback(new Error('Command failed'), {
                stdout: '',
                stderr: '',
            });
        });

        expect(await checkCLIVersion()).toBe(false);
    });
});
