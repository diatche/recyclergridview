import { Animated, Easing } from "react-native";
import { normalizeAnimatedValueXY } from "./rnUtil";
import { IAnimatedValueXYInput, IPoint } from "./types";

const kDefaultSmoothingInterval = 50;

export default class InteractiveValueXY {

    readonly value: Animated.ValueXY;
    smoothingInterval = kDefaultSmoothingInterval;

    private _sub?: string;
    private _currentValue: IPoint;
    private _targetValue: IPoint;
    private _animation?: Animated.CompositeAnimation;

    constructor(
        value?: Animated.ValueXY | Partial<IAnimatedValueXYInput> | undefined,
        options?: {
            default?: IAnimatedValueXYInput | Animated.ValueXY;
        },
    ) {
        this.value = normalizeAnimatedValueXY(value, options?.default);
        this._currentValue = {
            // @ts-ignore: _value is private
            x: this.value.x._value || 0,
            // @ts-ignore: _value is private
            y: this.value.y._value || 0,
        };
        this._targetValue = this._currentValue;
    }

    start() {
        if (this._sub) {
            return;
        }
        
        this._sub = this.value.addListener(value => {
            this._currentValue = value;
        });
    }

    stop() {
        if (this._sub) {
            this.value.removeListener(this._sub);
            this._sub = undefined;
        }
    }

    add(amount: IPoint) {
        if (!this.isInteracting) {
            this.onBeginInteraction();
        }

        this._targetValue = {
            x: this._targetValue.x + amount.x,
            y: this._targetValue.y + amount.y,
        };

        this._animate();
    }

    multiply(amount: IPoint) {
        if (!this.isInteracting) {
            this.onBeginInteraction();
        }

        this._targetValue = {
            x: this._targetValue.x * amount.x,
            y: this._targetValue.y * amount.y,
        };

        this._animate();
    }

    get isInteracting(): boolean {
        return !!this._animation;
    }

    onBeginInteraction() {
        this._targetValue = this._currentValue;
    }

    onEndInteraction(finished: boolean) { }

    private _animate() {
        if (this._animation) {
            // Already animating
            return;
        }

        this._animation = Animated.timing(this.value, {
            toValue: this._targetValue,
            duration: this.smoothingInterval,
            easing: Easing.linear,
            useNativeDriver: false,
        });

        this._animation.start(({ finished }) => {
            this._animation = undefined;
            if (!finished) {
                // Interrupted
                this._targetValue = this._currentValue;
            } else if (this._targetValue.x !== this._currentValue.x || this._targetValue.y !== this._currentValue.y) {
                this._animate();
                return;
            }
            this.onEndInteraction(finished);
        });
    }
}
