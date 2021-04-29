import React from 'react';
import {
    Animated,
    AppState,
    Easing,
    GestureResponderEvent,
    InteractionManager,
    PanResponder,
    PanResponderCallbacks,
    PanResponderGestureState,
    PanResponderInstance,
} from 'react-native';
import { WeakRef } from '@ungap/weakrefs';
import {
    Evergrid,
    ItemView,
    kLayoutLinkAxes,
    kPanPressableCallbackKeys,
    kPanResponderCallbackKeys,
    LayoutSource,
} from './internal';
import {
    AnimatedValueXYDerivedInput,
    IAnimatedPoint,
    IPoint,
    IAnimationBaseOptions,
    PanPressableOptions,
    PanPressableCallbacks,
    IInsets,
    LayoutLinkAxis,
} from './types';
import { insetPoint, insetSize, insetTranslation, zeroPoint } from './util';
import {
    concatFunctions,
    insetSize$,
    negate$,
    normalizeAnimatedDerivedValueXY,
    removeDefaultCurry,
    safeFunction,
} from './rnUtil';

const kPanSpeedMin = 0.001;

const kDefaultProps: Required<EvergridLayoutPrimitiveProps> = {
    panEnabled: true,
    verticalPanEnabled: true,
    horizontalPanEnabled: true,
    zIndexStart: 0,
    zIndexStride: 0,
    useNativeDriver: false,
    delayLongPress: 500,
    longPressMaxDistance: 3,
};

export const kEvergridLayoutCallbackKeys: (keyof EvergridLayoutCallbacks)[] = [
    ...kPanPressableCallbackKeys,
    ...kPanResponderCallbackKeys,
    'snapToLocation',
    'onViewportSizeChanged',
    'onScaleChanged',
    'onEndInteraction',
];

export interface IScrollInfo {
    /** Content location in content coordinates. */
    location: IPoint;
    /** Content velocity in content coordinates. */
    velocity: IPoint;
    /** Viewport location in view coordinates (pixels). */
    offset: IPoint;
    /** Viewport velocity in view coordinates (pixels). */
    scaledVelocity: IPoint;
}

export interface IScrollToOffsetOptions {
    offset: Partial<IPoint>;
}

export interface IScrollToRangeOptions {
    range: [Partial<IPoint>, Partial<IPoint>];
    insets?: Partial<IInsets<number>>;
}

export interface IUpdateInfo {
    initial: boolean;
}

/**
 * Note that values returned by pan responder callbacks are ignored.
 **/
export interface EvergridLayoutCallbacks
    extends PanPressableCallbacks,
        PanResponderCallbacks {
    snapToLocation?: (info: IScrollInfo) => Partial<IPoint> | undefined;
    onViewportSizeChanged?: (collection: EvergridLayout) => void;
    /**
     * Called when the scale changes.
     */
    onScaleChanged?: (view: EvergridLayout) => void;
    onStartInteraction?: (view: EvergridLayout) => void;
    onEndInteraction?: (view: EvergridLayout) => void;
}

interface EvergridLayoutPrimitiveProps extends PanPressableOptions {
    /** Enabled by default. */
    panEnabled?: boolean;
    /** Enabled by default. */
    verticalPanEnabled?: boolean;
    /** Enabled by default. */
    horizontalPanEnabled?: boolean;
    /**
     * The first z-index to use when adding layout sources.
     * Defaults to 10.
     *
     * If a layout source [defines their own]{@link LayoutSourceProps#zIndex}
     * non-zero z-index, this will not override it.
     */
    zIndexStart?: number;
    /**
     * The distance between z-indexes in layout sources.
     * Defaults to 10.
     *
     * If a layout source [defines their own]{@link LayoutSourceProps#zIndex}
     * non-zero z-index, this will not override it.
     */
    zIndexStride?: number;
    /**
     * **Not Supported**
     *
     * ~~When `true`, enables performing animations on native side
     * without going through the javascript bridge on every frame.~~
     * Falls back to javascript animation when not supported.
     * See [React Native Documentation](https://reactnative.dev/docs/animated#using-the-native-driver)
     * for more info.
     *
     * Defaults to `false`.
     **/
    useNativeDriver?: boolean;
}

export interface EvergridLayoutProps extends EvergridLayoutPrimitiveProps {
    layoutSources?: LayoutSource<any>[];
    /** Initial offset in content coordinates. */
    offset?: AnimatedValueXYDerivedInput<EvergridLayout>;
    /** Initial offset in view coordinates. */
    viewOffset?: AnimatedValueXYDerivedInput<EvergridLayout>;
    /**
     * Scale relating content and view coordinate systems.
     *
     * Changing the sign of a scale component is not supported.
     */
    scale?: AnimatedValueXYDerivedInput<EvergridLayout>;
    /**
     * The point with values in the range 0-1.
     * The point represents the origin in the viewport.
     * Scaling also happens about this point.
     *
     * Defaults to `{ x: 0.5, y: 0.5 }`, i.e. the
     * center of the viewport.
     **/
    anchor?: AnimatedValueXYDerivedInput<EvergridLayout>;
    /**
     * Modify the pan target.
     * Defaults to [viewOffset]{@link EvergridLayout#viewOffset}
     */
    panTarget?: Animated.ValueXY;
    /** Enabled by default. */
    panEnabled?: boolean;
    /** Enabled by default. */
    verticalPanEnabled?: boolean;
    /** Enabled by default. */
    horizontalPanEnabled?: boolean;
    /**
     * The first z-index to use when adding layout sources.
     * Defaults to 10.
     *
     * If a layout source [defines their own]{@link LayoutSourceProps#zIndex}
     * non-zero z-index, this will not override it.
     */
    zIndexStart?: number;
    /**
     * The distance between z-indexes in layout sources.
     * Defaults to 10.
     *
     * If a layout source [defines their own]{@link LayoutSourceProps#zIndex}
     * non-zero z-index, this will not override it.
     */
    zIndexStride?: number;
    /**
     * **Not Supported**
     *
     * ~~When `true`, enables performing animations on native side
     * without going through the javascript bridge on every frame.~~
     * Falls back to javascript animation when not supported.
     * See [React Native Documentation](https://reactnative.dev/docs/animated#using-the-native-driver)
     * for more info.
     *
     * Defaults to `false`.
     **/
    useNativeDriver?: boolean;
}

