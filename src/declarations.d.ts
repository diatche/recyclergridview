declare module '@ungap/weakrefs' {
    export class WeakRef<T> {
        constructor(value: T);
        deref(): T;
    }
}
