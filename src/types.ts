import React from "react";
import { 
    Animated,
    GestureResponderEvent,
    PanResponderGestureState,
} from 'react-native';
import { ItemView } from "./internal";

export declare type AxisType = 'topAxis' | 'rightAxis' | 'bottomAxis' | 'leftAxis';
export declare type Direction = 'horizontal' | 'vertical';

export declare type AxisTypeMapping<T> = { [K in AxisType]: T };

export declare type AxisLabel = 'x' | 'y';

export interface IPoint {
    x: number;
    y: number;
}

export interface ILayout<T> {
    offset: T;
    size: T;
}

export interface IItemLayout {
    offset: IPoint;
    size: IPoint;
}

export interface IAnimatedItemLayout {
    contentLayout: ILayout<MutableAnimatedPoint>;
    viewLayout: ILayout<IAnimatedPoint>;
    opacity: Animated.Value;
}

export interface IAnimatedAxisLayout {
    length: Animated.Value;
}

export type AnimatedValueInput = number | Animated.Value;
export type AnimatedValueDerivedInput<Info> = AnimatedValueInput | ((info: Info) => AnimatedValueInput);

export interface IAnimatedValueXYInput {
    x: AnimatedValueInput;
    y: AnimatedValueInput;
}

export type AnimatedValueXYDerivedInput<Info> = Partial<IAnimatedValueXYInput> | Animated.ValueXY | ((info: Info) => Partial<IAnimatedValueXYInput> | Animated.ValueXY);

export interface IAnimatedPoint {
    x: Animated.Value | Animated.AnimatedInterpolation;
    y: Animated.Value | Animated.AnimatedInterpolation;
}

export interface IAnimatedPointInput {
    x: number | Animated.Value | Animated.AnimatedInterpolation;
    y: number | Animated.Value | Animated.AnimatedInterpolation;
}

export type MutableAnimatedPoint = Animated.ValueXY | {
    x: Animated.Value;
    y: Animated.Value;
};

export interface IItemUpdate<T> {
    add?: T;
    remove?: T;
}

/**
 * The items metadata.
 * You can modify these values in the
 * [willShowItem]{@link LayoutSourceProps#willShowItem}
 * callback.
 */
export interface IItem<T> {
    index: T;
    reuseID?: string;
    ref: React.RefObject<ItemView>;
    viewKey: string;
    /**
     * Setting the z-index here will override
     * the layout source's setting for this item.
     * 
     * See also [LayoutSourceProps]{@link LayoutSourceProps#zIndex}.
     */
    zIndex?: number;
    contentLayout: IItemLayout;
    animated: IAnimatedItemLayout;
    /**
     * If `true`, the item will fade in when
     * rendered. This value is set automatically.
     */
    showAnimation: boolean;
}

export interface IInsets<T=number> {
    top: T,
    right: T,
    bottom: T,
    left: T,
}

export type InsetEdge = keyof IInsets;

export interface IAnimationBaseOptions {
    animated?: boolean;
    manualStart?: boolean;
    onEnd?: (info: { finished: boolean }) => void;
    spring?: Partial<Omit<Animated.SpringAnimationConfig, 'toValue'>>;
    timing?: Partial<Omit<Animated.TimingAnimationConfig, 'toValue'>>;
}

export interface PanPressableProps {
    /**
     * Called when a single tap gesture is detected.
     */
    onPress?: null | ((event: GestureResponderEvent, gestureState: PanResponderGestureState) => void);

    /**
     * Called when a touch is engaged before `onPress`.
     */
    onPressIn?: null | ((event: GestureResponderEvent, gestureState: PanResponderGestureState) => void);

    /**
     * Called when a touch is released before `onPress`.
     */
    onPressOut?: null | ((event: GestureResponderEvent, gestureState: PanResponderGestureState) => void);

    /**
     * Called when a long-tap gesture is detected.
     */
    onLongPress?: null | ((event: GestureResponderEvent, gestureState: PanResponderGestureState) => void);

    /**
     * Duration (in milliseconds) from onPressIn before onLongPress is called.
     */
    delayLongPress?: number;

    /**
     * Maximum pan distance (in pixels) from onPressIn location for onLongPress to be called.
     */
    longPressMaxDistance?: number;
}
