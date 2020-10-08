import React from "react";
import {
    AppState,
    PanResponder,
    PanResponderInstance,
    ViewProps,
} from "react-native";
import Animated from 'react-native-reanimated';
import ItemView from "./ItemView";
import { LayoutSource } from "./internal";
import {
    AnimatedValueDerivedInput,
    AnimatedValueXYDerivedInput,
    IAnimatedPoint,
    IItem,
    IInsets,
    IPoint,
} from "./types";
import {
    zeroPoint,
} from "./util";
import {
    negate$,
    normalizeAnimatedValueXY,
    removeDefaultCurry,
} from "./rnUtil";
import ScrollLock from "./ScrollLock";

const kPanSpeedMin = 0.001;

const kDefaultProps = {
    useNativeDriver: false,
};

export interface IScrollInfo {
    /** Content location (content coordinates). */
    location: IPoint,
    /** Content velocity (content coordinates). */
    velocity: IPoint,
    /** Viewport location (view coordinates). */
    offset: IPoint,
    /** Viewport velocity (view coordinates). */
    scaledVelocity: IPoint,
}

export interface IScrollBaseOptions extends Omit<Animated.SpringAnimationConfig, 'toValue'> {
    animated?: boolean;
    manualStart?: boolean;
    onEnd?: (info: { finished: boolean }) => void;
}

export interface RecyclerCollectionViewProps extends ViewProps {
    renderItem: (item: IItem, layoutSource: LayoutSource<any>, view: RecyclerGridView) => React.ReactNode;
    scrollLock?: boolean;
    layoutSources: LayoutSource<any>[];
    location?: AnimatedValueXYDerivedInput<RecyclerGridView>;
    scale?: AnimatedValueXYDerivedInput<RecyclerGridView>;
    /**
     * The point with values in the range 0-1.
     * The point represents the origin in the viewport.
     * Scaling also happens about this point.
     * 
     * Defaults to `{ x: 0.5, y: 0.5 }`, i.e. the
     * center of the viewport.
     **/
    anchor?: AnimatedValueXYDerivedInput<RecyclerGridView>;
    viewportInsets?: Partial<IInsets<AnimatedValueDerivedInput<RecyclerGridView>>>,
    /** Enabled by default. */
    verticalScrollEnabled?: boolean;
    /** Enabled by default. */
    horizontalScrollEnabled?: boolean;
    snapToLocation?: (info: IScrollInfo) => Partial<IPoint> | undefined;
    onViewportSizeChanged?: (collection: RecyclerGridView) => void;
    clock?: Animated.Clock;
}

interface RecyclerCollectionViewState {
    renderNonce: number;
}

// interface RecyclerCollectionViewSnapshot {
//     renderItems: boolean;
// }

export default class RecyclerGridView extends React.PureComponent<
    RecyclerCollectionViewProps,
    RecyclerCollectionViewState
