import { Animated } from "react-native";
import { kInsetKeys, kZeroInsets } from "./const";
import {
    AnimatedValueDerivedInput,
    IAnimatedPoint,
    IInsets,
    IItemLayout,
    ILayout,
    MutableAnimatedPoint,
    RecyclerGridView as Grid,
} from "./internal";
import {
    AnimatedValueXYDerivedInput,
    IItem,
    IItemUpdate,
    InsetEdge,
    IPoint,
    IAnimationBaseOptions,
    IAnimatedPointInput,
} from "./types";
import {
    getLazyArray,
    isPointInsideItemLayout,
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

export interface ILayoutUpdateInfo {
    cancelled?: boolean;
    needsRender?: boolean;
}

export interface LayoutSourceProps<T> {
    /**
     * The default item size in content coordinates.
     * The resulting view size is affected by scale.
     */
    itemSize?: AnimatedValueXYDerivedInput<Grid>;
    origin?: AnimatedValueXYDerivedInput<Grid>;
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
    itemOrigin?: AnimatedValueXYDerivedInput<Grid>;
    /**
     * Set to `{ x: 1, y: 1 }` by default.
     * 
     * To add a parallax effect, set component
     * values to larger or smaller than 1 to make
     * the items appear closer and further away
     * respectively.
     */
    scale?: AnimatedValueXYDerivedInput<Grid>;
    /**
     * Specifies how much to inset the content grid
     * in view coordinates (pixels).
     */
    insets?: Partial<IInsets<AnimatedValueDerivedInput<Grid>>>;
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
     * behaviour [in the view]{@link RecyclerCollectionViewProps}.
     * 
     * You can also set each item's z-index individually
     * in the item's layout callback. Refer to the subclasses
     * item layout method for more information.
     */
    zIndex?: number;
    reuseID?: string;
    /**
     * All items are reused by default.
     * 
     * Passing an empty string does not reuse that item.
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
    shouldRenderItem: (data: {
        item: IItem<T>;
        previous: Pick<IItem<T>, 'index' | 'contentLayout'>;
    }) => boolean;
    /**
     * Overrides item view layout. Does not scale.
     * Can override offset, size or both.
     */
    getItemViewLayout?: (
        index: T,
        view: Grid,
        layoutSource: LayoutSource,
    ) => Partial<ILayout<IAnimatedPointInput>> | undefined;
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

export default class LayoutSource<
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
    private _updateInfoQueue: (ILayoutUpdateInfo | undefined)[] = [];

    constructor(props: Props) {
        this.props = {
            ...kDefaultProps,
            ...props,
        };
        this.id = String(++_layoutSourceCounter);
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

    configure(view: Grid, options?: { zIndex?: number }) {
        this.unconfigure();

        let needsForcedUpdate = false;
        let sub = '';

        this.itemSize$ = normalizeAnimatedDerivedValueXY(this.props.itemSize, view);
        this._itemSize = {
            // @ts-ignore: _value is private
            x: this.itemSize$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.itemSize$.y._value || 0,
        };
        sub = this.itemSize$.addListener(p => {
            this._itemSize = p;
            this.setNeedsUpdate(view);
        });
        this._animatedSubscriptions[sub] = this.itemSize$;

        this.origin$ = normalizeAnimatedDerivedValueXY(this.props.origin, view);
        this._origin = {
            // @ts-ignore: _value is private
            x: this.origin$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.origin$.y._value || 0,
        };
        sub = this.origin$.addListener(p => {
            this._origin = p;
            this.setNeedsUpdate(view);
        });
        this._animatedSubscriptions[sub] = this.origin$;

        this.itemOrigin$ = normalizeAnimatedDerivedValueXY(this.props.itemOrigin, view);
        this._itemOrigin = {
            // @ts-ignore: _value is private
            x: this.itemOrigin$.x._value || 0,
            // @ts-ignore: _value is private
            y: this.itemOrigin$.y._value || 0,
        };
        sub = this.itemOrigin$.addListener(p => {
            this._itemOrigin = p;
            this.setNeedsUpdate(view);
        });
        this._animatedSubscriptions[sub] = this.itemOrigin$;

        this.scale$ = normalizeAnimatedDerivedValueXY(this.props.scale, view, this._scale);
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
            this.setNeedsUpdate(view);
        });
        this._animatedSubscriptions[sub] = this.scale$;

        kInsetKeys.forEach(insetKey => {
            let currentInset$ = this.insets$[insetKey];
            let inset$ = normalizeAnimatedDerivedValue(this.props.insets?.[insetKey], view, currentInset$);
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
                this.setNeedsUpdate(view);
            });
            this._animatedSubscriptions[sub] = inset$;
        });

        this._zIndex = options?.zIndex || 0;

        if (needsForcedUpdate) {
            this.setNeedsUpdate(view, { force: true });
        }
    }

    unconfigure() {
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

    * itemUpdates(): Generator<IItemUpdate<T>> {
        throw new Error('Not implemented');
    }

    * visibleIndexes(): Generator<T> {
        throw new Error('Not implemented');
    }

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

    setNeedsUpdate(view: Grid, options?: { force?: boolean }) {
        let { force = false } = options || {};
        if (!force && view.needsRender) {
            // View will render anyway
            return;
        }
        if (force || this.shouldUpdate(view)) {
            this.updateItems(view);
        }
    }

    /**
     * Return true when a layout update is needed.
     * @param view 
     */
    shouldUpdate(view: Grid) {
        return true;
    }

    /**
     * Call this method before making layout updates.
     * 
     * Subclasses must call the super implementation first.
     * @param view 
     */
    beginUpdate(view: Grid) {
        this._updateDepth += 1;
        if (this._updateDepth === 1) {
            this.didBeginUpdate(view);
        }
    }

    /**
     * Call this method after making layout updates.
     * 
     * Subclasses must call the super implementation last.
     * @param view 
     */
    endUpdate(view: Grid, info?: ILayoutUpdateInfo) {
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
        
        let cancelled = false;
        let needsRender = false;
        for (let info of this._updateInfoQueue) {
            if (!needsRender && info?.needsRender) {
                needsRender = true;
            }
            if (info?.cancelled) {
                cancelled = true;
                break;
            }
        }
        this._updateInfoQueue = [];

        if (cancelled) {
            this.didCancelUpdate(view);
        } else {
            this.didCommitUpdate(view);
        }
        this.didEndUpdate(view);
        if (needsRender) {
            view.setNeedsRender();
        }
    }

    /**
     * Called when an update begins.
     * 
     * Subclasses must call the super implementation first.
     * Do not call this method directly.
     * @param view 
     */
    didBeginUpdate(view: Grid) {
        // console.debug(`[${this.id}] ` + 'beginUpdate');
    }

    /**
     * Called when an update is commited.
     * 
     * Subclasses must call the super implementation last.
     * Do not call this method directly.
     * @param view 
     */
    didCommitUpdate(view: Grid) {
        // console.debug(`[${this.id}] ` + 'commitUpdate');
    }

    /**
     * Called when an update is cancelled.
     * 
     * Subclasses must call the super implementation last.
     * Do not call this method directly.
     * @param view 
     */
    didCancelUpdate(view: Grid) {
        // console.debug(`[${this.id}] ` + 'cancelUpdate');
    }

    /**
     * Called when an update is committed or cancelled.
     * 
     * Subclasses must call the super implementation last.
     * Do not call this method directly.
     * @param view 
     */
    didEndUpdate(view: Grid) {
        // console.debug(`[${this.id}] ` + 'endUpdate');

        // TODO: Set opacity of newly queued items to 0
    }

    getVisibleLocationRange(view: Grid): [IPoint, IPoint] {
        let { x: width, y: height } = this.getViewportSize(view);
        if (width < 1 || height < 1) {
            return [zeroPoint(), zeroPoint()];
        }
        let { x, y } = this.getViewportOffset(view);
        let scale = this.getScale(view);
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
        let start = this.getLocation(startOffset, view);
        let end = this.getLocation(endOffset, view);
        if (start.x > end.x || start.y > end.y) {
            return [zeroPoint(), zeroPoint()];
        }
        return [start, end];
    }

    getVisibleGridIndexRange(
        view: Grid,
        options?: {
            partial?: boolean
        }
    ): [IPoint, IPoint] {
        let range = this.getVisibleLocationRange(view);
        range[0] = this.getGridIndex(
            range[0],
            view,
            options?.partial
                ? undefined
                : { floor: true }
        );
        range[1] = this.getGridIndex(
            range[1],
            view, 
            options?.partial
                ? undefined
                : { ceil: true }
        );
        return range;
    }

    getStickyContainerLocation(view: Grid): Partial<IPoint> {
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
        let size = view.containerSize;
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

    getStickyContainerLocation$(view: Grid): Partial<IAnimatedPoint> {
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
        let size = view.containerSize$;
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

    getContainerLocation(point: IPoint, view: Grid): IPoint {
        let { x, y } = view.getContainerLocation(point, {
            scale: this.scale
        });
        let p = this.getStickyContainerLocation(view);
        let scale = this.getScale(view);
        
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

    getContainerLocation$(point: IAnimatedPoint | Animated.ValueXY, view: Grid): IAnimatedPoint {
        let { x, y } = view.getContainerLocation$(point, {
            scale: this.scale$
        });
        let p = this.getStickyContainerLocation$(view);
        let scale = this.getScale(view);
        let scale$ = this.getScale$(view);
        
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

    getScale(view: Grid): IPoint {
        let { scale } = view;
        return {
            x: this._scale.x * scale.x,
            y: this._scale.y * scale.y,
        };
    }

    getScale$(view: Grid): IAnimatedPoint {
        let { scale$ } = view;
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
    getLocation(point: IPoint, view: Grid): IPoint {
        let { x, y } = view.getLocation(point);
        let offset = this.getLocationInsetOffset(view);
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
    getLocationInsetOffset(view: Grid): IPoint {
        let scale = this.getScale(view);
        return {
            x: Math.max(this._insets.left / scale.x, -this._insets.right / scale.x),
            y: Math.max(this._insets.top / scale.y, -this._insets.bottom / scale.y),
        };
    }

    /**
     * Transforms a point in content coordinates
     * to an index of a grid of size `itemSize`.
     * @param point 
     */
    getGridIndex(
        point: IPoint,
        view: Grid,
        options?: {
            floor?: boolean;
            ceil?: boolean;
            round?: boolean;
        }
    ): IPoint {
        if (this._itemSize.x == 0 || this._itemSize.y == 0) {
            return zeroPoint();
        }
        let offset = this.getLocationInsetOffset(view);
        let i = {
            x: (point.x - offset.x) / this._itemSize.x + this._itemSize.x * this._itemOrigin.x,
            y: (point.y - offset.y) / this._itemSize.y + this._itemSize.y * this._itemOrigin.y,
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

    getViewportOffset(view: Grid): IPoint {
        let { x, y } = view.viewOffset;
        let scale = this.getScale(view);
        return {
            x: x + (scale.x > 0 ? this._insets.left : -this._insets.right),
            y: y + (scale.y > 0 ? -this._insets.top : this._insets.bottom),
        };
    }
    
    getViewportSize(view: Grid): IPoint {
        let { x, y } = view.containerSize;
        return {
            x: x - this._insets.left - this._insets.right,
            y: y - this._insets.top - this._insets.bottom,
        };
    }

    getItemContentLayout(index: T): IItemLayout {
        throw new Error('Not implemented');
    }

    getItemViewLayout$(index: T, view: Grid): Partial<ILayout<IAnimatedPointInput>> | undefined {
        return this.props.getItemViewLayout?.(index, view, this);
    }

    createItemContentLayout$(): ILayout<MutableAnimatedPoint> {
        return {
            offset: new Animated.ValueXY(),
            size: new Animated.ValueXY(),
        };
    }

    createItemViewLayout$(
        contentLayout$: ILayout<MutableAnimatedPoint>,
        view: Grid,
        overrides: Partial<ILayout<IAnimatedPoint>> = {}
    ): ILayout<IAnimatedPoint> {
        let scale$ = this.getScale$(view);
        let layout: ILayout<IAnimatedPoint> = {
            offset: overrides.offset || this.getContainerLocation$(contentLayout$.offset, view),
            size: overrides.size || {
                x: Animated.multiply(contentLayout$.size.x, scale$.x),
                y: Animated.multiply(contentLayout$.size.y, scale$.y),
            }
        };

        // Apply item origin
        layout.offset.x = Animated.subtract(
            layout.offset.x,
            Animated.multiply(this.itemOrigin$.x, layout.size.x)
        );
        layout.offset.y = Animated.subtract(
            layout.offset.y,
            Animated.multiply(this.itemOrigin$.y, layout.size.y)
        );

        let scale = this.getScale(view);
        if (scale.x < 0) {
            if (!overrides.size) {
                let widthOffset = layout.size.x;
                layout.offset.x = Animated.add(layout.offset.x, widthOffset);
                layout.size.x = negate$(layout.size.x);
            }
        }
        if (scale.y < 0) {
            if (!overrides.size) {
                let heightOffset = layout.size.y;
                layout.offset.y = Animated.add(layout.offset.y, heightOffset);
                layout.size.y = negate$(layout.size.y);
            }
        }
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
     * @param view 
     * @param options 
     */
    willAddItem(
        { index }: { index: T },
        view: Grid,
        options?: IAnimationBaseOptions
    ) {
        throw new Error('Adding items is not supported');
    }

    addItem(
        { index }: { index: T },
        view: Grid,
        options?: IAnimationBaseOptions
    ): IItem<T> {
        this.beginUpdate(view);
        let updateInfo: ILayoutUpdateInfo | undefined;
        try {
            this.willAddItem({ index }, view, options);
            let item = this.dequeueItem(index);
            if (!item) {
                item = this.createItem(index, view);
                updateInfo = { needsRender: true };
            }
            this.updateItems(view, options);
            this.endUpdate(view, updateInfo);
            return item;
        } catch (error) {
            this.endUpdate(view, { cancelled: true });
            throw error;
        }
    }

    /**
     * Override to support removing items.
     * @param index 
     * @param view 
     * @param options 
     */
    didRemoveItem(
        { index }: { index: T },
        view: Grid,
        options?: IAnimationBaseOptions
    ) {
        throw new Error('Removing items is not supported');
    }

    removeItem(
        item: { index: T },
        view: Grid,
        options?: IAnimationBaseOptions
    ) {
        this.beginUpdate(view);
        try {
            this.queueItem(item.index);
            this.didRemoveItem(item, view, options);
            this.updateItems(view, options);
            this.endUpdate(view);
        } catch (error) {
            this.endUpdate(view, { cancelled: true });
            throw error;
        }
    }

    createItem(index: T, view: Grid) {
        let contentLayout = this.createItemContentLayout$();
        let overrides = normalizePartialAnimatedLayout(
            this.getItemViewLayout$(index, view)
        );
        let viewLayout = this.createItemViewLayout$(
            contentLayout,
            view,
            overrides
        );
        
        let item: IItem<T> = {
            index,
            ref: view.createItemViewRef(),
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
        };
        item.reuseID = this.getReuseID(index);

        this.props.didCreateItem?.(item);

        // console.debug(`[${this.id}] created (${item.reuseID}) at ${JSON.stringify(index)}`);
        this.updateItem(item, index, { isNew: true });
        return item;
    }

    updateItem(
        item: IItem<T>,
        index: T,
        options?: {
            isNew?: boolean;
        } & IAnimationBaseOptions
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

        // Determine when to show item:
        if (options?.isNew) {
            // Animate opacity to reduce jarring effect
            // in ItemView render (if duration given).
            if (this.showDuration <= 0) {
                // No duration given
                item.animated.opacity.setValue(1);
            }
        } else {
            // Updated items are always shown instantly
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

    getVisibleItem(index: T): IItem<T> | undefined {
        throw new Error('Not implemented');
    }

    setVisibleItem(index: T, item: IItem<T> | undefined) {
        throw new Error('Not implemented');
    }

    /**
     * Override to optimise.
     * @param p 
     */
    getVisibleItemAtLocation(p: IPoint, view: Grid): IItem<T> | undefined {
        for (let i of this.visibleIndexes()) {
            let item = this.getVisibleItem(i);
            let contentLayout = item?.contentLayout;
            if (contentLayout && isPointInsideItemLayout(p, contentLayout)) {
                return item;
            }
        }
        return undefined;
    }

    private _dequeueItem(reuseID: string): IItem<T> | undefined {
        let queue = getLazyArray(this._itemQueues, reuseID);
        let item = queue.pop();
        if (item && item.reuseID !== reuseID) {
            console.error(`Dequeued an item from queue with reuseID "${reuseID}" with a different reuseID "${item.reuseID}"`);
        }
        // if (item) {
        //     console.debug(`[${this.id}] dequeued ${reuseID} (size: ${queue.length})`);
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

    updateItems(
        view: Grid,
        options?: {
            queue?: boolean;
            dequeue?: boolean;
            create?: boolean;
            update?: boolean;
        } & IAnimationBaseOptions
    ): Animated.CompositeAnimation | undefined {
        let {
            queue = true,
            dequeue = true,
            create = false,
            update = false,
            ...animationOptions
        } = options || {};
        let dequeueOptions = { prerender: create };
        let animations: Animated.CompositeAnimation[] = [];
        let animation: Animated.CompositeAnimation | undefined;

        // console.debug(`[${this.id}] ` + 'updateItems');
        this.beginUpdate(view);
        try {
            for (let { add, remove } of this.itemUpdates()) {
                if (queue && typeof remove !== 'undefined') {
                    // Item hidden
                    // console.debug(`[${this.id}] ` + 'hide: ' + JSON.stringify(remove));
                    this.queueItem(remove);
                } else if (typeof add !== 'undefined') {
                    // Item shown
                    // console.debug(`[${this.id}] ` + 'show: ' + JSON.stringify(add));
                    if (!dequeue || !this.dequeueItem(add, dequeueOptions)) {
                        if (create) {
                            this.createItem(add, view);
                        } else {
                            this.endUpdate(view, {
                                cancelled: true,
                                needsRender: true,
                            });
                            return undefined;
                        }
                    }
                    // else {
                    //     // console.debug(`[${this.id}] ` + 'dequeued: ' + JSON.stringify(add));
                    // }
                }
            }
            let itemAnimationOptions = {
                ...animationOptions,
                manualStart: true,
            };

            if (update || animationOptions.animated) {
                for (let index of this.visibleIndexes()) {
                    let item = this.getVisibleItem(index);
                    if (item) {
                        animation = this.updateItem(item, index, itemAnimationOptions);
                        if (animation) {
                            animations.push(animation);
                        }
                    }
                }
            }
            this.endUpdate(view);
        } catch (error) {
            console.error('Error during update: ' + error?.message || error);
            this.endUpdate(view, { cancelled: true });
        }

        animation = undefined;
        if (animations.length !== 0) {
            animation = Animated.parallel(animations);
            if (!options?.manualStart) {
                animation.start();
            }
        }
        return animation;
    }

    dequeueItem(
        index: T,
        options?: {
            prerender?: boolean
        }
    ): IItem<T> | undefined {
        let reuseID = this.getReuseID(index);
        let item = this._dequeueItem(reuseID);
        let itemNode = item?.ref.current;
        if (item && !itemNode && !options?.prerender) {
            // We have an existing item to reuse, but have neither a rendered react node
            // nor we are about to render new nodes.
            // !itemNode && console.debug(`Item ${JSON.stringify(item.index)} has no view node on dequeue`);
            item = undefined;
        }
        if (item) {
            // We have an existing item to reuse with either a rendered react node
            // or we are about to render new nodes.
            let previous = {
                index: item.index,
                contentLayout: { ...item.contentLayout },
            };
            this.updateItem(item, index);
            if (itemNode && this.props.shouldRenderItem({ item, previous })) {
                // Update existing rendered node
                itemNode.setNeedsRender();
            }
        }
        return item;
    }
}
