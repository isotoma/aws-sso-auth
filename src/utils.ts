export const hasKey = <K extends string>(key: K, obj: unknown): obj is { [_ in K]: Record<string, unknown> } => {
    return typeof obj === 'object' && !!obj && key in obj;
};

export const reducePromises = async <A, B>(reducer: (b: B, a: A) => Promise<B>, items: Array<A>, initial: B): Promise<B> => {
    let current: B = initial;
    for (const item of items) {
        current = await reducer(current, item);
    }
    return current;
};