> {
    readonly clock: Animated.Clock;
    readonly layoutSources: LayoutSource<any>[];
    readonly viewOffset$: Animated.ValueXY;
    /** Animated container size including axes. */
    readonly containerSize$: Animated.ValueXY;
    readonly scale$: Animated.ValueXY;
    /**
     * The point with values in the range 0-1.
     * The point represents the origin in the viewport.
     * Scaling also happens about this point.
     * 
     * Defaults to `{ x: 0.5, y: 0.5 }`, i.e. the
     * center of the viewport.
     **/
    readonly anchor$: Animated.ValueXY;
    private _locationOffsetBase$: Animated.ValueXY;
    private _locationOffsetBase: IPoint;
    private _scale: IPoint;
    private _hasScale = false;
    private _anchor: IPoint;
    private _panVelocty$: Animated.ValueXY;
    private _panVelocty: IPoint;
    private _isPanning = false;
    private _panResponder?: PanResponderInstance;
    private _descelerationAnimation?: Animated.CompositeAnimation;
    private _viewOffset: IPoint;
    private _containerSize: IPoint;
    private _hasContainerSize = false;
    private _itemCounter = 0;
    private _itemViewCounter = 0;
    private _needsRender = true;
    private _emptyRender = false;
    private _animatedSubscriptions: { [id: string]: Animated.Value<number> | Animated.ValueXY } = {};
    private _memoryWarningListener?: () => void;
    private _scrollLocked$ = new Animated.Value<number>(0);
    private _scrollLocked = false;

    constructor(props: RecyclerCollectionViewProps) {
        super(props);

        this.clock = props.clock || new Animated.Clock();
        this.layoutSources =[ ...props.layoutSources ];

        this._containerSize = zeroPoint();
        this.containerSize$ = new Animated.ValueXY();
        let sub = this.containerSize$.addListener(p => {
            if (p.x <= 0 || p.y <= 0) {
                console.debug('Ignoring invalid containerSize value: ' + JSON.stringify(p));
                return;
            }
            if (Math.abs(p.x - this._containerSize.x) < 1 && Math.abs(p.y - this._containerSize.y) < 1) {
                return;
            }
            this._containerSize = p;
            this.didChangeContainerSize();
        });
        this._animatedSubscriptions[sub] = this.containerSize$;

        // Set scale to zero to prevent rendering a lot
        // of items on the first render.
        this.scale$ = normalizeAnimatedValueXY(props.scale, this, this.containerSize$);
        this._scale = {
            // @ts-ignore: _value is private
            x: this.scale$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.scale$.y._value || 0,
        };
        sub = this.scale$.addListener(p => {
            if (p.x === 0 || p.y === 0) {
                console.debug('Ignoring invalid scale value: ' + JSON.stringify(p));
                return;
            }
            if (p.x === this._scale.x && p.y === this._scale.y) {
                return;
            }
            this._scale = p;
            this.didChangeScale();
        });
        this._animatedSubscriptions[sub] = this.scale$;

        this.anchor$ = normalizeAnimatedValueXY(props.anchor, this);
        this._anchor = {
            // @ts-ignore: _value is private
            x: this.anchor$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.anchor$.y._value || 0,
        };
        sub = this.anchor$.addListener(p => {
            if (p.x === this._anchor.x && p.y === this._anchor.y) {
                return;
            }
            this._anchor = p;
            this.didChangeAnchor();
        });
        this._animatedSubscriptions[sub] = this.anchor$;

        this._locationOffsetBase$ = normalizeAnimatedValueXY(props.location, this);
        this._locationOffsetBase = {
            // @ts-ignore: _value is private
            x: this._locationOffsetBase$.x._value || 0,
            // @ts-ignore: _value is private
            y: this._locationOffsetBase$.y._value || 0,
        };
        sub = this._locationOffsetBase$.addListener(p => {
            this._locationOffsetBase = p;
            this.didChangeLocation();
        });
        this._animatedSubscriptions[sub] = this._locationOffsetBase$;

        this._viewOffset = zeroPoint();
        this.viewOffset$ = new Animated.ValueXY();
        sub = this.viewOffset$.addListener(p => this._onViewOffsetChange(p));
        this._animatedSubscriptions[sub] = this.viewOffset$;

        this._panVelocty = zeroPoint();
        this._panVelocty$ = new Animated.ValueXY();
        sub = this._panVelocty$.addListener(p => {
            // console.debug('v: ' + JSON.stringify(p));
            this._panVelocty = p;
        });
        this._animatedSubscriptions[sub] = this._panVelocty$;

        let {
            horizontalScrollEnabled = true,
            verticalScrollEnabled = true,
        } = this.props;
        if (horizontalScrollEnabled || verticalScrollEnabled) {
            let panGestureState: Animated.Mapping = {};
            if (horizontalScrollEnabled) {
                panGestureState.dx = this.viewOffset$.x;
                panGestureState.vx = this._panVelocty$.x;
            }
            if (verticalScrollEnabled) {
                panGestureState.dy = this.viewOffset$.y;
                panGestureState.vy = this._panVelocty$.y;
            }
            const lockTruthFactory = () => {
                return removeDefaultCurry(() => {
                    this._lockScroll();
                    return true;
                });
            };
            this._panResponder = PanResponder.create({
                onStartShouldSetPanResponder: lockTruthFactory(),
                onStartShouldSetPanResponderCapture: lockTruthFactory(),
                onMoveShouldSetPanResponder: lockTruthFactory(),
                onMoveShouldSetPanResponderCapture: lockTruthFactory(),
                onPanResponderStart: removeDefaultCurry(() => this._onBeginPan()),
                onPanResponderMove: removeDefaultCurry(Animated.event([null, panGestureState])),
                onPanResponderEnd: removeDefaultCurry(() => this._onEndPan()),
            });
        }

        this.state = {
            renderNonce: 0,
        };

        this._configureLayoutSources();
    }

    componentDidMount() {
        this._bindToAppEvents();
        this._updateLayoutSources();
    }

    componentWillUnmount() {
        this._unbindFromAppEvents();
        this._uncofigureLayoutSources();

        this._descelerationAnimation?.stop();
        for (let sub of Object.keys(this._animatedSubscriptions)) {
            let value = this._animatedSubscriptions[sub];
            value.stopAnimation();
            value.removeListener(sub);
        }
        this._animatedSubscriptions = {};
    }

    UNSAFE_componentWillUpdate() {
        // console.debug('UNSAFE_componentWillUpdate');
        this._updateLayoutSources();
    }

    // getSnapshotBeforeUpdate(
    //     prevProps: RecyclerCollectionViewProps,
    //     prevState: RecyclerCollectionViewState
    // ): RecyclerCollectionViewSnapshot | null {
    //     console.debug('getSnapshotBeforeUpdate');
    //     return { renderItems: true };
    //     // if (this.state.renderNonce !== prevState.renderNonce) {
    //     //     return { renderItems: true };
    //     // }
    //     // return null;
    // }

    // // static getDerivedStateFromProps(
    // //     prevProps: RecyclerCollectionViewProps,
    // //     prevState: RecyclerCollectionViewState
    // // ) {
    // //     // console.debug('getDerivedStateFromProps');
    // // }

    // componentDidUpdate(
    //     prevProps: RecyclerCollectionViewProps,
    //     prevState: RecyclerCollectionViewState,
    //     snapshot: RecyclerCollectionViewSnapshot | null,
    // ) {
    //     // snapshot here is the value returned from getSnapshotBeforeUpdate
    //     console.debug('componentDidUpdate');
    //     if (snapshot !== null) {
    //         if (snapshot.renderItems) {
    //             this._prerenderLayoutSources();
    //         }
    //     }
    // }

    private _configureLayoutSources() {
        for (let layoutSource of this.layoutSources) {
            layoutSource.configure(this);
        }
    }

    private _uncofigureLayoutSources() {
        for (let layoutSource of this.layoutSources) {
            layoutSource.unconfigure();
        }
    }

    private _onViewOffsetChange({ x, y }: IPoint) {
        this._viewOffset = { x, y };
        this.didChangeViewOffset();
    }

    private _lockScroll() {
        if (this._scrollLocked) {
            return;
        }
        this._scrollLocked = true;
        this._scrollLocked$.setValue(1);
    }

    private _unlockScroll() {
        if (!this._scrollLocked) {
            return;
        }
        this._scrollLocked = false;
        this._scrollLocked$.setValue(0);
    }

    private _onBeginPan() {
        this._lockScroll();
        this._isPanning = true;
        this._descelerationAnimation?.stop();
        this._descelerationAnimation = undefined;
        this.viewOffset$.setValue(zeroPoint());
    }

    private _onEndPan() {
        this._unlockScroll();
        this._isPanning = false;

        let handled = false;
        let {
            locationOffset: location,
            panVelocity,
            contentVelocity: velocity,
         } = this;
        let isZeroVelocity = Math.abs(panVelocity.x) < kPanSpeedMin && Math.abs(panVelocity.y) < kPanSpeedMin;

        if (this.props.snapToLocation) {
            let scrollInfo: IScrollInfo = {
                location: { ...location },
                velocity,
                offset: this.viewOffset,
                scaledVelocity: { ...panVelocity },
            };
            let maybeScrollLocation = this.props.snapToLocation?.(scrollInfo);
            if (typeof maybeScrollLocation !== 'undefined') {
                // Scroll to location
                let scrollLocation: IPoint = {
                    ...location,
                    ...maybeScrollLocation,
                };
                this.scrollToLocation({
                    location: scrollLocation,
                    velocity,
                    animated: true,
                });
                handled = true;
            }
        }

        if (!handled) {
            if (!isZeroVelocity) {
                // Decay velocity
                this._descelerationAnimation = Animated.decay(
                    this.viewOffset$, // Auto-multiplexed
                    { velocity: panVelocity }
                );
                this._descelerationAnimation.start(info => this._onEndDeceleration(info));
            } else {
                this._onEndDeceleration({ finished: true });
            }
        }

        this._panVelocty = zeroPoint();
    }

    private _onEndDeceleration(info: { finished: boolean }) {
        this._transferViewOffsetToLocation();
        this._descelerationAnimation = undefined;
    }

    private _transferViewOffsetToLocation() {
        let location = {
            x: this._locationOffsetBase.x + this._viewOffset.x / this._scale.x,
            y: this._locationOffsetBase.y + this._viewOffset.y / this._scale.y,
        };
        this._viewOffset = zeroPoint();
        this._locationOffsetBase = location;

        this.viewOffset$.setValue(zeroPoint());
        this._locationOffsetBase$.setValue(location);
    }

    get containerOriginOffset(): IPoint {
        let { x: x0, y: y0 } = this._anchor;
        let { x: width, y: height } = this.containerSize;
        return {
            // x: -this._viewportInsets.left - width * x0,
            // y: -this._viewportInsets.top - height * y0,
            x: -width * x0,
            y: -height * y0,
        };
    }

    get containerOriginOffset$(): IAnimatedPoint {
        let { x: x0, y: y0 } = this.anchor$;
        let { x: width, y: height } = this.containerSize$;
        return {
            x: negate$(Animated.multiply(
                width,
                x0,
            )),
            y: negate$(Animated.multiply(
                height,
                y0,
            )),
        };
    }

    get locationOffset(): IPoint {
        return {
            x: this._locationOffsetBase.x + this._viewOffset.x / this._scale.x,
            y: this._locationOffsetBase.y + this._viewOffset.y / this._scale.y,
        };
    }

    get locationOffset$(): IAnimatedPoint {
        return {
            x: Animated.add(
                this._locationOffsetBase$.x,
                Animated.divide(
                    this.viewOffset$.x,
                    this.scale$.x,
                ),
            ),
            y: Animated.add(
                this._locationOffsetBase$.y,
                Animated.divide(
                    this.viewOffset$.y,
                    this.scale$.y,
                ),
            ),
        };
    }

    get containerSize(): IPoint {
        return { ...this._containerSize };
    }

    get viewOffset(): IPoint {
        return { ...this._viewOffset };
    }

    get panVelocity(): IPoint {
        return { ...this._panVelocty };
    }

    get contentVelocity(): IPoint {
        return this.unscaleVector(this._panVelocty);
    }

    get needsRender(): boolean {
        return this._needsRender;
    }

    setNeedsRender() {
        if (this._needsRender) {
            return;
        }
        console.debug('setNeedsRender');
        this._needsRender = true;
        setTimeout(() => this.setState({ renderNonce: this.state.renderNonce + 1 }), 0);
        // this.setState({ renderNonce: this.state.renderNonce + 1 });
    }

    didChangeViewOffset() {
        this.setNeedsUpdate();
    }

    didChangeContainerSize() {
        this.didChangeViewportSize();
    }

    didChangeViewportSize() {
        this.setNeedsUpdate();
        this.props.onViewportSizeChanged?.(this);
    }

    didChangeLocation() {
        this.setNeedsUpdate();
    }

    didChangeScale() {
        this.setNeedsUpdate();
    }

    didChangeAnchor() {
        this.setNeedsUpdate();
    }

    setNeedsUpdate() {
        if (!this._hasContainerSize) {
            if (this._containerSize.x >= 1 && this._containerSize.y >= 1) {
                this._hasContainerSize = true;
            } else {
                // Wait for a valid container size before updating
                return;
            }
        }
        if (!this._hasScale) {
            if (this._scale.x !== 0 && this._scale.y !== 0) {
                this._hasScale = true;
            } else {
                // Wait for a valid scale before updating
                return;
            }
        }

        for (let layoutSource of this.layoutSources) {
            layoutSource.setNeedsUpdate(this);
        }
    }

    get scale(): IPoint {
        return { ...this._scale };
    }

    /**
     * Transforms a vector in content coordinates
     * to a vector in view coordinates (offset).
     * @param point 
     */
    scaleVector(point: IPoint): IPoint {
        return {
            x: point.x * this._scale.x,
            y: point.y * this._scale.y,
        };
    }

    /**
     * Transforms a vector in view coordinates (offset)
     * to a vector in content coordinates.
     * @param point 
     */
    unscaleVector(point: IPoint): IPoint {
        if (this._scale.x === 0 || this._scale.y === 0) {
            return zeroPoint();
        }
        return {
            x: point.x / this._scale.x,
            y: point.y / this._scale.y,
        };
    }

    /**
     * Transforms a point in content coordinates
     * to a point in container coordinates.
     * @param point 
     */
    getContainerLocation(
        point: IPoint,
        options?: {
            scale?: Partial<IPoint>;
        }
    ): IPoint {
        let { x: xl0, y: yl0 } = this._locationOffsetBase;
        let { x: x0, y: y0 } = this.containerOriginOffset;
        let cp: IPoint = {
            x: this._viewOffset.x - x0,
            y: this._viewOffset.y - y0,
        };
        let scale: IPoint = {
            x: this._scale.x,
            y: this._scale.y,
        };
        if (options?.scale) {
            if (options.scale.x) {
                scale.x *= options.scale.x;
            }
            if (options.scale.y) {
                scale.y *= options.scale.y;
            }
        }
        cp.x += (point.x + xl0) * scale.x;
        cp.y += (point.y + yl0) * scale.y;
        return cp;
    }

    /**
     * Transforms a point in content coordinates
     * to a point in container coordinates.
     * @param point 
     */
    getContainerLocation$(
        point: IAnimatedPoint | Animated.ValueXY,
        options?: {
            scale?: Partial<IAnimatedPoint> | Partial<Animated.ValueXY>;
        }
    ): IAnimatedPoint {
        let { x: xl0, y: yl0 } = this._locationOffsetBase$;
        let { x: x0, y: y0 } = this.containerOriginOffset$;
        let cp: IAnimatedPoint = {
            x: Animated.subtract(
                this.viewOffset$.x,
                x0,
            ),
            y: Animated.subtract(
                this.viewOffset$.y,
                y0,
            ),
        };
        let scale: IAnimatedPoint = {
            x: this.scale$.x,
            y: this.scale$.y,
        };
        if (options?.scale) {
            if (options.scale.x) {
                scale.x = Animated.multiply(scale.x, options.scale.x);
            }
            if (options.scale.y) {
                scale.y = Animated.multiply(scale.y, options.scale.y);
            }
        }
        cp.x = Animated.add(
            cp.x,
            Animated.multiply(
                Animated.add(
                    point.x,
                    xl0,
                ),
                scale.x,
            ),
        );
        cp.y = Animated.add(
            cp.y,
            Animated.multiply(
                Animated.add(
                    point.y,
                    yl0,
                ),
                scale.y,
            ),
        );
        return cp;
    }

    /**
     * Transforms a point in view coordinates (offset)
     * to a point in content coordinates.
     * @param point 
     */
    getLocation(point: IPoint): IPoint {
        if (this._scale.x === 0 || this._scale.y === 0) {
            return zeroPoint();
        }
        let { x: xl0, y: yl0 } = this._locationOffsetBase;
        let { x: x0, y: y0 } = this.containerOriginOffset;
        return {
            x: -xl0 - (point.x - x0) / this._scale.x,
            y: -yl0 - (point.y - y0) / this._scale.y,
        };
    }

    scrollToLocation(
        options: { location: IPoint } & Partial<IScrollBaseOptions>
    ): Animated.CompositeAnimation | undefined {
        // console.debug('scrollToLocation: ' + JSON.stringify(options.location));
        if (this._isPanning) {
            return;
        }
        this._descelerationAnimation?.stop();
        this._descelerationAnimation = undefined;

        this._transferViewOffsetToLocation();

        if (!options.animated) {
            this._locationOffsetBase$.setValue(options.location);
            let info = { finished: true };
            this._onEndDeceleration(info);
            options.onEnd?.(info);
            return;
        }

        this._descelerationAnimation = Animated.spring(
            this._locationOffsetBase$, // Auto-multiplexed
            {
                toValue: options.location,
                velocity: options.velocity || this.contentVelocity,
                bounciness: 0,
                // friction: 4,
                ...options,
            }
        );
        if (!options.manualStart) {
            this._descelerationAnimation.start(info => {
                this._onEndDeceleration(info);
                options.onEnd?.(info);
            });
        }
        return this._descelerationAnimation;
    }

    render() {
        // console.debug('render collection view');
        // console.debug('begin render collection view');
        this._needsRender = false;

        this._emptyRender = false;
        if (this._containerSize.x === 0 || this._containerSize.y === 0) {
            this._emptyRender = true;
        }

        let itemViews: React.ReactNode[] = [];
        for (let layoutSource of this.layoutSources) {
            itemViews = itemViews.concat(this._renderLayoutSource(layoutSource));
        }
        if (itemViews.length === 0) {
            this._emptyRender = true;
        }
        // console.debug('end render collection view');

        return (
            <Animated.View
                {...this.props}
                {...this._panResponder?.panHandlers}
                style={[
                    this.props.style,
                    {
                        overflow: "hidden",
                    },
                ]}
                onLayout={(event: any) => {
                    Animated.event(
                        [{
                            nativeEvent: {
                                layout: {
                                    width: this.containerSize$.x,
                                    height: this.containerSize$.y,
                                }
                            }
                        }]
                    )(event);
                    this.props.onLayout?.(event);
                }}
            >
                <ScrollLock locked={this._scrollLocked$} />
                {itemViews}
            </Animated.View>
        );
    }

    createItemViewRef(): React.RefObject<any> {
        return React.createRef();
    }

    private _updateLayoutSources() {
        for (let layoutSource of this.layoutSources) {
            this._updateLayoutSource(layoutSource);
        }
    }

    private _updateLayoutSource<T>(layoutSource: LayoutSource<T>) {
        // console.debug(`[${layoutSource.id}] begin prerender`);
        layoutSource.updateItems(this, { create: true });
        // console.debug(`[${layoutSource.id}] end prerender`);
    }

    private _renderLayoutSource<T>(layoutSource: LayoutSource<T>): React.ReactNode[] {
        // console.debug(`[${layoutSource.id}] begin render`);
        let items: React.ReactNode[] = [];

        layoutSource.beginUpdate(this);
        try {
            for (let index of layoutSource.visibleIndexes()) {
                let item = layoutSource.getVisibleItem(index);
                if (!item || !item.ref) {
                    // We cannot dequeue a item as it would trigger a `findDOMNode` event inside `render()`.
                    console.warn('Creating item in render method. This should have been done in UNSAFE_componentWillUpdate().');
                    item = layoutSource.createItem(index, this);
                }
                items.push(this._renderItem(item, layoutSource));
            }
            layoutSource.commitUpdate(this);
        } catch (error) {
            console.error('Error during render: ' + error?.message || error);
            layoutSource.cancelUpdate(this);
        }

        // console.debug(`[${layoutSource.id}] end render`);
        return items;
    }

    private _renderItem<T>(item: IItem, layoutSource: LayoutSource<T>): React.ReactNode {
        let viewID = String(++this._itemViewCounter);
        return (
            <ItemView
                key={viewID}
                id={viewID}
                item={item}
                layoutSource={layoutSource}
                renderItem={() => this.props.renderItem(item, layoutSource, this)}
            />
        );
    }

    private _bindToAppEvents() {
        if (!this._memoryWarningListener) {
            // Clear queue on memroy warning
            this._memoryWarningListener = () => {
                console.warn('Clearing queue due to memory warning');
                for (let layoutSource of this.layoutSources) {
                    layoutSource.clearQueue();
                }
            };
            AppState.addEventListener(
                'memoryWarning',
                this._memoryWarningListener,
            );
        }
    }

    private _unbindFromAppEvents() {
        if (this._memoryWarningListener) {
            AppState.removeEventListener(
                'memoryWarning',
                this._memoryWarningListener,
            );
            this._memoryWarningListener = undefined;
        }
    }
}
