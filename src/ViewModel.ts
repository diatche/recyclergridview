import { Animated } from "react-native";
import {
    IAnimatedPoint,
} from "./internal";
import {
    AnimatedValueXYDerivedInput,
    IPoint,
} from "./types";
import {
    weakref,
    zeroPoint,
} from "./util";
import {
    normalizeAnimatedDerivedValueXY,
} from './rnUtil';
    
const kDefaultProps: Partial<ViewModelProps> = {};

export interface ViewModelProps {
    
    /**
     * The location in (parent coordinates) of the viewport.
     * Defaults to a zero vector.
     */
    offset?: AnimatedValueXYDerivedInput<ViewModel>;

    /**
     * The size in (parent coordinates) of the viewport.
     * Defaults to a zero vector.
     */
    size?: AnimatedValueXYDerivedInput<ViewModel>;

    /**
     * Set to `{ x: 1, y: 1 }` by default.
     * 
     * To add a parallax effect, set component
     * values to larger or smaller than 1 to make
     * the items appear closer and further away
     * respectively.
     */
    scale?: AnimatedValueXYDerivedInput<ViewModel>;
}

export class ViewModel<
    Props extends ViewModelProps = ViewModelProps
> {
    props: Props;
    scale$: Animated.ValueXY;

    offset$: Animated.ValueXY;
    size$: Animated.ValueXY;
    private _offset: IPoint;
    private _size: IPoint;
    private _contentOffset: IPoint;
    private _scale: IPoint;

    private _animatedSubscriptions: { [id: string]: Animated.Value | Animated.ValueXY } = {};

    private _parentWeakRef = weakref<ViewModel>();

    constructor(props: Props) {
        this.props = {
            ...kDefaultProps,
            ...props,
        };

        this.offset$ = new Animated.ValueXY();
        this._offset = zeroPoint();

        this.size$ = new Animated.ValueXY();
        this._size = { x: 1, y: 1 };
        this._contentOffset = zeroPoint();

        this._scale = { x: 1, y: 1 };
        this.scale$ = new Animated.ValueXY({ ...this._scale });
    }

    get parent(): ViewModel | undefined {
        return this._parentWeakRef.get();
    }

    setParent(parent: ViewModel) {
        this.resetObservables();

        this.willChangeParent();
        this._setParent(parent);

        this.offset$ = normalizeAnimatedDerivedValueXY(this.props.offset, {
            info: this,
        });
        this._offset = {
            // @ts-ignore: _value is private
            x: this._offset$.x._value || 0,
            // @ts-ignore: _value is private
            y: this._offset$.y._value || 0,
        };
        this.observeAnimatedValue(this.offset$, p => {
            this._offset = p;
            this.didChangeSpace();
        });

        this.size$ = normalizeAnimatedDerivedValueXY(this.props.size, {
            info: this,
            defaults: parent?.size$,
        });
        this._size = {
            // @ts-ignore: _value is private
            x: this._size$.x._value || 0,
            // @ts-ignore: _value is private
            y: this._size$.y._value || 0,
        };
        this.observeAnimatedValue(this.size$, p => {
            this._size = p;
            this.didChangeSpace();
        });

        this.scale$ = normalizeAnimatedDerivedValueXY(this.props.scale, {
            info: this,
            defaults: this._scale,
        });
        this._scale = {
            // @ts-ignore: _value is private
            x: this.scale$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.scale$.y._value || 0,
        };
        this.observeAnimatedValue(this.scale$, p => {
            if (p.x === 0 || p.y === 0) {
                // console.debug('Ignoring invalid scale value: ' + JSON.stringify(p));
                return;
            }
            if (p.x === this._scale.x && p.y === this._scale.y) {
                return;
            }
            // TODO: Reset if scale changes sign.
            this._scale = p;
            this.didChangeSpace();
        });

        this.didChangeParent();
    }

    get offset(): IPoint {
        return { ...this._offset };
    }
    
    get size(): IPoint {
        return { ...this._size };
    }

    private _setParent(parent: ViewModel | undefined) {
        if (!parent || !(parent instanceof ViewModel)) {
            throw new Error('Invalid root layout');
        }
        this._parentWeakRef.set(parent);
    }

    willChangeParent() {}

    didChangeParent() {}

    get contentOffset(): IPoint {
        return { ...this._contentOffset };
    }

    get scale(): IPoint {
        return { ...this._scale };
    }

    didChangeSpace() {

    }

    observeAnimatedValue(
        value: Animated.Value,
        callback: Animated.ValueListenerCallback,
    ): void;
    observeAnimatedValue(
        value: Animated.ValueXY,
        callback: Animated.ValueXYListenerCallback,
    ): void;
    observeAnimatedValue<
        V extends Animated.ValueXY | Animated.Value,
        CB extends Animated.ValueXYListenerCallback | Animated.ValueListenerCallback
    >(value: V, callback: CB): void {
        let sub = value.addListener(callback as any);
        this._animatedSubscriptions[sub] = value;
    }

    resetObservables() {
        for (let sub of Object.keys(this._animatedSubscriptions)) {
            let value = this._animatedSubscriptions[sub];
            value.removeListener(sub);
        }
        this._animatedSubscriptions = {};
    }

    /**
     * Transforms a point in parent coordinates
     * to a point in content coordinates.
     * @param point 
     */
    transformPoint(point: IPoint): IPoint {
        return {
            x: (point.x - this._offset.x) * this._scale.x,
            y: (point.y - this._offset.y) * this._scale.y,
        };
    }

    /**
     * Transforms a point in parent coordinates
     * to a point in content coordinates.
     * @param point 
     */
    transformPoint$(point: IAnimatedPoint | Animated.ValueXY): IAnimatedPoint {
        return {
            x: Animated.multiply(Animated.subtract(
                point.x,
                this.offset$.x,
            ), this.scale$.x),
            y: Animated.multiply(Animated.subtract(
                point.y,
                this.offset$.y,
            ), this.scale$.y),
        };
    }

    /**
     * Transforms a point in content coordinates
     * to a point in parent coordinates.
     * @param point 
     */
    reverseTransformPoint(point: IPoint): IPoint {
        return {
            x: point.x / this._scale.x + this._offset.x,
            y: point.y / this._scale.y + this._offset.y,
        };
    }

    // getRectMax(): IPoint {
    //     let p0 = this.offset;
    //     let s = this.size;
    //     return {
    //         x: p0.x + s.x,
    //         y: p0.y + s.y,
    //     };
    // }

    // getRectMax$(): IAnimatedPoint {
    //     let p0 = this.offset;
    //     let s = this.size;
    //     return {
    //         x: Animated.add(p0.x, s.x),
    //         y: Animated.add(p0.y, s.y),
    //     };
    // }
}
