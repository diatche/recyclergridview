import {
    kAllAxisTypes,
    kAllAxisTypeSet,
} from './const';
import {
    AxisLabel,
    AxisType,
    AxisTypeMapping,
    Direction,
    IItemLayout,
    ILayout,
    IPoint,
} from './types';

export const getLazyValue = (obj: any, key: string | number, defaults: any) => {
    if (!(key in obj)) {
        obj[key] = defaults;
    }
    return obj[key];
};

export const getLazyArray = (obj: any, key: string | number): any[] => {
    if (!(key in obj)) {
        obj[key] = [];
    }
    return obj[key];
};

export const getLazyObject = (obj: any, key: string | number): any => {
    if (!(key in obj)) {
        obj[key] = {};
    }
    return obj[key];
};

export const zeroPoint = (): IPoint => ({ x: 0, y: 0 });

export const isPointEmpty = (p: Partial<IPoint>): boolean => {
    return typeof p.x === 'undefined' && typeof p.y === 'undefined';
};

export const isPoint = (p: Partial<IPoint> | undefined): p is IPoint => {
    return !!p && typeof p.x === 'number' && typeof p.y === 'number';
};

export const isPartialPoint = (p: Partial<IPoint> | undefined): p is Partial<IPoint> => {
    return !!p && (typeof p.x === 'number' || typeof p.y === 'number');
};

export const xRange = (pointRange: [IPoint, IPoint]): [number, number] => {
    return [pointRange[0].x, pointRange[1].x];
};

export const yRange = (pointRange: [IPoint, IPoint]): [number, number] => {
    return [pointRange[0].y, pointRange[1].y];
};

export const emptyRange = (): [number, number] => [0, 0];
export const emptyPointRange = (): [IPoint, IPoint] => [zeroPoint(), zeroPoint()];

export const isRangeEqual = (r1: [number, number], r2: [number, number]): boolean => {
    return r1[0] === r2[0] && r1[1] === r2[1];
};

export const isPointRangeEqual = (r1: [IPoint, IPoint], r2: [IPoint, IPoint]): boolean => {
    return r1[0].x === r2[0].x && r1[1].x === r2[1].x
        && r1[0].y === r2[0].y && r1[1].y === r2[1].y;
};

export const isPointRangeEmpty = (r: [IPoint, IPoint]): boolean => {
    return r[0].x >= r[1].x || r[0].y >= r[1].y;
};

/**
 * Returns true if the specified point `p` is inside the
 * specified range `r`.
 * 
 * The range lower bounds are inclusive and upper bounds
 * are exclusive.
 * 
 * @param p {IPoint} The point. 
 * @param r {[IPoint, IPoint]} The point range.
 */
export const isPointInRange = (p: IPoint, r: [IPoint, IPoint]): boolean => {
    return p.x >= r[0].x && p.x < r[1].x && p.y >= r[0].y && p.y < r[1].y;
};

export function isSetEqual<T>(s1: Set<T>, s2: Set<T>): boolean {
    if (s1.size !== s2.size) {
        return false;
    }
    for (let a of s1) {
        if (!s2.has(a)) {
            return false;
        }
    }
    return true;
};

export const maxLayoutPoint = (layout: ILayout<IPoint>): IPoint => {
    return {
        x: layout.offset.x + layout.size.x,
        y: layout.offset.y + layout.size.y,
    }
};

export const isAxisType = (axisType: any): axisType is AxisType => {
    return kAllAxisTypeSet.has(axisType as any);
};

export const axisDirection = (axisType: AxisType): Direction => {
    switch (axisType) {
        case 'topAxis': return 'horizontal';
        case 'bottomAxis': return 'horizontal';
        case 'rightAxis': return 'vertical';
        case 'leftAxis': return 'vertical';
    }
}

export function axisTypeMap<T>(iterator: (axisType: AxisType) => T): AxisTypeMapping<T> {
    let d: Partial<AxisTypeMapping<T>> = {};
    for (let axisType of kAllAxisTypes) {
        d[axisType] = iterator(axisType);
    }
    return d as AxisTypeMapping<T>;
}