export default class EvergridLayout {
    panEnabled: boolean;
    verticalPanEnabled: boolean;
    horizontalPanEnabled: boolean;
    zIndexStart: number;
    zIndexStride: number;
    useNativeDriver: boolean;
    longPressMaxDistance: number;
    delayLongPress: number;

    readonly callbacks: EvergridLayoutCallbacks;

    private _layoutSources: LayoutSource<any>[];
    readonly viewOffset$: Animated.ValueXY;
    /** Animated container size in view coordinates. */
    readonly containerSize$: Animated.ValueXY;
    /** Animated container offset in parent view coordinates. */
    readonly containerOffset$: Animated.ValueXY;
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
    readonly panResponder?: PanResponderInstance;

    private _weakViewRef?: WeakRef<Evergrid>;

    private _locationOffsetBase$: Animated.ValueXY;
    private _locationOffsetBase: IPoint;
    private _scale: IPoint;
    private _hasScale = false;
    private _anchor: IPoint;
    private _panVelocty$: Animated.ValueXY;
    private _panVelocty: IPoint;
    private _panStarted = false;
    private _panDefaultPrevented = false;
    private _panTarget$: Animated.ValueXY;
    private _longPressTimer?: any;
    private _isLongPress = false;
    private _pressInEvent?: GestureResponderEvent;
    private _pressInGestureState?: PanResponderGestureState;
    private _descelerationAnimation?: Animated.CompositeAnimation;
    private _viewOffset: IPoint;
    private _containerSize: IPoint;
    private _hasContainerSize = false;
    private _containerOffset: IPoint;
    private _itemViewCounter = 0;
    private _animatedSubscriptions: {
        [id: string]: Animated.Value | Animated.ValueXY;
    } = {};
    private _memoryWarningListener?: () => void;
    private _interactionHandle = 0;
    private _updateDepth = 0;
    private _updateTimer?: any;
    // private _mounted = false;

    private _locationOffsetTarget: Partial<IPoint>;
    private _scaleTarget: Partial<IPoint>;
    private _targetDepth = 0;

    private _linkedGridRefs: {
        x: WeakRef<EvergridLayout>[];
        y: WeakRef<EvergridLayout>[];
        xy: WeakRef<EvergridLayout>[];
    } = { x: [], y: [], xy: [] };

