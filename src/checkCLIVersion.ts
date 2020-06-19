import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export const checkCLIVersion = async (): Promise<boolean> => {
    let versionCmdOutput: { stdout: string };
    try {
        versionCmdOutput = await execPromise('aws --version', process.env);
    } catch {
        return false;
    }
    return versionCmdOutput.stdout.startsWith('aws-cli/2.');
};
