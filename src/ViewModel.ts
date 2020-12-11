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

    /**
     * Setting a non-zero z-index here will set the default
     * z-index for all items.
     * 
     * By default, the view sets the z-index such that the
     * visual order of items matches the order in which the
     * layout source were added to the view. Customise this
     * behaviour [in the view]{@link EvergridLayoutProps}.
     * 
     * You can also set each item's z-index individually
     * in the item's layout callback. Refer to the subclasses
     * item layout method for more information.
     */
    zIndex?: number;

    /**
     * The first z-index to use when adding children.
     * Defaults to 10.
     * 
     * If a layout source [defines their own]{@link ChildProps#zIndex}
     * non-zero z-index, this will not override it.
     */
    zIndexStart?: number;
    /**
     * The distance between z-indexes in children.
     * Defaults to 10.
     * 
     * If a layout source [defines their own]{@link ChildProps#zIndex}
     * non-zero z-index, this will not override it.
     */
    zIndexStride?: number;
}

export class ViewModel<
    Props extends ViewModelProps = ViewModelProps
> {
    props: Props;
    zIndex?: number;
    zIndexStart: number;
    zIndexStride: number;

    scale$: Animated.ValueXY;
    offset$: Animated.ValueXY;
    size$: Animated.ValueXY;

    private _offset: IPoint;
    private _size: IPoint;
    private _contentOffset: IPoint;
    private _scale: IPoint;

    private _children: ViewModel[] = [];

    private _animatedSubscriptions: { [id: string]: Animated.Value | Animated.ValueXY } = {};

    private _parentWeakRef = weakref<ViewModel>();

    constructor(props: Props) {
        this.props = { ...props };

        this.zIndex = this.props.zIndex;
        this.zIndexStart = this.props.zIndexStart || 0;
        this.zIndexStride = this.props.zIndexStride || 0;

        this.offset$ = new Animated.ValueXY();
        this._offset = zeroPoint();

        this.size$ = new Animated.ValueXY();
        this._size = { x: 1, y: 1 };
        this._contentOffset = zeroPoint();

        this._scale = { x: 1, y: 1 };
        this.scale$ = new Animated.ValueXY({ ...this._scale });
    }

    setChilds(children: ViewModel[]) {
        for (let child of this._children) {
            if (children.indexOf(child) < 0) {
                // Removed layout source
                child.setParent(undefined);
            }
        }

        let previousChilds = this._children;
        this._children = [...children];
        // console.debug('children: ' + children.map(s => s.id));

        for (let i = 0; i < children.length; i++) {
            let child = children[i];
            // Check duplicates
            if (children.indexOf(child, i) > i) {
                throw new Error(`Cannot add duplicate child view model`);
            }

            if (previousChilds.indexOf(child) < 0) {
                // Added layout source
                let i = this._children.indexOf(child);
                child.setParent(this, {
                    zIndex: this.zIndexStart + i * this.zIndexStride,
                });
            }
        }
    }

    addChild(
        child: ViewModel,
        options?: {
            zIndex?: number;
            strict?: boolean;
        }
    ) {
        let {
            strict = false,
            zIndex = this.zIndexStart + this._children.length * this.zIndexStride,
        } = options || {};

        let i = this._children.indexOf(child);
        if (i >= 0) {
            if (strict) {
                throw new Error('Layout source is already added.');
            }
            return;
        }

        this._children.push(child);
        child.setParent(this, { zIndex });
    }

    removeChild(
        child: ViewModel,
        options?: {
            strict?: boolean;
        }
    ) {
        let i = this._children.indexOf(child);
        if (i < 0) {
            if (options?.strict) {
                throw new Error('Layout source not found');
            }
            return;
        }
        this._children.splice(i, 1);
        child.setParent(undefined);
    }

    get parent(): ViewModel | undefined {
        return this._parentWeakRef.get();
    }

    setParent(
        parent: ViewModel | undefined,
        configuration?: {
            zIndex?: number;
        },
    ) {
        this.resetObservables();

        this.willChangeParent();
        this._setParent(parent);

        if (parent) {
            if (typeof this.props.zIndex === 'undefined') {
                this.zIndex = configuration?.zIndex || 0;
            }

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
        }

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