    constructor(options?: EvergridLayoutCallbacks & EvergridLayoutProps) {
        let {
            layoutSources,
            offset,
            viewOffset,
            scale,
            anchor,
            panTarget,
            panEnabled,
            verticalPanEnabled,
            horizontalPanEnabled,
            zIndexStart,
            zIndexStride,
            useNativeDriver,
            longPressMaxDistance,
            delayLongPress,
            snapToLocation,
            onViewportSizeChanged,
            onScaleChanged,
        } = { ...kDefaultProps, ...options };

        this._layoutSources = [];

        this.zIndexStart = zIndexStart;
        this.zIndexStride = zIndexStride;

        this.useNativeDriver = useNativeDriver || kDefaultProps.useNativeDriver;
        if (this.useNativeDriver) {
            throw new Error(
                'Using native driver is not supported due to limitations with animating layout props.'
            );
        }

        this.longPressMaxDistance = longPressMaxDistance;
        this.delayLongPress = delayLongPress;

        this.callbacks = {
            snapToLocation,
            onViewportSizeChanged,
            onScaleChanged,
        };
        for (let cbKey of kEvergridLayoutCallbackKeys) {
            if (options?.[cbKey]) {
                this.callbacks[cbKey] = options[cbKey] as any;
            }
        }

        let sub = '';

        this._containerSize = zeroPoint();
        this.containerSize$ = new Animated.ValueXY();
        sub = this.containerSize$.addListener(p => {
            if (p.x <= 0 || p.y <= 0) {
                // console.debug('Ignoring invalid containerSize value: ' + JSON.stringify(p));
                return;
            }
            if (
                Math.abs(p.x - this._containerSize.x) < 1 &&
                Math.abs(p.y - this._containerSize.y) < 1
            ) {
                return;
            }
            this._containerSize = p;
            this._didChangeContainerSize();
        });
        this._animatedSubscriptions[sub] = this.containerSize$;

        this._containerOffset = zeroPoint();
        this.containerOffset$ = new Animated.ValueXY();
        sub = this.containerOffset$.addListener(p => {
            if (
                Math.abs(p.x - this._containerOffset.x) < 1 &&
                Math.abs(p.y - this._containerOffset.y) < 1
            ) {
                return;
            }
            this._containerOffset = p;
            this._didChangeContainerOffset();
        });
        this._animatedSubscriptions[sub] = this.containerOffset$;

        this.scale$ = normalizeAnimatedDerivedValueXY(scale, {
            info: this,
            defaults: { x: 1, y: 1 },
        });
        this._scale = {
            // @ts-ignore: _value is private
            x: this.scale$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.scale$.y._value || 0,
        };
        let _previousScale = { ...this._scale };
        sub = this.scale$.addListener(p => {
            if (p.x === 0 || p.y === 0) {
                // console.debug('Ignoring invalid scale value: ' + JSON.stringify(p));
                return;
            }
            if (p.x === this._scale.x && p.y === this._scale.y) {
                return;
            }
            _previousScale.x = this._scale.x;
            _previousScale.y = this._scale.y;
            // TODO: Reload all items if scale changes sign.
            this._scale = p;
            this._didChangeScale(_previousScale, p);
        });
        this._animatedSubscriptions[sub] = this.scale$;

        this._scaleTarget = {};

        this.anchor$ = normalizeAnimatedDerivedValueXY(anchor, {
            info: this,
        });
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
            this._didChangeAnchor();
        });
        this._animatedSubscriptions[sub] = this.anchor$;

        this._locationOffsetBase$ = normalizeAnimatedDerivedValueXY(offset, {
            info: this,
        });
        this._locationOffsetBase = {
            // @ts-ignore: _value is private
            x: this._locationOffsetBase$.x._value || 0,
            // @ts-ignore: _value is private
            y: this._locationOffsetBase$.y._value || 0,
        };
        let _previousLocation = { ...this._locationOffsetBase };
        sub = this._locationOffsetBase$.addListener(p => {
            _previousLocation.x = this._locationOffsetBase.x;
            _previousLocation.y = this._locationOffsetBase.y;
            this._locationOffsetBase = p;
            this._didChangeLocationOffsetBase(_previousLocation, p);
        });
        this._animatedSubscriptions[sub] = this._locationOffsetBase$;

        this._locationOffsetTarget = {};

        this.viewOffset$ = normalizeAnimatedDerivedValueXY(viewOffset, {
            info: this,
        });
        this._viewOffset = {
            // @ts-ignore: _value is private
            x: this.viewOffset$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.viewOffset$.y._value || 0,
        };
        sub = this.viewOffset$.addListener(p => this._onViewOffsetChange(p));
        this._animatedSubscriptions[sub] = this.viewOffset$;

        this._panTarget$ = panTarget || this.viewOffset$;

        this._panVelocty = zeroPoint();
        this._panVelocty$ = new Animated.ValueXY();
        sub = this._panVelocty$.addListener(p => {
            // console.debug('v: ' + JSON.stringify(p));
            this._panVelocty = p;
        });
        this._animatedSubscriptions[sub] = this._panVelocty$;

        if (!horizontalPanEnabled && !verticalPanEnabled) {
            panEnabled = false;
        }
        this.horizontalPanEnabled = horizontalPanEnabled;
        this.verticalPanEnabled = verticalPanEnabled;
        this.panEnabled = panEnabled;

        if (panEnabled) {
            let panGestureState: Animated.Mapping = {};
            if (horizontalPanEnabled) {
                panGestureState.dx = this._panTarget$.x;
                panGestureState.vx = this._panVelocty$.x;
            }
            if (verticalPanEnabled) {
                panGestureState.dy = this._panTarget$.y;
                panGestureState.vy = this._panVelocty$.y;
            }
            const aquire = () => {
                return (e: GestureResponderEvent): boolean => {
                    if (!panEnabled) {
                        return false;
                    }
                    // e?.preventDefault?.();
                    // this._lockScroll();
                    // console.debug('acquire pan');
                    return true;
                };
            };
            let panConfig: PanResponderCallbacks = {
                onStartShouldSetPanResponder: aquire(),
                // onStartShouldSetPanResponderCapture: aquire(),
                onMoveShouldSetPanResponder: aquire(),
                // onMoveShouldSetPanResponderCapture: aquire(),
                onPanResponderStart: removeDefaultCurry((e, g) =>
                    this._onBeginPan(e, g)
                ),
                onPanResponderMove: (...args: any[]) => {
                    if (this._panDefaultPrevented) {
                        return;
                    }
                    Animated.event([null, panGestureState], {
                        // listener: event => {},
                        useNativeDriver: this.useNativeDriver,
                    })(...args);
                },
                onPanResponderEnd: (e, g) => this._onPressOut(e, g),
                onPanResponderTerminate: (e, g) => this._onPressOut(e, g),
            };
            // Add external callbacks
            for (let cbKey of kPanResponderCallbackKeys) {
                panConfig[cbKey] = concatFunctions(
                    safeFunction(this.callbacks[cbKey]),
                    panConfig[cbKey]
                );
            }
            this.panResponder = PanResponder.create(panConfig);
        }

        // In case a view offset was specified, transfer this
        // offset to location.
        this._transferViewOffsetToLocation();

        this.setLayoutSources(layoutSources || []);
    }

    /**
     * Called when the layout is added to the view
     * and before the view is mounted.
     *
     * Subclasses must call the super implementation.
     *
     * @param view
     */
    configure(view: Evergrid) {
        this.view = view;
        this.componentDidInit();
    }

    componentDidInit() {}

    componentDidMount() {
        // this._mounted = true;
        this._bindToAppEvents();
    }

    componentWillUnmount() {
        // this._mounted = false;
        this.cancelScheduledUpdate();

        this._unbindFromAppEvents();

        this._descelerationAnimation?.stop();
        for (let sub of Object.keys(this._animatedSubscriptions)) {
            let value = this._animatedSubscriptions[sub];
            value.stopAnimation();
            value.removeListener(sub);
        }
        this._animatedSubscriptions = {};

        this._resetLongPress();
    }

    linkedLayouts(axis: LayoutLinkAxis): EvergridLayout[] {
        return this._linkedGridRefs[axis]
            .map(ref => ref.deref())
            .filter(x => !!x);
    }

    allLinkedLayouts(): EvergridLayout[] {
        let layouts: EvergridLayout[] = [];
        for (let axis of kLayoutLinkAxes) {
            for (let layout of this.linkedLayouts(axis)) {
                if (layouts.indexOf(layout) < 0) {
                    layouts.push(layout);
                }
            }
        }
        return layouts;
    }

    linkLayout(layout: EvergridLayout, options: { axis: LayoutLinkAxis }) {
        if (!(layout instanceof EvergridLayout)) {
            throw new Error('Invalid EvergridLayout');
        }
        if (kLayoutLinkAxes.indexOf(options.axis) < 0) {
            throw new Error('Invalid axis');
        }
        if (this.linkedLayouts(options.axis).indexOf(layout) < 0) {
            this._linkedGridRefs[options.axis].push(new WeakRef(layout));
            layout._linkedGridRefs[options.axis].push(new WeakRef(this));

            this._checkLayoutLink(layout, options);

            let cbOptions = { ...options, receiver: this };
            this.didLinkWithLayout(layout, cbOptions);
            layout.didLinkWithLayout(this, cbOptions);
        }
    }

    private _checkLayoutLink(
        layout: EvergridLayout,
        options: { axis: LayoutLinkAxis }
    ) {
        let checkAxes: ('x' | 'y')[] = [];
        if (options.axis === 'xy') {
            checkAxes = ['x', 'y'];
        } else {
            checkAxes = [options.axis];
        }
        for (let axis of checkAxes) {
            if (
                this._locationOffsetBase$[axis] !==
                layout._locationOffsetBase$[axis]
            ) {
                console.warn(
                    `You linked grids in the ${axis}-direction, but didn't use the same offset.${axis}. Create an animated value and use it in both grids.`
                );
            }
            if (this.viewOffset$[axis] !== layout.viewOffset$[axis]) {
                console.warn(
                    `You linked grids in the ${axis}-direction, but didn't use the same viewOffset.${axis}. Create an animated value and use it in both grids.`
                );
            }
            if (this.scale$[axis] !== layout.scale$[axis]) {
                console.warn(
                    `You linked grids in the ${axis}-direction, but didn't use the same scale.${axis}. Create an animated value and use it in both grids.`
                );
            }
        }
    }

    didLinkWithLayout(
        layout: EvergridLayout,
        options: { axis: LayoutLinkAxis; receiver: EvergridLayout }
    ) {}

    get view(): Evergrid {
        let view = this._weakViewRef?.deref();
        if (!view) {
            throw new Error('Trying to access a released object');
        }
        return view;
    }

    private get _maybeView(): Evergrid | undefined {
        return this._weakViewRef?.deref();
    }

    set view(view: Evergrid) {
        if (!view || !(view instanceof Evergrid)) {
            throw new Error('Invalid Evergrid view');
        }
        this._weakViewRef = new WeakRef(view);
    }

    get layoutSources(): LayoutSource[] {
        return [...this._layoutSources];
    }

    setLayoutSources(layoutSources: LayoutSource[]) {
        for (let layoutSource of this._layoutSources) {
            if (layoutSources.indexOf(layoutSource) < 0) {
                // Removed layout source
                layoutSource.unconfigure();
            }
        }

        let previousLayoutSources = this._layoutSources;
        this._layoutSources = [...layoutSources];
        // console.debug('layoutSources: ' + layoutSources.map(s => s.id));

        for (let i = 0; i < layoutSources.length; i++) {
            let layoutSource = layoutSources[i];
            // Check duplicates
            if (layoutSources.indexOf(layoutSource, i) > i) {
                throw new Error(
                    `Cannot add duplicate layout source "${layoutSource.id}"`
                );
            }

            if (previousLayoutSources.indexOf(layoutSource) < 0) {
                // Added layout source
                let i = this._layoutSources.indexOf(layoutSource);
                layoutSource.configure({
                    root: this,
                    zIndex: this.zIndexStart + i * this.zIndexStride,
                });
            }
        }

        this._maybeView?.setNeedsItemRenderMapUpdate();
        this._maybeView?.setNeedsRender();
    }

    addLayoutSource(
        layoutSource: LayoutSource,
        options?: {
            zIndex?: number;
            strict?: boolean;
        }
    ) {
        let {
            strict = false,
            zIndex = this.zIndexStart +
                this._layoutSources.length * this.zIndexStride,
        } = options || {};

        let i = this._layoutSources.indexOf(layoutSource);
        if (i >= 0) {
            if (strict) {
                throw new Error('Layout source is already added.');
            }
            return;
        }

        this._layoutSources.push(layoutSource);
        layoutSource.configure({
            root: this,
            zIndex,
        });

        this._maybeView?.setNeedsItemRenderMapUpdate();
        this._maybeView?.setNeedsRender();
    }

    removeLayoutSource(
        layoutSource: LayoutSource,
        options?: {
            strict?: boolean;
        }
    ) {
        let i = this._layoutSources.indexOf(layoutSource);
        if (i < 0) {
            if (options?.strict) {
                throw new Error('Layout source not found');
            }
            return;
        }
        this._layoutSources.splice(i, 1);
        layoutSource.unconfigure();

        this._maybeView?.setNeedsItemRenderMapUpdate();
        this._maybeView?.setNeedsRender();
    }

    get isPanningContent() {
        return this._panStarted && !this._panDefaultPrevented;
    }

    /**
     * Calling this during a panning gesture, stops
     * the panning gesture until the gesture is finished.
     *
     * This is useful for interacting with content, for example.
     * You can achive this by creating a reference to this node
     * and calling `preventDefaultPan` in `onLongPress` callback.
     */
    preventDefaultPan() {
        if (this._panDefaultPrevented) {
            return;
        }
        this._panDefaultPrevented = true;
        if (this._panStarted) {
            this._onEndPan();
        }
    }

    private _startLongPressTimer() {
        this._resetLongPress();
        let maxDist =
            this.longPressMaxDistance || kDefaultProps.longPressMaxDistance;
        this._longPressTimer = setTimeout(() => {
            let ev = this._pressInEvent;
            let gestureState = this._pressInGestureState;
            if (!ev || !gestureState) {
                return;
            }
            let { dx, dy } = gestureState;
            if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) {
                return;
            }
            this._isLongPress = true;
            this.callbacks.onLongPress?.(ev, gestureState);
        }, this.delayLongPress || kDefaultProps.delayLongPress);
    }

    private _resetLongPress() {
        this._isLongPress = false;
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = undefined;
        }
    }

    private _onViewOffsetChange(p: IPoint) {
        this._viewOffset = p;
        this.setNeedsUpdate();
    }

    private _onBeginPan(
        e: GestureResponderEvent,
        gestureState: PanResponderGestureState
    ) {
        // Since we are reusing a synthetic event,
        // disable event object pooling.
        e.persist();

        this._pressInEvent = e;
        this._pressInGestureState = gestureState;

        this.view.lockScroll();
        this._panStarted = true;
        this._panDefaultPrevented = false;
        this._descelerationAnimation?.stop();
        this._descelerationAnimation = undefined;
        this._panTarget$.setValue(zeroPoint());

        this._startInteraction();

        this.callbacks.onPressIn?.(e, gestureState);
        this._startLongPressTimer();
    }

    private _onPressOut(
        e: GestureResponderEvent,
        gestureState: PanResponderGestureState
    ) {
        this.view.unlockScroll();

        if (this._panStarted) {
            this._onEndPan();
        } else {
            this._endInteration();
        }
        this._panDefaultPrevented = false;

        this.callbacks.onPressOut?.(e, gestureState);
        if (!this._isLongPress) {
            this.callbacks.onPress?.(e, gestureState);
        }
        this._resetLongPress();
    }

    private _onEndPan() {
        this._panStarted = false;

        let handled = this._panDefaultPrevented;
        let {
            locationOffset: offset,
            panVelocity,
            contentVelocity: velocity,
        } = this;

        let isDefaultPan = this._panTarget$ === this.viewOffset$;
        if (isDefaultPan) {
            if (!handled && this.callbacks.snapToLocation) {
                let scrollInfo: IScrollInfo = {
                    location: { ...offset },
                    velocity,
                    offset: this.viewOffset,
                    scaledVelocity: { ...panVelocity },
                };
                let maybeScrollLocation = this.callbacks.snapToLocation(
                    scrollInfo
                );
                if (typeof maybeScrollLocation !== 'undefined') {
                    // Scroll to location
                    let scrollOffset: IPoint = {
                        ...offset,
                        ...maybeScrollLocation,
                    };
                    this.scrollTo({
                        offset: scrollOffset,
                        spring: { velocity },
                        animated: true,
                    });
                    handled = true;
                }
            }

            if (!handled) {
                let isZeroVelocity =
                    Math.abs(panVelocity.x) < kPanSpeedMin &&
                    Math.abs(panVelocity.y) < kPanSpeedMin;
                if (!isZeroVelocity) {
                    // Decay velocity
                    this._descelerationAnimation = Animated.decay(
                        this._panTarget$, // Auto-multiplexed
                        {
                            velocity: panVelocity,
                            useNativeDriver: this.useNativeDriver,
                        }
                    );
                    this._onStartDeceleration();
                    this._descelerationAnimation.start(info =>
                        this._onEndDeceleration(info)
                    );
                } else {
                    this._onEndDeceleration({ finished: true });
                }
                handled = true;
            }
        }

        this._panVelocty = zeroPoint();
    }

    private _onStartDeceleration() {
        this._startInteraction();
    }

    private _onEndDeceleration(info: { finished: boolean }) {
        this._transferViewOffsetToLocation();
        this._panTarget$.setValue(zeroPoint());
        this._descelerationAnimation = undefined;
        this._resetScrollTargetIfNeeded();
        this._endInteration();
    }

    private _startInteraction() {
        if (!this._interactionHandle) {
            this._interactionHandle = InteractionManager.createInteractionHandle();
            this.didStartInteraction();
        }
    }

    private _endInteration() {
        if (this._interactionHandle) {
            InteractionManager.clearInteractionHandle(this._interactionHandle);
            this._interactionHandle = 0;
            this.didEndInteraction();
        }
    }

    get isInteracting(): boolean {
        return this._panStarted || !!this._interactionHandle;
    }

    didStartInteraction() {
        this.callbacks.onStartInteraction?.(this);
    }

    didEndInteraction() {
        this.callbacks.onEndInteraction?.(this);
    }

    private _transferViewOffsetToLocation() {
        this.beginUpdate();
        let location = {
            x: this._locationOffsetBase.x + this._viewOffset.x / this._scale.x,
            y: this._locationOffsetBase.y + this._viewOffset.y / this._scale.y,
        };
        this._viewOffset = zeroPoint();
        this._locationOffsetBase = location;
        this._locationOffsetBase$.setValue(location);
        this.endUpdate();
    }

    get anchor(): IPoint {
        return { ...this._anchor };
    }

    get containerOriginOffset(): IPoint {
        let { x: x0, y: y0 } = this._anchor;
        let { x: width, y: height } = this.containerSize;
        if (this._scale.x < 0) {
            x0 = 1 - x0;
        }
        if (this._scale.y < 0) {
            y0 = 1 - y0;
        }
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
            x: negate$(
                Animated.multiply(
                    width,
                    this._scale.x > 0 ? x0 : Animated.subtract(1, x0)
                )
            ),
            y: negate$(
                Animated.multiply(
                    height,
                    this._scale.y > 0 ? y0 : Animated.subtract(1, y0)
                )
            ),
        };
    }

    get locationOffsetBase(): IPoint {
        return {
            ...this._locationOffsetBase,
            ...this._locationOffsetTarget,
        };
    }

    get locationOffset(): IPoint {
        const locationOffsetBase = this.locationOffsetBase;
        const scale = this.scale;
        return {
            x: locationOffsetBase.x + this._viewOffset.x / scale.x,
            y: locationOffsetBase.y + this._viewOffset.y / scale.y,
        };
    }

    get locationOffset$(): IAnimatedPoint {
        return {
            x: Animated.add(
                this._locationOffsetBase$.x,
                Animated.divide(this.viewOffset$.x, this.scale$.x)
            ),
            y: Animated.add(
                this._locationOffsetBase$.y,
                Animated.divide(this.viewOffset$.y, this.scale$.y)
            ),
        };
    }

    getContainerSize(options?: { insets?: Partial<IInsets<number>> }): IPoint {
        if (options?.insets) {
            return insetSize(this._containerSize, options.insets);
        } else {
            return { ...this._containerSize };
        }
    }

    getContainerSize$(options?: {
        insets?: Partial<IInsets<Animated.Animated>>;
    }): IAnimatedPoint {
        if (options?.insets) {
            return insetSize$(this.containerSize$, options.insets);
        } else {
            return { ...this.containerSize$ };
        }
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
        return this._maybeView?.needsRender || false;
    }

    setNeedsRender() {
        this._maybeView?.setNeedsRender();
    }

    /**
     * Called after container size has changed.
     */
    didChangeContainerSize() {}

    private _didChangeContainerSize() {
        this._didChangeViewportSize();
        this.didChangeContainerSize();
    }

    /**
     * Called after container offset has changed.
     */
    didChangeContainerOffset() {}

    private _didChangeContainerOffset() {
        this.didChangeContainerOffset();
    }

    /**
     * Called after viewport size has changed.
     */
    didChangeViewportSize() {}

    private _didChangeViewportSize() {
        this.setNeedsUpdate();
        this.callbacks.onViewportSizeChanged?.(this);
        this.didChangeViewportSize();
    }

    /**
     * Called before the location is changed as
     * part of a scroll target.
     *
     * Do not modify the points.
     */
    willChangeLocationOffsetBase(
        oldLocationOffsetBase: IPoint,
        newLocationOffsetBase: IPoint
    ) {}

    private _willChangeLocationOffsetBase(
        oldLocationOffsetBase: IPoint,
        newLocationOffsetBase: IPoint
    ) {
        this.willChangeLocationOffsetBase(
            oldLocationOffsetBase,
            newLocationOffsetBase
        );

        // Notify linked layouts
        for (let layout of this.linkedLayouts('x')) {
            layout.willChangeLocationOffsetBase(
                {
                    x: oldLocationOffsetBase.x,
                    y: layout.locationOffsetBase.y,
                },
                {
                    x: newLocationOffsetBase.x,
                    y: layout.locationOffsetBase.y,
                }
            );
        }
        for (let layout of this.linkedLayouts('y')) {
            layout.willChangeLocationOffsetBase(
                {
                    x: layout.locationOffsetBase.x,
                    y: oldLocationOffsetBase.y,
                },
                {
                    x: layout.locationOffsetBase.x,
                    y: newLocationOffsetBase.y,
                }
            );
        }
        for (let layout of this.linkedLayouts('xy')) {
            layout.willChangeLocationOffsetBase(
                oldLocationOffsetBase,
                newLocationOffsetBase
            );
        }
    }

    /**
     * Called after content location has changed.
     *
     * Note that comparing the old and new offsets
     * may be unreliable.
     *
     * Do not modify the points.
     */
    didChangeLocationOffsetBase(
        oldLocationOffsetBase: IPoint,
        newLocationOffsetBase: IPoint
    ) {}

    _didChangeLocationOffsetBase(
        oldLocationOffsetBase: IPoint,
        newLocationOffsetBase: IPoint
    ) {
        this.setNeedsUpdate();
        this.didChangeLocationOffsetBase(
            oldLocationOffsetBase,
            newLocationOffsetBase
        );
    }

    /**
     * Called before the scale is changed as
     * part of a scroll target.
     *
     * Do not modify the points.
     */
    willChangeScale(oldScale: IPoint, newScale: IPoint) {}

    private _willChangeScale(oldScale: IPoint, newScale: IPoint) {
        this.willChangeScale(oldScale, newScale);

        // Notify linked layouts
        for (let layout of this.linkedLayouts('x')) {
            layout.willChangeScale(
                {
                    x: oldScale.x,
                    y: layout.locationOffsetBase.y,
                },
                {
                    x: newScale.x,
                    y: layout.locationOffsetBase.y,
                }
            );
        }
        for (let layout of this.linkedLayouts('y')) {
            layout.willChangeScale(
                {
                    x: layout.locationOffsetBase.x,
                    y: oldScale.y,
                },
                {
                    x: layout.locationOffsetBase.x,
                    y: newScale.y,
                }
            );
        }
        for (let layout of this.linkedLayouts('xy')) {
            layout.willChangeScale(oldScale, newScale);
        }
    }

    /**
     * Called after scale has changed.
     *
     * Do not modify the points.
     */
    didChangeScale(oldScale: IPoint, newScale: IPoint) {}

    private _didChangeScale(oldScale: IPoint, newScale: IPoint) {
        this.callbacks.onScaleChanged?.(this);
        this.setNeedsUpdate();
        this.didChangeScale(oldScale, newScale);
    }

    /**
     * Called after anchor has changed.
     */
    didChangeAnchor() {}

    private _didChangeAnchor() {
        this.setNeedsUpdate();
        this.didChangeAnchor();
    }

    /**
     * Begin a layout update block.
     */
    beginUpdate() {
        this._updateDepth += 1;
    }

    /**
     * End a layout update block.
     */
    endUpdate() {
        this._updateDepth -= 1;
        if (this._updateDepth < 0) {
            this._updateDepth = 0;
            throw new Error('Mismatched begin/end update calls');
        }
        if (this._updateDepth > 0) {
            return;
        }
        this.scheduleUpdate();
    }

    /**
     * Mark that a layout update is needed.
     */
    setNeedsUpdate() {
        // console.debug('setNeedsUpdate');
        this.beginUpdate();
        this.endUpdate();
    }

    get needsUpdate() {
        return this._updateDepth > 0 || !!this._updateTimer;
    }

    /**
     * Schedules a layout update.
     */
    scheduleUpdate() {
        if (this._updateTimer) {
            return;
        }
        // console.debug(`scheduleUpdate`);
        // this._updateTimer = setTimeout(() => {
        //     this._updateTimer = 0;
        //     this.update();
        // }, 1);
        this.update();
    }

    /**
     * Call to update layout immediately.
     * Consider calling `scheduleUpdate` instead of
     * this method to improve performance.
     */
    update() {
        // console.debug(`update`);
        this.cancelScheduledUpdate();

        let initialUpdate = false;
        if (!this._hasContainerSize) {
            if (this._containerSize.x >= 1 && this._containerSize.y >= 1) {
                this._hasContainerSize = true;
                initialUpdate = true;
            } else {
                // Wait for a valid container size before updating
                return;
            }
        }
        if (!this._hasScale) {
            if (this._scale.x !== 0 && this._scale.y !== 0) {
                this._hasScale = true;
                initialUpdate = true;
            } else {
                // Wait for a valid scale before updating
                return;
            }
        }

        for (let layoutSource of this._layoutSources) {
            layoutSource.setNeedsUpdate();
        }

        // if (this.needsRender) {
        //     // Schedule render after updates only
        //     this.scheduleRender();
        // }

        this.didUpdate({
            initial: initialUpdate,
        });
    }

    /**
     * Called after an update.
     *
     * Subclasses must call super implementation.
     */
    didUpdate(info: IUpdateInfo) {}

    cancelScheduledUpdate() {
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
            this._updateTimer = 0;
        }
    }

    get scale(): IPoint {
        return {
            ...this._scale,
            ...this._scaleTarget,
        };
    }

    getVisibleLocationRange(options?: {
        insets?: Partial<IInsets<number>>;
    }): [IPoint, IPoint] {
        let size = this.containerSize;
        if (options?.insets) {
            size = insetSize(size, options.insets);
        }
        if (size.x < 1 || size.y < 1) {
            return [zeroPoint(), zeroPoint()];
        }
        let offset = this.viewOffset;
        let scale = this.scale;
        if (options?.insets) {
            offset = insetPoint(offset, options.insets, {
                invertX: scale.x < 0,
                invertY: scale.y < 0,
            });
        }
        let startOffset = {
            x: Math.ceil(offset.x),
            y: Math.floor(offset.y),
        };
        let endOffset = {
            x: Math.floor(offset.x - size.x),
            y: Math.ceil(offset.y - size.y),
        };
        if (scale.x < 0) {
            let xSave = startOffset.x;
            startOffset.x = endOffset.x;
            endOffset.x = xSave;
        }
        if (scale.y < 0) {
            let ySave = startOffset.y;
            startOffset.y = endOffset.y;
            endOffset.y = ySave;
        }
        let start = this.getLocation(startOffset);
        let end = this.getLocation(endOffset);
        if (start.x >= end.x || start.y >= end.y) {
            return [zeroPoint(), zeroPoint()];
        }
        return [start, end];
    }

    /**
     * Transforms a vector in content coordinates
     * to a vector in view coordinates (pixels).
     * @param point
     */
    scaleVector(point: IPoint): IPoint {
        const scale = this.scale;
        return {
            x: point.x * scale.x,
            y: point.y * scale.y,
        };
    }

    /**
     * Transforms an animated vector in content coordinates
     * to an animated vector in view coordinates (pixels).
     * @param point
     */
    scaleVector$(point: IAnimatedPoint): IAnimatedPoint {
        return {
            x: Animated.multiply(point.x, this.scale$.x),
            y: Animated.multiply(point.y, this.scale$.y),
        };
    }

    /**
     * Transforms an animated size in content coordinates
     * to an animated size in view coordinates (pixels).
     *
     * Accounts for negative scale.
     *
     * @param size
     */
    scaleSize$(size: IAnimatedPoint): IAnimatedPoint {
        let { scale } = this;
        let scaledSize = {
            x: Animated.multiply(size.x, this.scale$.x),
            y: Animated.multiply(size.y, this.scale$.y),
        };
        if (scale.x < 0) {
            scaledSize.x = negate$(scaledSize.x);
        }
        if (scale.y < 0) {
            scaledSize.y = negate$(scaledSize.y);
        }
        return scaledSize;
    }

    /**
     * Transforms a vector in view coordinates (pixels)
     * to a vector in content coordinates.
     * @param point
     */
    unscaleVector(point: IPoint): IPoint {
        if (this._scale.x === 0 || this._scale.y === 0) {
            return zeroPoint();
        }
        const scale = this.scale;
        return {
            x: point.x / scale.x,
            y: point.y / scale.y,
        };
    }

    getContainerLocationWithEvent(event: GestureResponderEvent): IPoint {
        return {
            x: -event.nativeEvent.locationX,
            y: -event.nativeEvent.locationY,
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
        let { x: xl0, y: yl0 } = this.locationOffsetBase;
        let { x: x0, y: y0 } = this.containerOriginOffset;
        let cp: IPoint = {
            x: this._viewOffset.x - x0,
            y: this._viewOffset.y - y0,
        };
        let scale = this.scale;
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
            x: Animated.subtract(this.viewOffset$.x, x0),
            y: Animated.subtract(this.viewOffset$.y, y0),
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
            Animated.multiply(Animated.add(point.x, xl0), scale.x)
        );
        cp.y = Animated.add(
            cp.y,
            Animated.multiply(Animated.add(point.y, yl0), scale.y)
        );
        return cp;
    }

    /**
     * Transforms a point in view coordinates (pixels)
     * to a point in content coordinates.
     * @param point
     */
    getLocation(point: IPoint): IPoint {
        if (this._scale.x === 0 || this._scale.y === 0) {
            return zeroPoint();
        }
        const scale = this.scale;
        let { x: xl0, y: yl0 } = this.locationOffsetBase;
        let { x: x0, y: y0 } = this.containerOriginOffset;
        return {
            x: -xl0 - (point.x - x0) / scale.x,
            y: -yl0 - (point.y - y0) / scale.y,
        };
    }

    scrollBy(
        options: { offset: Partial<IPoint> } & IAnimationBaseOptions
    ): Animated.CompositeAnimation | undefined {
        if (!options.offset.x && !options.offset.y) {
            return undefined;
        }
        let offset = this.locationOffsetBase;
        let hasOffset = false;
        if (options.offset.x) {
            offset.x += options.offset.x;
            hasOffset = true;
        }
        if (options.offset.y) {
            offset.y += options.offset.y;
            hasOffset = true;
        }
        if (!hasOffset) {
            return undefined;
        }
        return this.scrollTo({
            ...options,
            offset,
        });
    }

    scrollTo(
        options: (IScrollToOffsetOptions | IScrollToRangeOptions) &
            IAnimationBaseOptions
    ): Animated.CompositeAnimation | undefined {
        if (this._panStarted) {
            // Pan overrides scrolling
            options.onEnd?.({ finished: false });
            return undefined;
        }

        if (this._updateDepth === 0) {
            this._locationOffsetTarget.x = this._locationOffsetBase.x;
            this._locationOffsetTarget.y = this._locationOffsetBase.y;
            this._scaleTarget.x = this._scale.x;
            this._scaleTarget.y = this._scale.y;
        }

        this._targetDepth += 1;

        // Update linked layouts
        for (let layout of this.allLinkedLayouts()) {
            layout._targetDepth += 1;
        }

        if ('offset' in options) {
            if (typeof options.offset.x !== 'undefined') {
                this._locationOffsetTarget.x = options.offset.x;
            }
            if (typeof options.offset.y !== 'undefined') {
                this._locationOffsetTarget.y = options.offset.y;
            }
        } else if ('range' in options) {
            // Work out offset and scale
            let res = this.getTransformForContentRange(options.range, options);
            if (
                typeof options.range[0].x !== 'undefined' ||
                typeof options.range[1].x !== 'undefined'
            ) {
                this._locationOffsetTarget.x = res.offset.x;
                this._scaleTarget.x = res.scale.x;
            }
            if (
                typeof options.range[0].y !== 'undefined' ||
                typeof options.range[1].y !== 'undefined'
            ) {
                this._locationOffsetTarget.y = res.offset.y;
                this._scaleTarget.y = res.scale.y;
            }
        }

        // We do not end the previous animation until we save the
        // offset and scale targets, because _transferViewOffsetToLocation
        // has side effects which may override the targets.
        this._descelerationAnimation?.stop();
        this._descelerationAnimation = undefined;
        this._transferViewOffsetToLocation();

        this._targetDepth -= 1;

        // Update linked layouts
        for (let layout of this.allLinkedLayouts()) {
            layout._targetDepth -= 1;
        }

        if (this._targetDepth > 0) {
            // There are multiple simulateous scroll targets
            return;
        }

        let needOffset =
            this._locationOffsetTarget.x !== this._locationOffsetBase.x ||
            this._locationOffsetTarget.y !== this._locationOffsetBase.y;
        let needScale =
            this._scaleTarget.x !== this._scale.x ||
            this._scaleTarget.y !== this._scale.y;

        if (!needOffset && !needScale) {
            this._resetScrollTargetIfNeeded();
            return undefined;
        }

        const finalOffset = this._locationOffsetTarget as IPoint;
        const finalScale = this._scaleTarget as IPoint;

        // console.debug(
        //     `scrollTo offset: ${JSON.stringify(
        //         finalOffset
        //     )} scale: ${JSON.stringify(finalScale)}`
        // );

        // Update linked layouts
        for (let layout of this.linkedLayouts('x')) {
            layout._locationOffsetTarget.x = finalOffset.x;
            layout._scaleTarget.x = finalScale.x;
        }
        for (let layout of this.linkedLayouts('y')) {
            layout._locationOffsetTarget.y = finalOffset.y;
            layout._scaleTarget.y = finalScale.y;
        }
        for (let layout of this.linkedLayouts('xy')) {
            layout._locationOffsetTarget.x = finalOffset.x;
            layout._locationOffsetTarget.y = finalOffset.y;
            layout._scaleTarget.x = finalScale.x;
            layout._scaleTarget.y = finalScale.y;
        }

        if (needOffset) {
            this._willChangeLocationOffsetBase(
                this._locationOffsetBase,
                finalOffset
            );
        }
        if (needScale) {
            this._willChangeScale(this._scale, finalScale);
        }

        this._startInteraction();

        if (!options.animated) {
            this.beginUpdate();
            needOffset && this._locationOffsetBase$.setValue(finalOffset);
            needScale && this.scale$.setValue(finalScale);
            let info = { finished: true };
            this._onEndDeceleration(info);
            options.onEnd?.(info);
            this.endUpdate();
            this.update();
            return undefined;
        }

        let offsetAnimation: Animated.CompositeAnimation | undefined;
        if (needOffset) {
            if (options.timing) {
                offsetAnimation = Animated.timing(this._locationOffsetBase$, {
                    toValue: finalOffset,
                    easing: Easing.inOut(Easing.exp),
                    ...options.timing,
                    useNativeDriver: this.useNativeDriver,
                });
            } else {
                offsetAnimation = Animated.spring(
                    this._locationOffsetBase$, // Auto-multiplexed
                    {
                        toValue: finalOffset,
                        velocity:
                            options.spring?.velocity || this.contentVelocity,
                        bounciness: 0,
                        ...options.spring,
                        useNativeDriver: this.useNativeDriver,
                    }
                );
            }
        }

        let scaleAnimation: Animated.CompositeAnimation | undefined;
        if (needScale) {
            if (options.timing) {
                scaleAnimation = Animated.timing(this.scale$, {
                    toValue: finalScale,
                    easing: Easing.inOut(Easing.exp),
                    ...options.timing,
                    useNativeDriver: this.useNativeDriver,
                });
            } else {
                scaleAnimation = Animated.spring(
                    this.scale$, // Auto-multiplexed
                    {
                        toValue: finalScale,
                        bounciness: 0,
                        ...options.spring,
                        useNativeDriver: this.useNativeDriver,
                    }
                );
            }
        }

        let compositeAnimation: Animated.CompositeAnimation;
        if (offsetAnimation && scaleAnimation) {
            compositeAnimation = Animated.parallel([
                offsetAnimation,
                scaleAnimation,
            ]);
        } else if (offsetAnimation) {
            compositeAnimation = offsetAnimation;
        } else if (scaleAnimation) {
            compositeAnimation = scaleAnimation;
        } else {
            throw new Error('Invalid animation');
        }
        this._descelerationAnimation = compositeAnimation;

        if (!options.manualStart) {
            this._onStartDeceleration();
            compositeAnimation.start(info => {
                this._onEndDeceleration(info);
                options.onEnd?.(info);
            });
        } else {
            this._endInteration();
        }
        return compositeAnimation;
    }

    getTransformForContentRange(
        range: [Partial<IPoint>, Partial<IPoint>],
        options?: {
            insets?: Partial<IInsets<number>>;
        }
    ): {
        offset: IPoint;
        scale: IPoint;
    } {
        let offset: IPoint = {
            ...this._locationOffsetTarget,
            ...this._locationOffsetBase,
        };
        let scale = this.scale;
        let insetOffset = zeroPoint();
        let containerSize = this._containerSize;
        if (options?.insets) {
            containerSize = insetSize(containerSize, options.insets);
            insetOffset = insetTranslation(options.insets, {
                anchor: this._anchor,
                invertX: scale.x < 0,
                invertY: scale.y < 0,
            });
        }
        for (let axis of ['x', 'y'] as (keyof IPoint)[]) {
            let min = range[0][axis];
            let max = range[1][axis];
            if (
                containerSize[axis] >= 1 &&
                (typeof min !== 'undefined' || typeof max !== 'undefined')
            ) {
                if (
                    typeof min === 'undefined' ||
                    typeof max === 'undefined' ||
                    max <= min
                ) {
                    throw new Error(`Invalid range.${axis}: [${min}, ${max}]`);
                }
                let targetLen = max - min;
                let anchor = this._anchor[axis];
                let scaleSign = 1;
                if (this._scale[axis] < 0) {
                    scaleSign = -1;
                }
                offset[axis] = -min - targetLen * anchor;
                scale[axis] = (containerSize[axis] / targetLen) * scaleSign;

                offset[axis] += insetOffset[axis] / Math.abs(scale[axis]);
            }
        }
        return { offset, scale };
    }

    private _resetScrollTargetIfNeeded() {
        if (this._targetDepth > 0) {
            return;
        }
        this._locationOffsetTarget = {};
        this._scaleTarget = {};

        // Update linked layouts
        for (let layout of this.linkedLayouts('x')) {
            if (layout._targetDepth === 0) {
                delete layout._locationOffsetTarget.x;
                delete layout._scaleTarget.x;
            }
        }
        for (let layout of this.linkedLayouts('y')) {
            if (layout._targetDepth === 0) {
                delete layout._locationOffsetTarget.y;
                delete layout._scaleTarget.y;
            }
        }
        for (let layout of this.linkedLayouts('xy')) {
            if (layout._targetDepth === 0) {
                layout._locationOffsetTarget = {};
                layout._scaleTarget = {};
            }
        }
    }

    createItemViewRef(): React.RefObject<ItemView> {
        return React.createRef<ItemView>();
    }

    createItemViewKey(): string {
        return String(++this._itemViewCounter);
    }

    // private _updateLayoutSources() {
    //     for (let layoutSource of this._layoutSources) {
    //         this._updateLayoutSource(layoutSource);
    //     }
    // }

    // private _updateLayoutSource<T>(layoutSource: LayoutSource<T>) {
    //     console.debug(`[${layoutSource.id}] begin prerender`);
    //     layoutSource.updateItems(this, { prerender: true });
    //     console.debug(`[${layoutSource.id}] end prerender`);
    // }

    private _bindToAppEvents() {
        if (!this._memoryWarningListener) {
            // Clear queue on memroy warning
            this._memoryWarningListener = () => {
                console.warn('Clearing queue due to memory warning');
                for (let layoutSource of this._layoutSources) {
                    layoutSource.clearQueue();
                }
            };
            AppState.addEventListener(
                'memoryWarning',
                this._memoryWarningListener
            );
        }
    }

    private _unbindFromAppEvents() {
        if (this._memoryWarningListener) {
            AppState.removeEventListener(
                'memoryWarning',
                this._memoryWarningListener
            );
            this._memoryWarningListener = undefined;
        }
    }
}
