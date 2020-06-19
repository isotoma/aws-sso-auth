export const hasKey = <K extends string>(key: K, obj: {}): obj is { [_ in K]: {} } => {
    return typeof obj === 'object' && key in obj;
};

export const reducePromises = async <A, B>(reducer: (b: B, a: A) => Promise<B>, items: Array<A>, initial: B): Promise<B> => {
    let current: B = initial;
    for (const item of items) {
        current = await reducer(current, item);
    }
    return current;
};
