import React from "react";
import { View, Animated } from 'react-native';

export declare type AxisType = 'topAxis' | 'rightAxis' | 'bottomAxis' | 'leftAxis';
export declare type Direction = 'horizontal' | 'vertical';

export declare type AxisTypeMapping<T> = { [K in AxisType]: T };

export declare type ViewRef = React.Ref<View>;

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
    /**
     * Setting the z-index here will override
     * the layout source's setting for this item.
     * 
     * See also [LayoutSourceProps]{@link LayoutSourceProps#zIndex}.
     */
    zIndex?: number;
}

export interface IAnimatedItemLayout {
    contentLayout: ILayout<MutableAnimatedPoint>;
    viewLayout: ILayout<IAnimatedPoint>;
    opacity: Animated.Value;
    renderNonce: Animated.Value;
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

export type MutableAnimatedPoint = Animated.ValueXY | {
    x: Animated.Value;
    y: Animated.Value;
};

export interface IItemUpdate<T> {
    add?: T;
    remove?: T;
}

export interface IItem {
    // id: number;
    reuseID?: string;
    ref: ViewRef;
    // zIndex: number;
    contentLayout: IItemLayout;
    animated: IAnimatedItemLayout;
}

export interface IInsets<T=number> {
    top: T,
    right: T,
    bottom: T,
    left: T,
}

export type InsetEdge = keyof IInsets;