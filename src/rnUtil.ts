import {
    Animated,
    GestureResponderEvent,
    PanResponderGestureState,
} from 'react-native';
import {
    AnimatedValueDerivedInput,
    AnimatedValueXYDerivedInput,
    IAnimatedPoint,
    IAnimatedPointInput,
    IAnimatedValueXYInput,
    IAnimationBaseOptions,
    IPartialLayout,
} from './types';
import { parseRelativeValue, zeroPoint } from './util';

export const normalizeAnimatedValue = (
    x: Animated.Value | number | string | undefined,
    options?: {
        defaults?: Animated.Value;
    },
): Animated.Value => {
    switch (typeof x) {
        case 'undefined':
            return options?.defaults || new Animated.Value(0);
        case 'number':
            return new Animated.Value(x);
        case 'object':
            if (x instanceof Animated.Value) {
                return x;
            }
            break;
    }
    throw new Error('Invalid animated value');
}

export const normalizeAnimatedValueOrInterpolation = (
    x: Animated.AnimatedInterpolation | Animated.Value | number | string | undefined,
    options?: {
        relativeLength?: Animated.Value | Animated.AnimatedInterpolation | number;
        defaults?: Animated.Value;
    },
): Animated.Value | Animated.AnimatedInterpolation => {
    if (x === null) {
        x = undefined;
    }
    switch (typeof x) {
        case 'undefined':
            return options?.defaults || new Animated.Value(0);
        case 'number':
            return new Animated.Value(x);
        case 'object':
            // Assume animated value or interpolation
            return x;
        case 'string':
            let unity = options?.relativeLength;
            if (!unity) {
                throw new Error('Must specify relative length to support relative value');
            }
            let coef = parseRelativeValue(x);
            return coef === 1
                ? normalizeAnimatedValueOrInterpolation(unity)
                : Animated.multiply(coef, unity);
    }
    throw new Error('Invalid animated value');
}

export function normalizeAnimatedDerivedValue<Info>(
    value: AnimatedValueDerivedInput<Info> | undefined,
    options: {
        info: Info,
        defaults?: Animated.Value;
    },
): Animated.Value {
    if (typeof value === 'function') {
        value = value(options.info);
    }
    return normalizeAnimatedValue(value, options);
}

export function normalizeAnimatedDerivedValueXY<Info>(
    point: AnimatedValueXYDerivedInput<Info> | undefined,
    options: {
        info: Info,
        defaults?: IAnimatedValueXYInput | Animated.ValueXY,
    },
): Animated.ValueXY {
    if (typeof point === 'function') {
        point = point(options.info);
    }
    if (point && point instanceof Animated.ValueXY) {
        return point;
    }
    let p: IAnimatedValueXYInput = {
        ...zeroPoint(),
        ...options.defaults,
        ...point,
    };
    // Both x and y must be a number or an animated value
    // Mixing types is not allowed.
    if (typeof p.x === 'number' && typeof p.y !== 'number') {
        p.x = new Animated.Value(p.x);
    }
    if (typeof p.x !== 'number' && typeof p.y === 'number') {
        p.y = new Animated.Value(p.y);
    }
    return new Animated.ValueXY(p);
}

export const normalizePartialAnimatedPoint = (
    point?: Partial<IAnimatedPointInput>,
    options?: {
        relativeSize?: Partial<IAnimatedPoint>;
    },
): Partial<IAnimatedPoint> => {
    let { x, y } = point || {};
    let normPoint: Partial<IAnimatedPoint> = {};
    if (typeof x !== 'undefined') {
        normPoint.x = normalizeAnimatedValueOrInterpolation(point?.x, {
            relativeLength: options?.relativeSize?.x,
        });
    }
    if (typeof y !== 'undefined') {
        normPoint.y = normalizeAnimatedValueOrInterpolation(point?.y, {
            relativeLength: options?.relativeSize?.y,
        });
    }
    return normPoint;
};

export const normalizePartialAnimatedLayout = (
    layout?: IPartialLayout<IAnimatedPointInput>,
    options?: {
        relativeSize?: Partial<IAnimatedPoint>;
    },
): IPartialLayout<IAnimatedPoint> => {
    let offset = normalizePartialAnimatedPoint(layout?.offset, options);
    let size = normalizePartialAnimatedPoint(layout?.size, options);
    let normLayout: IPartialLayout<IAnimatedPoint> = {};
    if (offset) {
        normLayout.offset = offset;
    }
    if (size) {
        normLayout.size = size;
    }
    return normLayout;
};

export const negate$ = (x: Animated.Animated) => {
    return Animated.subtract(0, x);
};

export const concatFunctions = (f1: any, f2: any) => {
    if (f1 && !f2) {
        return f1;
    } else if (!f1 && f2) {
        return f2;
    } else if (f1 && f2) {
        return (...args: any[]) => {
            f1(...args);
            return f2(...args) as any;
        };
    } else {
        return undefined;
    }
};

export const safeFunction = (f: any) => {
    if (!f) {
        return undefined;
    }
    return (...args: any[]) => {
        try {
            return f(...args);
        } catch (error) {
            console.error(`Uncaught error: ${error.message}`);
        }
    };
};

export function removeDefaultCurry<T>(
    cb: (
        e: GestureResponderEvent,
        gestureState: PanResponderGestureState
    ) => T
): (
    e: GestureResponderEvent,
    gestureState: PanResponderGestureState
) => T {
    return (e, gestureState) => {
        if (e?.preventDefault) {
            e.preventDefault();
            // e.stopPropagation();
        }
        return cb(e, gestureState);
    };
};

export const animateValueIfNeeded = (
    value$: Animated.Value,
    fromValue: number,
    toValue: number,
    options: IAnimationBaseOptions = {}
): Animated.CompositeAnimation | undefined => {
    if (toValue === fromValue) {
        return undefined;
    }
    if (!options.animated) {
        value$.setValue(toValue);
        return undefined;
    }

    if (options.timing) {
        return Animated.timing(value$, {
            useNativeDriver: false,
            ...options.timing,
            toValue,
        });
    } else {
        return Animated.spring(value$, {
            useNativeDriver: false,
            ...options.spring,
            toValue,
        });
    }
};

// export const useImport = (
//     packageName: string,
//     options?: {
//         fallback?: any;
//         optional?: boolean;
//     }): any => {
//     const [packageRoot, setPackageRoot] = React.useState<any>(options?.fallback);
//     const currentPackageNameRef = React.useRef('');

//     React.useEffect(() => {
//         currentPackageNameRef.current = packageName;
//         (async (packageName: string) => {
//             let packageRoot: any;
//             try {
//                 packageRoot = await import(packageName);
//             } catch (error) {
//                 if (!options?.optional) {
//                     throw error;
//                 }
//             }
//             if (packageName !== currentPackageNameRef.current) {
//                 // Another package was chosen
//                 return;
//             }
//             setPackageRoot(packageRoot);
//         })(packageName);
//     }, [packageName]);

//     return packageRoot;
// };
