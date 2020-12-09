import { Animated } from "react-native";
import { kInsetKeys, kZeroInsets } from "./const";
import {
    AnimatedValueDerivedInput,
    IAnimatedPoint,
    IInsets,
    IItemLayout,
    ILayout,
    MutableAnimatedPoint,
    EvergridLayout,
} from "./internal";
import {
    AnimatedValueXYDerivedInput,
    IItem,
    IItemUpdate,
    InsetEdge,
    IPoint,
    IAnimationBaseOptions,
    IAnimatedPointInput,
    IItemSnapshot,
    IPartialLayout,
} from "./types";
import {
    getLazyArray,
    isPointInsideItemLayout,
    weakref,
    zeroPoint,
} from "./util";
import {
    animateValueIfNeeded,
    negate$,
    normalizePartialAnimatedLayout,
    normalizeAnimatedDerivedValue,
    normalizeAnimatedDerivedValueXY,
} from './rnUtil';

const kDefaultProps: Partial<LayoutSourceProps<any>> = {
    showDuration: 150,
};

let _layoutSourceCounter = 0;
let _layoutSourceIDs = new Set<string>();

export interface ILayoutUpdateInfo {
    needsRender?: boolean;
}

/**
 * As well as animation options (see {@link IAnimationBaseOptions}),
 * offers a way to customise an update to several items. 
 */
export interface IItemUpdateManyOptions extends IAnimationBaseOptions {
    /**
     * Update visible items.
     * 
     * If `forceRender` is specified, will render
     * these items as well.
     **/
    visible?: boolean;

    /**
     * Update queued items.
     * 
     * If `forceRender` is specified, will mark these
     * items for render when they are dequeued.
     **/
    queued?: boolean;

    /**
     * By default, only item containers are updated 
     * for performance reasons. To force re-rendering
     * item content, set this to `true`.
     */
    forceRender?: boolean;
}

export interface IItemUpdateSingleOptions extends IAnimationBaseOptions {
    created?: boolean;
    dequeued?: boolean;
}

export interface IItemRenderOptions {
    force?: boolean;
}

export interface LayoutSourceProps<T> {
    id?: string;

    /**
     * The default item size in content coordinates.
     * The resulting view size is affected by scale.
     */
    itemSize?: AnimatedValueXYDerivedInput<LayoutSource>;

    /**
     * The location in (content coordinates) where the
     * zero index is displayed.
     */
    origin?: AnimatedValueXYDerivedInput<LayoutSource>;

    /**
     * Where to place the origin for each item.
     * 
     * An item origin of `{ x: 0, y: 0 }` (by default),
     * will scale the item about the top left corner
     * (if both scales are positive) and in the bottom
     * left corner if the y scale is negative.
     * 
     * An item origin of `{ x: 1, y: 1 }` (by default),
     * will scale the item about the bottom right corner
     * (if both scales are positive) and in the top
     * right corner if the y scale is negative.
     */
    itemOrigin?: AnimatedValueXYDerivedInput<LayoutSource>;

    /**
     * Set to `{ x: 1, y: 1 }` by default.
     * 
     * To add a parallax effect, set component
     * values to larger or smaller than 1 to make
     * the items appear closer and further away
     * respectively.
     */
    scale?: AnimatedValueXYDerivedInput<LayoutSource>;

    /**
     * Specifies how much to inset the content grid
     * in view coordinates (pixels).
     */
    insets?: Partial<IInsets<AnimatedValueDerivedInput<LayoutSource>>>;

    /**
     * The subviews "stick" to the specified edge.
     * The `origin` determines which location "sticks".
     * Remeber to set `itemOrigin` accordingly.
     * To offset from the edge, use the corresponding edge
     * in `insets`.
     **/
    stickyEdge?: InsetEdge;

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
     * Default reuse ID. Customise with `getReuseID()`.
     */
    reuseID?: string;

    /**
     * All items are reused by default.
     * 
     * Passing an empty string does not reuse that item.
     * 
     * If this is not specified, uses `reuseID`.
     **/
    getReuseID?: (index: T) => string;

    /**
     * Rendering to DOM is an expensive operation. If a
     * render of this item is not needed on update,
     * return `false`, otherwise return `true`.
     * 
     * This method is called only when an item is reused,
     * not when it is created.
     **/
    shouldRenderItem: (
        item: IItem<T>,
        previous: IItemSnapshot<T>,
    ) => boolean;

