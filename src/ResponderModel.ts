import { Animated, GestureResponderEvent, PanResponder, PanResponderCallbacks, PanResponderGestureState, PanResponderInstance } from "react-native";
import {
    concatFunctions,
    kPanResponderCallbackKeys,
    LayoutSource,
    removeDefaultCurry,
    safeFunction,
    weakref,
    zeroPoint,
} from "./internal";
import {
    AnimatedValueXYDerivedInput, IPoint, PanPressableCallbacks, PanPressableOptions,
} from "./types";
import { ViewModel } from "./ViewModel";

const kPanSpeedMin = 0.001;

const kDefaultProps: Required<ResponderModelPrimitiveProps> = {
    panEnabled: true,
    verticalPanEnabled: true,
    horizontalPanEnabled: true,
    useNativeDriver: false,
    delayLongPress: 500,
    longPressMaxDistance: 3,
};

export interface IScrollInfo {
    /** Content location in content coordinates. */
    location: IPoint,
    /** Content velocity in content coordinates. */
    velocity: IPoint,
    /** Viewport location in parent coordinates (pixels). */
    offset: IPoint,
    /** Viewport velocity in parent coordinates (pixels). */
    scaledVelocity: IPoint,
}

/**
 * Note that values returned by pan responder callbacks are ignored.
 **/
export interface ResponderModelCallbacks extends PanPressableCallbacks, PanResponderCallbacks {
    snapToLocation?: (info: IScrollInfo) => Partial<IPoint> | undefined;
    onViewportSizeChanged?: (collection: ResponderModel) => void;
    /**
     * Called when the scale changes.
     */
    onScaleChanged?: (view: ResponderModel) => void;
}

interface ResponderModelPrimitiveProps extends PanPressableOptions {
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

export interface ResponderModelProps extends ResponderModelPrimitiveProps {
    layoutSources?: LayoutSource<any>[];
    /** Initial offset in content coordinates. */
    offset?: AnimatedValueXYDerivedInput<ResponderModel>;
    /** Scale relating content and view coordinate systems. */
    scale?: AnimatedValueXYDerivedInput<ResponderModel>;
    /**
     * The point with values in the range 0-1.
     * The point represents the contentOffset in the viewport.
     * Scaling also happens about this point.
     * 
     * Defaults to `{ x: 0.5, y: 0.5 }`, i.e. the
     * center of the viewport.
     **/
    anchor?: AnimatedValueXYDerivedInput<ResponderModel>;
    /**
     * Modify the pan target.
     * Defaults to [offset]{@link ResponderModel#offset}
     */
    panTarget?: Animated.ValueXY;
    /** Enabled by default. */
    panEnabled?: boolean;
    /** Enabled by default. */
    verticalPanEnabled?: boolean;
    /** Enabled by default. */
    horizontalPanEnabled?: boolean;
}

export class ResponderModel<
    Props extends ResponderModelProps = ResponderModelProps
> extends ViewModel<Props> {
    panEnabled: boolean;
    verticalPanEnabled: boolean;
    horizontalPanEnabled: boolean;
    longPressMaxDistance: number;
    delayLongPress: number;

    readonly callbacks: ResponderModelCallbacks;

    readonly panResponder?: PanResponderInstance;

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
    private _itemViewCounter = 0;
    private _animatedSubscriptions: { [id: string]: Animated.Value | Animated.ValueXY } = {};
    private _memoryWarningListener?: () => void;
    private _interactionHandle = 0;
    private _updateDepth = 0;
    private _updateTimer?: any;
    // private _mounted = false;

    constructor(props: Props) {
        super({
            ...kDefaultProps,
            ...props,
        });

        this._panTarget$ = panTarget || this.offset$;

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
                onPanResponderStart: removeDefaultCurry((e, g) => this._onBeginPan(e, g)),
                onPanResponderMove: (...args: any[]) => {
                    if (this._panDefaultPrevented) {
                        return;
                    }
                    Animated.event(
                        [null, panGestureState],
                        {
                            // listener: event => {},
                            useNativeDriver: this.useNativeDriver
                        }
                    )(...args);
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
    }
}
