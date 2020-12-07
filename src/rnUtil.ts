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
import { zeroPoint } from './util';

export const normalizeAnimatedValue = (
    value: Animated.Value | number | undefined,
    defaults?: Animated.Value,
): Animated.Value => {
    if (typeof value === 'undefined') {
        return defaults || new Animated.Value(0); 
    }
    if (typeof value === 'number') {
        return new Animated.Value(value);
    }
    if (typeof value === 'object' && value instanceof Animated.Value) {
       return value; 
    }
    throw new Error('Invalid animated value');
}

export const normalizeAnimatedValueXY = (
    point: Animated.ValueXY | Partial<IAnimatedValueXYInput> | undefined,
    defaults?: IAnimatedValueXYInput | Animated.ValueXY,
): Animated.ValueXY => {
    if (point && point instanceof Animated.ValueXY) {
        return point;
    }
    let p: IAnimatedValueXYInput = zeroPoint();
    if (defaults) {
        p = { ...defaults };
    }
    if (point) {
        p = { ...p, ...point };
    }
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

export function normalizeAnimatedDerivedValue<Info>(
    value: AnimatedValueDerivedInput<Info> | undefined,
    info: Info,
    defaults?: Animated.Value,
): Animated.Value {
    if (typeof value === 'function') {
        value = value(info);
    }
    return normalizeAnimatedValue(value, defaults);
}

export function normalizeAnimatedDerivedValueXY<Info>(
    point: AnimatedValueXYDerivedInput<Info> | undefined,
    info: Info,
    defaults?: IAnimatedValueXYInput | Animated.ValueXY,
): Animated.ValueXY {
    if (typeof point === 'function') {
        point = point(info);
    }
    return normalizeAnimatedValueXY(point, defaults);
}

export const normalizePartialAnimatedPoint = (
    point: Partial<IAnimatedPointInput> = {}
): Partial<IAnimatedPoint> => {
    let { x, y } = point;
    let normPoint: Partial<IAnimatedPoint> = {};
    switch (typeof x) {
        case 'number':
            normPoint.x = new Animated.Value(x);
            break;
        case 'object':
            normPoint.x = x;
            break;
    }
    switch (typeof y) {
        case 'number':
            normPoint.y = new Animated.Value(y);
            break;
        case 'object':
            normPoint.y = y;
            break;
    }
    return normPoint;
};

export const normalizePartialAnimatedLayout = (
    layout?: IPartialLayout<IAnimatedPointInput>
): IPartialLayout<IAnimatedPoint> => {
    let offset = normalizePartialAnimatedPoint(layout?.offset);
    let size = normalizePartialAnimatedPoint(layout?.size);
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
