import React from "react";
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

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
    zIndex?: number;
}

export interface IAnimatedItemLayout {
    contentLayout: ILayout<MutableAnimatedPoint>;
    viewLayout: ILayout<IAnimatedPoint>;
    opacity: Animated.Value<number>;
    renderNonce: Animated.Value<number>;
}

export interface IAnimatedAxisLayout {
    length: Animated.Value<number>;
}

export type AnimatedValueInput = number | Animated.Value<number>;
export type AnimatedValueDerivedInput<Info> = AnimatedValueInput | ((info: Info) => AnimatedValueInput);

export interface IAnimatedValueXYInput {
    x: AnimatedValueInput;
    y: AnimatedValueInput;
}

export type AnimatedValueXYDerivedInput<Info> = Partial<IAnimatedValueXYInput> | Animated.ValueXY | ((info: Info) => Partial<IAnimatedValueXYInput> | Animated.ValueXY);

export interface IAnimatedPoint {
    x: Animated.Value<number> | Animated.AnimatedInterpolation;
    y: Animated.Value<number> | Animated.AnimatedInterpolation;
}

export type MutableAnimatedPoint = Animated.ValueXY | {
    x: Animated.Value<number>;
    y: Animated.Value<number>;
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