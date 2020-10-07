import {
    GestureResponderEvent,
    PanResponderGestureState,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
    AnimatedValueDerivedInput,
    AnimatedValueXYDerivedInput,
    IAnimatedValueXYInput,
} from './types';
import { zeroPoint } from './util';

export function normalizeAnimatedValue<Info>(
    value: AnimatedValueDerivedInput<Info> | undefined,
    info: Info,
    defaults?: Animated.Value<number>,
): Animated.Value<number> {
    if (typeof value === 'function') {
        value = value(info);
    }
    if (typeof value === 'undefined') {
        return defaults || new Animated.Value<number>(0); 
    }
    if (typeof value === 'number') {
        return new Animated.Value<number>(value);
    }
    if (typeof value === 'object' && value instanceof Animated.Value<number>) {
       return value; 
    }
    throw new Error('Invalid animated value');
}

export function normalizeAnimatedValueXY<Info>(
    point: AnimatedValueXYDerivedInput<Info> | undefined,
    info: Info,
    defaults?: IAnimatedValueXYInput | Animated.ValueXY,
): Animated.ValueXY {
    if (typeof point === 'function') {
        point = point(info);
    }
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
        p.x = new Animated.Value<number>(p.x);
    }
    if (typeof p.x !== 'number' && typeof p.y === 'number') {
        p.y = new Animated.Value<number>(p.y);
    }
    return new Animated.ValueXY(p);
}

export const negate$ = (x: Animated.Animated) => {
    return Animated.subtract(0, x);
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
