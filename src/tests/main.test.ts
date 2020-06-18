import { main, run } from '../main';

describe('main', () => {
    test('main', async () => {
        await main([]);
    });

    test('too many arguments', async () => {
        await expect(main(['too', 'many', 'arguments'])).rejects.toThrow('Error');
    });

    test('unknown options', async () => {
        await expect(main(['--unknown-option'])).rejects.toThrow('Unknown arguments');
    });
});

describe('run', () => {
    test('run', async () => {
        await run();
    });
});