    /**
     * Overrides item view layout. Does not scale.
     * Can override offset, size or both.
     * 
     * Specifying a percentage as a string uses
     * the chart view size as the base.
     * 
     * Note that this is called on item creation
     * and is not called on subsequent renders.
     * Any update logic must be encoded using
     * animated values.
     */
    getItemViewLayout?: (
        index: T,
        layoutSource: LayoutSource,
    ) => IPartialLayout<IAnimatedPointInput> | undefined;

    /**
     * Allows to modifying an item's view layout before
     * the it is commited to the item.
     */
    willUseItemViewLayout?: (
        index: T,
        layout: ILayout<IAnimatedPoint>,
        layoutSource: LayoutSource,
    ) => void;

    /**
     * Called after an item is created.
     */
    didCreateItem?: (item: IItem<T>) => void;

    /**
     * Called before an item is displayed after
     * an update or creation.
     */
    willShowItem?: (item: IItem<T>) => void;

    /**
     * Called before an item is hidden after
     * moving out of visible bounds.
     */
    willHideItem?: (item: IItem<T>) => void;
    
    /**
     * The duration in milliseconds of the fade-in animation,
     * when a new item is rendered. Ignored when an item is
     * reused.
     * 
     * This reduces the jarring effect of items suddenly appearing
     * after rendering. When items are reused, this is irrelevant
     * as they are shown immediately.
     */
    showDuration?: number;
}

export default abstract class LayoutSource<
    T = any,
    Props extends LayoutSourceProps<T> = LayoutSourceProps<T>