export const horizontalBooleanToAxis = (isHorizontal: boolean): AxisLabel => isHorizontal ? 'x' : 'y';

export declare type IteratorReturnType = { stop: boolean } | undefined | void;

export function * forEachInstertedIndexInSet<T>(
    s0: Set<T>,
    s1: Set<T>,
): Generator<T, undefined> {
    for (let i of s1) {
        if (!s0.has(i)) {
            yield i;
        }
    }
    return undefined;
}

export function * forEachInstertedIndexInRange(
    r0: [number, number],
    r1: [number, number],
): Generator<number, undefined> {
    let [i00, i0N] = r0;
    let [i10, i1N] = r1;

    if (i10 >= i1N) {
        return undefined;
    }

    // Iterate new indexes
    if (i00 >= i0N || i1N <= i00 || i0N <= i10) {
        // All indexes inserted
        for (let i = i10; i < i1N; i++) {
            yield i;
        }
    } else {
        // Some indexes indexes
        for (let i = i10; i < i00; i++) {
            yield i;
        }
        for (let i = i0N; i < i1N; i++) {
            yield i;
        }
    }
    return undefined;
}

export function * forEachInstertedPointInRange(
    r0: [IPoint, IPoint],
    r1: [IPoint, IPoint],
): Generator<IPoint, undefined> {
    // Y axis positive direction is up
    let [p00, p0N] = r0;
    let [p10, p1N] = r1;

    if (p10.y < p00.y) {
        // New box is below old box
        // All x's are insterted:
        let yN = Math.min(p1N.y, p00.y);
        for (let y = p10.y; y < yN; y++) {
            for (let x = p10.x; x < p1N.x; x++) {
                yield { x, y };
            }
        }
    }

    if (p10.y < p0N.y && p1N.y > p00.y) {
        // New box is inside old box
        // Overlap along x axis:
        let r0x: [number, number] = [p00.x, p0N.x];
        let r1x: [number, number] = [p10.x, p1N.x];
        let y0 = Math.max(p10.y, p00.y);
        let yN = Math.min(p1N.y, p0N.y);
        for (let x of forEachInstertedIndexInRange(r0x, r1x)) {
            for (let y = y0; y < yN; y++) {
                yield { x, y };
            }
        }
    }

    if (p1N.y > p0N.y) {
        // New box is above old box
        // All x's are insterted:
        let y0 = Math.max(p10.y, p0N.y);
        for (let y = y0; y < p1N.y; y++) {
            for (let x = p10.x; x < p1N.x; x++) {
                yield { x, y };
            }
        }
    }

    return undefined;
}

export const isPointInsideItemLayout = (p: IPoint, layout: IItemLayout): boolean => {
    if (p.x < layout.offset.x || p.y < layout.offset.y) {
        return false;
    }
    return p.x <= layout.offset.x + layout.size.x && p.y <= layout.offset.y + layout.size.y;
};

export function iterateAll<T>(iterable: Iterable<T>): T[] {
    let values: T[] = [];
    for (let value of iterable) {
        values.push(value);
    }
    return values;
}

// export const estimateFinalDecayValue = (
//     {
//         x,
//         v,
//         deceleration,
//         timeStep: dt,
//         accuracy
//     }: {
//         x: number;
//         v: number;
//         deceleration: number;
//         timeStep: number;
//         accuracy: number;
//     }
// ): number => {
//     if (v === 0) {
//         return x;
//     }
//     if (accuracy <= 0) {
//         throw new Error('Invalid accuracy');
//     }
//     if (deceleration <= 0) {
//         throw new Error('Invalid deceleration');
//     }
//     if (dt <= 0) {
//         throw new Error('Invalid timeStep');
//     }
//     let init = true;
//     let dx = 0;
//     while (init || Math.abs(dx) > accuracy) {
//         init = false;
//         dx = v * dt;
//         x += dx;
//         v *= deceleration;
//     }
//     return x;
// };