> {
    props: Props;
    readonly id: string;
    itemSize$: Animated.ValueXY;
    origin$: Animated.ValueXY;
    itemOrigin$: Animated.ValueXY;
    scale$: Animated.ValueXY;
    insets$: IInsets<Animated.Value>;

    private _itemSize: IPoint;
    private _origin: IPoint;
    private _itemOrigin: IPoint;
    private _scale: IPoint;
    private _insets: IInsets<number>;
    private _zIndex = 0;

    private _itemQueues: { [reuseID: string]: IItem<T>[] };
    private _animatedSubscriptions: { [id: string]: Animated.Value | Animated.ValueXY } = {};
    private _updateDepth = 0;
    private _updateTimer: any;
    private _updateInfoQueue: (ILayoutUpdateInfo | undefined)[] = [];
    private _iteratedItemUpdates = false;

    private _weakRootRef = weakref<EvergridLayout>();

    constructor(props: Props) {
        this.props = {
            ...kDefaultProps,
            ...props,
        };
        this.id = createLayoutSourceID(props.id, this.props.reuseID);
        this._itemQueues = {};

        this.itemSize$ = new Animated.ValueXY();
        this._itemSize = { x: 1, y: 1 };

        this.origin$ = new Animated.ValueXY();
        this._origin = zeroPoint();

        this.itemOrigin$ = new Animated.ValueXY();
        this._itemOrigin = zeroPoint();

        this._scale = { x: 1, y: 1 };
        this.scale$ = new Animated.ValueXY({ ...this._scale });

        this.insets$ = {
            top: new Animated.Value(0),
            right: new Animated.Value(0),
            bottom: new Animated.Value(0),
            left: new Animated.Value(0),
        };
        this._insets = { ...kZeroInsets };
    }

    get root(): EvergridLayout {
        return this._weakRootRef.getOrFail();
    }

    private get _maybeRoot(): EvergridLayout | undefined {
        return this._weakRootRef.get();
    }

    private _setRoot(root: EvergridLayout) {
        if (!root || !(root instanceof EvergridLayout)) {
            throw new Error('Invalid root layout');
        }
        this._weakRootRef.set(root);
    } 

    get itemSize(): IPoint {
        return { ...this._itemSize };
    }

    get origin(): IPoint {
        return { ...this._origin };
    }

    get scale(): IPoint {
        return { ...this._scale };
    }

    get zIndex(): number {
        return this.props.zIndex || this._zIndex;
    }

    /**
     * @see LayoutSourceProps.showDuration
     */
    get showDuration(): number {
        return this.props.showDuration || 0;
    }

    configure(options: {
        root: EvergridLayout,
        zIndex?: number,
    }) {
        this.unconfigure();

        let needsForcedUpdate = false;
        let sub = '';

        this._setRoot(options.root);
        this.itemSize$ = normalizeAnimatedDerivedValueXY(this.props.itemSize, {
            info: this,
        });
        this._itemSize = {
            // @ts-ignore: _value is private
            x: this.itemSize$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.itemSize$.y._value || 0,
        };
        sub = this.itemSize$.addListener(p => {
            this._itemSize = p;
            this.setNeedsUpdate();
        });
        this._animatedSubscriptions[sub] = this.itemSize$;

        this.origin$ = normalizeAnimatedDerivedValueXY(this.props.origin, {
            info: this,
        });
        this._origin = {
            // @ts-ignore: _value is private
            x: this.origin$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.origin$.y._value || 0,
        };
        sub = this.origin$.addListener(p => {
            this._origin = p;
            this.setNeedsUpdate();
        });
        this._animatedSubscriptions[sub] = this.origin$;

        this.itemOrigin$ = normalizeAnimatedDerivedValueXY(this.props.itemOrigin, {
            info: this,
        });
        this._itemOrigin = {
            // @ts-ignore: _value is private
            x: this.itemOrigin$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.itemOrigin$.y._value || 0,
        };
        sub = this.itemOrigin$.addListener(p => {
            this._itemOrigin = p;
            this.setNeedsUpdate();
        });
        this._animatedSubscriptions[sub] = this.itemOrigin$;

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
        sub = this.scale$.addListener(p => {
            if (p.x === 0 || p.y === 0) {
                // console.debug('Ignoring invalid scale value: ' + JSON.stringify(p));
                return;
            }
            if (p.x === this._scale.x && p.y === this._scale.y) {
                return;
            }
            // TODO: Reload all items if scale changes sign.
            this._scale = p;
            this.setNeedsUpdate();
        });
        this._animatedSubscriptions[sub] = this.scale$;

        kInsetKeys.forEach(insetKey => {
            let currentInset$ = this.insets$[insetKey];
            let inset$ = normalizeAnimatedDerivedValue(this.props.insets?.[insetKey], {
                info: this,
                defaults: currentInset$,
            });
            if (currentInset$ !== inset$) {
                // Modify animated value
                this.insets$[insetKey] = inset$;
                needsForcedUpdate = true;
            }
            // @ts-ignore: _value is private
            this._insets[insetKey] = inset$._value || 0;
            let sub = inset$.addListener(({ value }) => {
                if (Math.abs(value - this._insets[insetKey]) < 1) {
                    return;
                }
                this._insets[insetKey] = value;
                this.setNeedsUpdate();
            });
            this._animatedSubscriptions[sub] = inset$;
        });

        this._zIndex = options.zIndex || 0;

        if (needsForcedUpdate) {
            this.updateItems({ visible: true });
        }
    }

    unconfigure() {
        this._resetScheduledUpdate();

        for (let sub of Object.keys(this._animatedSubscriptions)) {
            let value = this._animatedSubscriptions[sub];
            value.removeListener(sub);
        }
        this._animatedSubscriptions = {};
        this.reset();
    }

    reset() {
        this.clearQueue();
        for (let index of this.visibleIndexes()) {
            if (this.props.willHideItem) {
                let item = this.getVisibleItem(index);
                if (item) {
                    this.props.willHideItem(item);
                }
            }
            this.setVisibleItem(index, undefined);
        }
    }

    abstract itemUpdates(): Generator<IItemUpdate<T>>;

    /**
     * Iterates through updates only once during
     * an update block.
     */
    * itemUpdatesOnce(): Generator<IItemUpdate<T>> {
        if (this._iteratedItemUpdates) {
            // Already checked for changes
            return undefined;
        }
        this._iteratedItemUpdates = true;
        for (let update of this.itemUpdates()) {
            yield update;
        }
        return undefined;
    }

    abstract visibleIndexes(): Generator<T>;

    isEqualIndexes(i1: T, i2: T): boolean {
        return i1 === i2;
    }

    copyIndex(index: T): T {
        return index;
    }

    setItemNeedsRender(index: T) {
        let item = this.getVisibleItem(index);
        item?.ref.current?.setNeedsRender();
    }

    setNeedsUpdate() {
        if (this.isUpdating) {
            // console.debug(`[${this.id}] already updating`);
            return;
        }

        if (this.shouldUpdate()) {
            this.scheduleUpdate();
        }
    }

    /**
     * Schedules a layout update.
     */
    scheduleUpdate() {
        if (this.isUpdating) {
            return;
        }
        this._updateTimer = setTimeout(() => {
            this._updateTimer = 0;
            this.updateItems();
        }, 1);
    }

    private _resetScheduledUpdate() {
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
            this._updateTimer = 0;
        }
    }

    get isUpdating() {
        return this._updateDepth > 0 || !!this._updateTimer;
    }

    /**
     * Return true when a layout update is needed.
     */
    shouldUpdate() {
        return true;
    }

    /**
     * Call this method before making layout updates.
     * 
     * Subclasses must call the super implementation first.
     */
    beginUpdate() {
        this._updateDepth += 1;
        if (this._updateDepth === 1) {
            this._iteratedItemUpdates = false;
            this.didBeginUpdate();
        }
    }

    /**
     * Call this method after making layout updates.
     * 
     * Subclasses must call the super implementation last.
     */
    endUpdate(info?: ILayoutUpdateInfo) {
        this._updateDepth -= 1;
        if (this._updateDepth < 0) {
            this._updateDepth = 0;
            this._updateInfoQueue = [];
            throw new Error('Mismatched layout update begin/end calls');
        }
        this._updateInfoQueue.push(info);
        if (this._updateDepth > 0) {
            return;
        }
        
        let needsRender = false;
        for (let info of this._updateInfoQueue) {
            if (!needsRender && info?.needsRender) {
                needsRender = true;
            }
        }
        this._updateInfoQueue = [];

        this.didEndUpdate();
        if (needsRender) {
            this._maybeRoot?.setNeedsRender();
        }
    }

    /**
     * Called when an update begins.
     * 
     * Subclasses must call the super implementation first.
     * Do not call this method directly.
     */
    didBeginUpdate() {
        // console.debug(`[${this.id}] ` + 'beginUpdate');
    }

    /**
     * Called when an update has ended.
     * 
     * Subclasses must call the super implementation last.
     * Do not call this method directly.
     */
    didEndUpdate() {
        // console.debug(`[${this.id}] ` + 'endUpdate');

        // TODO: Set opacity of newly queued items to 0
    }

    getVisibleLocationRange(): [IPoint, IPoint] {
        let { x: width, y: height } = this.getViewportSize();
        if (width < 1 || height < 1) {
            return [zeroPoint(), zeroPoint()];
        }
        let { x, y } = this.getViewportOffset();
        let scale = this.getScale();
        let startOffset = {
            x: Math.ceil(x),
            y: Math.floor(y),
        };
        let endOffset = {
            x: Math.floor(x - width),
            y: Math.ceil(y - height),
        };
        if (scale.x < 0) {
            let xSave = startOffset.x;
            startOffset.x = endOffset.x
            endOffset.x = xSave;
        }
        if (scale.y < 0) {
            let ySave = startOffset.y;
            startOffset.y = endOffset.y
            endOffset.y = ySave;
        }
        let start = this.getLocation(startOffset);
        let end = this.getLocation(endOffset);
        if (start.x >= end.x || start.y >= end.y) {
            return [zeroPoint(), zeroPoint()];
        }
        return [start, end];
    }

    getVisibleGridIndexRange(
        options?: {
            partial?: boolean
        }
    ): [IPoint, IPoint] {
        let range = this.getVisibleLocationRange();
        range[0] = this.getGridIndex(
            range[0],
            options?.partial
                ? undefined
                : { floor: true }
        );
        range[1] = this.getGridIndex(
            range[1],
            options?.partial
                ? undefined
                : { ceil: true }
        );
        return range;
    }

    getStickyContainerLocation(): Partial<IPoint> {
        if (!this.props.stickyEdge) {
            return {};
        }
        switch (this.props.stickyEdge) {
            case 'top':
                return { y: this._insets.top };
            case 'left':
                return { x: this._insets.left };
            default:
                break;
        }
        let size = this.root.containerSize;
        switch (this.props.stickyEdge) {
            case 'bottom':
                return {
                    y: size.y - this._insets.bottom,
                };
            case 'right':
                return {
                    x: size.x - this._insets.right,
                };
            default:
                throw new Error('Invalid inset');
        }
    }

    getStickyContainerLocation$(): Partial<IAnimatedPoint> {
        if (!this.props.stickyEdge) {
            return {};
        }
        switch (this.props.stickyEdge) {
            case 'top':
                return { y: this.insets$.top };
            case 'left':
                return { x: this.insets$.left };
            default:
                break;
        }
        let size = this.root.containerSize$;
        switch (this.props.stickyEdge) {
            case 'bottom':
                return {
                    y: Animated.subtract(
                        size.y,
                        this.insets$.bottom,
                    )
                };
            case 'right':
                return {
                    x: Animated.subtract(
                        size.x,
                        this.insets$.right,
                    )
                };
            default:
                throw new Error('Invalid inset');
        }
    }

    getContainerLocation(point: IPoint): IPoint {
        let { x, y } = this.root.getContainerLocation(point, {
            scale: this.scale
        });
        let p = this.getStickyContainerLocation();
        let scale = this.getScale();
        
        if (typeof p.x === 'undefined') {
            if (scale.x > 0) {
                p.x = x + this._insets.left;
            } else {
                p.x = x - this._insets.right;
            }
        }
        p.x = p.x || 0 + this._origin.x * scale.x;

        if (typeof p.y === 'undefined') {
            if (scale.y > 0) {
                p.y = y + this._insets.top;
            } else {
                p.y = y - this._insets.bottom;
            }
        }
        p.y = p.y || 0 + this._origin.y * scale.y;
        return p as IPoint;
    }

    getContainerLocation$(point: IAnimatedPoint | Animated.ValueXY): IAnimatedPoint {
        let { x, y } = this.root.getContainerLocation$(point, {
            scale: this.scale$
        });
        let p = this.getStickyContainerLocation$();
        let scale = this.getScale();
        let scale$ = this.getScale$();
        
        if (typeof p.x === 'undefined') {
            if (scale.x > 0) {
                p.x = Animated.add(
                    x,
                    this.insets$.left,
                );
            } else {
                p.x = Animated.subtract(
                    x,
                    this.insets$.right,
                );
            }
        }
        p.x = Animated.add(
            p.x,
            Animated.multiply(
                this.origin$.x,
                scale$.x,
            ),
        );

        if (typeof p.y === 'undefined') {
            if (scale.y > 0) {
                p.y = Animated.add(
                    y,
                    this.insets$.top,
                );
            } else {
                p.y = Animated.subtract(
                    y,
                    this.insets$.bottom,
                );
            }
        }
        p.y = Animated.add(
            p.y,
            Animated.multiply(
                this.origin$.y,
                scale$.y,
            ),
        );
        return p as IAnimatedPoint;
    }

    getScale(): IPoint {
        let { scale } = this.root;
        return {
            x: this._scale.x * scale.x,
            y: this._scale.y * scale.y,
        };
    }

    getScale$(): IAnimatedPoint {
        let { scale$ } = this.root;
        return {
            x: Animated.multiply(this.scale$.x, scale$.x),
            y: Animated.multiply(this.scale$.y, scale$.y),
        };
    }

    /**
     * Transforms a point in view coordinates (pixels)
     * to a point in content coordinates.
     * @param point 
     */
    getLocation(point: IPoint): IPoint {
        let { x, y } = this.root.getLocation(point);
        let offset = this.getLocationInsetOffset();
        return {
            x: x - this._origin.x + offset.x,
            y: y - this._origin.y + offset.y,
        };
    }

    /**
     * Returns the amount to offset a location
     * when converting from view to content
     * coordinates.
     */
    getLocationInsetOffset(): IPoint {
        let scale = this.getScale();
        return {
            x: Math.min(-this._insets.left / scale.x, this._insets.right / scale.x),
            y: Math.min(-this._insets.top / scale.y, this._insets.bottom / scale.y),
        };
    }

    /**
     * Transforms a point in content coordinates
     * to an index of a grid of size `itemSize`.
     * @param point 
     */
    getGridIndex(
        point: IPoint,
        options?: {
            floor?: boolean;
            ceil?: boolean;
            round?: boolean;
        }
    ): IPoint {
        if (this._itemSize.x == 0 || this._itemSize.y == 0) {
            return zeroPoint();
        }
        let i = {
            x: point.x / this._itemSize.x + this._itemSize.x * this._itemOrigin.x,
            y: point.y / this._itemSize.y + this._itemSize.y * this._itemOrigin.y,
        };
        if (options) {
            if (options.floor) {
                i.x = Math.floor(i.x);
                i.y = Math.floor(i.y);
            } else if (options.ceil) {
                i.x = Math.ceil(i.x);
                i.y = Math.ceil(i.y);
            } else if (options.round) {
                i.x = Math.round(i.x);
                i.y = Math.round(i.y);
            }
        }
        return i;
    }

    getViewportOffset(): IPoint {
        let { x, y } = this.root.viewOffset;
        let scale = this.getScale();
        return {
            x: x + (scale.x > 0 ? -this._insets.left : this._insets.right),
            y: y + (scale.y > 0 ? -this._insets.top : this._insets.bottom),
        };
    }
    
    getViewportSize(): IPoint {
        let { x, y } = this.root.containerSize;
        return {
            x: x - this._insets.left - this._insets.right,
            y: y - this._insets.top - this._insets.bottom,
        };
    }

    abstract getItemContentLayout(index: T): IItemLayout;

    getItemViewLayout$(index: T): IPartialLayout<IAnimatedPointInput> | undefined {
        return this.props.getItemViewLayout?.(index, this);
    }

    willUseItemViewLayout(index: T, layout: ILayout<IAnimatedPoint>) {
        return this.props.willUseItemViewLayout?.(index, layout, this);
    }

    createItemContentLayout$(): ILayout<MutableAnimatedPoint> {
        return {
            offset: new Animated.ValueXY(),
            size: new Animated.ValueXY(),
        };
    }

    createItemViewLayout$(
        contentLayout$: ILayout<MutableAnimatedPoint>,
        overrides: IPartialLayout<IAnimatedPoint> = {}
    ): ILayout<IAnimatedPoint> {
        let scale$ = this.getScale$();
        let scale = this.getScale();
        if (scale.x < 0) {
            scale$.x = negate$(scale$.x);
        }
        if (scale.y < 0) {
            scale$.y = negate$(scale$.y);
        }

        let offset: IAnimatedPoint;
        if (overrides.offset?.x && overrides.offset?.y) {
            offset = overrides.offset as IAnimatedPoint;
        } else {
            offset = {
                ...this.getContainerLocation$(contentLayout$.offset),
                ...overrides.offset,
            };
        }

        let size: IAnimatedPoint;
        if (overrides.size?.x && overrides.size?.y) {
            size = overrides.size as IAnimatedPoint;
        } else {
            size = {
                x: Animated.multiply(contentLayout$.size.x, scale$.x),
                y: Animated.multiply(contentLayout$.size.y, scale$.y),
                ...overrides.size,
            };
        }

        let layout: ILayout<IAnimatedPoint> = { offset, size };

        // Apply offsets
        let itemOrigin$: IAnimatedPoint = { ...this.itemOrigin$ };
        if (scale.x < 0) {
            // Invert origin
            itemOrigin$.x = Animated.subtract(1, itemOrigin$.x);
        }
        if (scale.y < 0) {
            // Invert origin
            itemOrigin$.y = Animated.subtract(1, itemOrigin$.y);
        }

        let originOffset = {
            x: Animated.multiply(itemOrigin$.x, layout.size.x),
            y: Animated.multiply(itemOrigin$.y, layout.size.y),
        };
        layout.offset.x = Animated.subtract(layout.offset.x, originOffset.x);
        layout.offset.y = Animated.subtract(layout.offset.y, originOffset.y);

        return layout;
    }

    getReuseID(index: T): string {
        if (this.props.getReuseID) {
            return this.props.getReuseID(index) || '';
        } else if (typeof this.props.reuseID !== 'undefined') {
            return this.props.reuseID;
        } else {
            return this.id;
        }
    }

    /**
     * Override to support adding items.
     * @param item 
     * @param options 
     */
    willAddItem(
        { index }: { index: T },
        options?: IAnimationBaseOptions
    ) {
        throw new Error('Adding items is not supported');
    }

    addItem(
        { index }: { index: T },
        options?: IAnimationBaseOptions
    ): IItem<T> {
        this.beginUpdate();
        let updateInfo: ILayoutUpdateInfo | undefined;
        try {
            this.willAddItem({ index }, options);
            let item = this.dequeueItem(index);
            if (!item) {
                item = this.createItem(index);
                updateInfo = { needsRender: true };
            }
            this.updateItems(options);
            this.endUpdate(updateInfo);
            return item;
        } catch (error) {
            this.endUpdate(updateInfo);
            throw error;
        }
    }

    /**
     * Override to support removing items.
     * @param index 
     * @param options 
     */
    didRemoveItem(
        { index }: { index: T },
        options?: IAnimationBaseOptions
    ) {
        throw new Error('Removing items is not supported');
    }

    removeItem(
        item: { index: T },
        options?: IAnimationBaseOptions
    ) {
        this.beginUpdate();
        try {
            this.queueItem(item.index);
            this.didRemoveItem(item, options);
            this.updateItems(options);
        } finally {
            this.endUpdate();
        }
    }

    createItem(index: T) {
        let contentLayout = this.createItemContentLayout$();
        let overrides = normalizePartialAnimatedLayout(
            this.getItemViewLayout$(index),
            {
                relativeSize: this.root.containerSize$,
            }
        );
        let viewLayout = this.createItemViewLayout$(
            contentLayout,
            overrides
        );
        this.willUseItemViewLayout(index, viewLayout);
        
        let root = this.root;
        let item: IItem<T> = {
            index,
            ref: root.createItemViewRef(),
            viewKey: root.createItemViewKey(),
            zIndex: this.zIndex,
            contentLayout: {
                offset: zeroPoint(),
                size: zeroPoint(),
            },
            animated: {
                contentLayout,
                viewLayout,
                // Start shown if no show animation given
                opacity: new Animated.Value(this.showDuration <= 0 ? 1 : 0),
            },
            showAnimation: false,
            forceRenderOnDequeue: false,
        };
        item.reuseID = this.getReuseID(index);

        this.props.didCreateItem?.(item);

        // console.debug(`[${this.id}] created (${item.reuseID}) at ${JSON.stringify(index)}`);
        this.updateItem(item, index, { created: true });
        return item;
    }

    updateItem(
        item: IItem<T>,
        index: T,
        options?: IItemUpdateSingleOptions,
    ): Animated.CompositeAnimation | undefined {
        let previousContentLayout = item.contentLayout;
        let newContentLayout = this.getItemContentLayout(index);
        // if (newContentLayout.size.x <= 0 || newContentLayout.size.y <= 0) {
        //     console.warn(`Ignoring invalid item size: ${JSON.stringify(newContentLayout.size)}`);
        //     newContentLayout.size = previousContentLayout.size;
        // }
        item.index = index;
        item.contentLayout = {
            ...item.contentLayout,
            ...newContentLayout,
        };
        if (!item.zIndex) {
            item.zIndex = this.zIndex;
        }
        // console.debug(`[${this.id}] updated item ${JSON.stringify(index)}`);
        // console.debug(`[${this.id}] content layout ${JSON.stringify(index)}: ${JSON.stringify(item.contentLayout, null, 2)}`);
        let { offset, size } = item.contentLayout;
        let {
            offset: offset$,
            size: size$,
        } = item.animated.contentLayout;

        let animations: Animated.CompositeAnimation[] = [];
        let animation: Animated.CompositeAnimation | undefined;

        if (offset) {
            animation = animateValueIfNeeded(
                offset$.x,
                previousContentLayout.offset.x,
                offset.x,
                options,
            );
            if (animation) {
                animations.push(animation);
            }
            animation = animateValueIfNeeded(
                offset$.y,
                previousContentLayout.offset.y,
                offset.y,
                options,
            );
            if (animation) {
                animations.push(animation);
            }
        }
        if (size) {
            animation = animateValueIfNeeded(
                size$.x,
                previousContentLayout.size.x,
                size.x,
                options,
            );
            if (animation) {
                animations.push(animation);
            }
            animation = animateValueIfNeeded(
                size$.y,
                previousContentLayout.size.y,
                size.y,
                options,
            );
            if (animation) {
                animations.push(animation);
            }
        }

        // item.showAnimation = false;
        if (this.showDuration <= 0) {
            item.showAnimation = false;
        } else {
            // Determine when to show item:
            let {
                created = false,
            } = options || {};
            item.showAnimation = created;
        }
        
        if (item.showAnimation) {
            // Animate here if updating, otherwise
            // the animation will start when the item
            // view is mounted.
            if (item.ref.current) {
                item.ref.current.fadeIn();
                item.showAnimation = false;
            }
        } else {
            // Show immediately
            item.animated.opacity.setValue(1);
        }

        this.props.willShowItem?.(item);
        this.setVisibleItem(index, item);

        if (animations.length !== 0) {
            animation = Animated.parallel(animations);
            if (!options?.manualStart) {
                animation.start();
            }
        }
        return animation;
    }

    abstract getVisibleItem(index: T): IItem<T> | undefined;

    abstract setVisibleItem(index: T, item: IItem<T> | undefined): void;

    /**
     * Override to optimise.
     * @param p 
     */
    getVisibleItemAtLocation(p: IPoint): IItem<T> | undefined {
        for (let i of this.visibleIndexes()) {
            let item = this.getVisibleItem(i);
            let contentLayout = item?.contentLayout;
            if (contentLayout && isPointInsideItemLayout(p, contentLayout)) {
                return item;
            }
        }
        return undefined;
    }

    allQueuedItems() {
        return this._itemQueues;
    }

    * flatQueuedItems(): Generator<IItem<T>> {
        let queuedItems = this._itemQueues;
        for (let reuseID of Object.keys(queuedItems)) {
            for (let item of queuedItems[reuseID]) {
                yield item;
            }
        }
    }

    private _dequeueItem(reuseID: string): IItem<T> | undefined {
        let queue = getLazyArray(this._itemQueues, reuseID);
        let item = queue.pop();
        if (item && item.reuseID !== reuseID) {
            throw new Error(`Dequeued an item from queue with reuseID "${reuseID}" with a different reuseID "${item.reuseID}"`);
        }
        // if (item) {
        //     console.debug(`[${this.id}] dequeued ${reuseID} (from: ${JSON.stringify(item.index)}, size: ${queue.length})`);
        // } else {
        //     console.debug(`[${this.id}] queue empty (${reuseID})`);
        // }
        return item;
    }

    queueItem(index: T): boolean {
        let item = this.getVisibleItem(index);
        if (!item) {
            // console.debug(`[${this.id}] queue ${JSON.stringify(index)} failed`);
            return false;
        }
        this.setVisibleItem(index, undefined);
        this.props.willHideItem?.(item);
        item.animated.opacity.setValue(0);
        if (item.reuseID) {
            let queue = getLazyArray(this._itemQueues, item.reuseID);
            queue.push(item);
            // console.debug(`[${this.id}] queued ${JSON.stringify(index)} (${item.reuseID}, size: ${queue.length})`);
        }
        return true;
    }

    clearQueue() {
        this._itemQueues = {};
    }

    /**
     * Shows added items, hides removed items
     * and optionally updates visible items.
     * 
     * See {@link IItemUpdateManyOptions} for more information.
     * 
     * @param options Update options.
     * @returns An animation object if an animation was specified, otherwise `undefined`.
     */
    updateItems(
        options?: IItemUpdateManyOptions,
    ): Animated.CompositeAnimation | undefined {
        this._resetScheduledUpdate();

        // let startTimestamp = new Date().valueOf();
        let {
            visible = false,
            queued = false,
            forceRender = false,
            ...animationOptions
        } = options || {};
        let animations: Animated.CompositeAnimation[] = [];
        let animation: Animated.CompositeAnimation | undefined;
        let needsRender = false;
        const renderOptions: IItemRenderOptions | undefined = forceRender
            ? { force: true }
            : undefined;

        // console.debug(`[${this.id}] updating items...`);
        this.beginUpdate();
        try {
            for (let { add, remove } of this.itemUpdatesOnce()) {
                if (typeof remove !== 'undefined') {
                    // Item hidden
                    // console.debug(`[${this.id}] hide: ${JSON.stringify(remove)}`);
                    this.queueItem(remove);
                } else if (typeof add !== 'undefined') {
                    // Item shown
                    // console.debug(`[${this.id}] show: ${JSON.stringify(add)}`);
                    if (!this.dequeueItem(add, renderOptions)) {
                        this.createItem(add);
                        needsRender = true;
                        // console.debug(`[${this.id}] need to render ${JSON.stringify(add)}`);
                    }
                }
            }
            let itemAnimationOptions = {
                ...animationOptions,
                manualStart: true,
            };

            if (visible || animationOptions.animated) {
                for (let index of this.visibleIndexes()) {
                    let item = this.getVisibleItem(index);
                    if (item) {
                        let previous = this._getItemSnapshot(item);
                        animation = this.updateItem(item, index, itemAnimationOptions);
                        if (forceRender && !needsRender) {
                            this._renderItem(item, previous, renderOptions);
                        }
                        if (animation) {
                            animations.push(animation);
                        }
                    }
                }
            }

            if (queued && forceRender) {
                for (let item of this.flatQueuedItems()) {
                    item.forceRenderOnDequeue = true;
                }
            }
        } catch (error) {
            console.error('Error during update: ' + error?.message || error);
        }
        this.endUpdate({ needsRender });

        animation = undefined;
        if (animations.length !== 0) {
            animation = Animated.parallel(animations);
            if (!options?.manualStart) {
                animation.start();
            }
        }
        // let updateTime = new Date().valueOf() - startTimestamp;
        // console.debug(`[${this.id}] updated items in ${updateTime} ms`);
        return animation;
    }

    dequeueItem(index: T, renderOptions?: IItemRenderOptions): IItem<T> | undefined {
        let reuseID = this.getReuseID(index);
        let item = this._dequeueItem(reuseID);
        if (item) {
            let previous = this._getItemSnapshot(item);
            this.updateItem(item, index, { dequeued: true });

            let force = renderOptions?.force || item.forceRenderOnDequeue;
            item.forceRenderOnDequeue = false;

            this._renderItem(
                item,
                previous,
                {
                    ...renderOptions,
                    force
                }
            );
        }
        return item;
    }

    private _getItemSnapshot(item: IItem<T>): IItemSnapshot<T> {
        return {
            index: item.index,
            contentLayout: { ...item.contentLayout },
        };
    }

    private _renderItem(
        item: IItem<T>,
        previous: IItemSnapshot<T>,
        options?: IItemRenderOptions
    ) {
        let itemNode = item.ref.current;
        if (!itemNode) {
            return;
        }
        if (options?.force || this.props.shouldRenderItem(item, previous)) {
            // Update existing rendered node
            itemNode.setNeedsRender();
        }
    }
}

const createLayoutSourceID = (id: string | undefined, suffix?: string) => {
    if (id) {
        if (_layoutSourceIDs.has(id)) {
            throw new Error('Duplicate layout source ID');
        }
    } else {
        do {
            id = [String(++_layoutSourceCounter), suffix]
                .filter(x => !!x)
                .join('_');
        } while (_layoutSourceIDs.has(id));
    }
    return id;
}
