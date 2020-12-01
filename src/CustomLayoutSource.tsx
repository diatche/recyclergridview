import {
    IItemLayout,
    LayoutSource,
    LayoutSourceProps,
    Evergrid as Grid,
} from "./internal";
import {
    IItem,
    IItemUpdate,
    IPoint,
} from "./types";
import {
    forEachInstertedIndexInSet,
    isSetEqual,
    zeroPoint,
} from "./util";

declare type T = number;

export declare type IItemCustomLayout = Pick<IItemLayout, 'offset'> & Partial<IItemLayout>;

export interface CustomLayoutSourceProps extends LayoutSourceProps<T> {
    /**
     * Called when an item's layout is needed.
     * An offset must be returned, all other layout
     * properties are optional.
     * @param index The item's index.
     * @returns A custom layout object.
     */
    getItemLayout?: (index: T) => IItemCustomLayout;

    /**
     * Called to determine which items are visible.
     * @param visibleRange The visible bounding points in content coordinates.
     * @param layoutSource This layout source.
     * @returns A set of item indexes.
     */
    getVisibleIndexSet(
        visibleRange: [IPoint, IPoint],
        layoutSource: CustomLayoutSource,
    ): Set<T>;
}

export default class CustomLayoutSource extends LayoutSource<T, CustomLayoutSourceProps> {
    visibleItems: { [i: number]: IItem<T> };
    visibleIndexSet: Set<T>;
    pendingVisibleIndexSet?: Set<T>;

    constructor(props: CustomLayoutSourceProps) {
        super(props);
        this.visibleItems = {};
        this.visibleIndexSet = new Set();
    }

    getItemContentLayout(index: T): IItemLayout {
        return {
            offset: zeroPoint(),
            size: this.itemSize,
            ...this.props.getItemLayout?.(index)
        };
    }

    getVisibleItem(index: T): IItem<T> | undefined {
       return this.visibleItems[index];
    }

    setVisibleItem(index: T, item: IItem<T> | undefined) {
        if (item) {
            this.visibleItems[index] = item;
        } else {
            delete this.visibleItems[index];
        }
    }

    * itemUpdates(): Generator<IItemUpdate<T>> {
        let pendingVisibleIndexSet = this.pendingVisibleIndexSet;
        if (!pendingVisibleIndexSet) {
            return;
        }
        // Hidden items
        let it = forEachInstertedIndexInSet(
            pendingVisibleIndexSet,
            this.visibleIndexSet,
        );
        for (let i of it) {
            yield { remove: i };
        }

        // Shown items
        it = forEachInstertedIndexInSet(
            this.visibleIndexSet,
            pendingVisibleIndexSet,
        );
        for (let i of it) {
            yield { add: i };
        }
    }

    * visibleIndexes(): Generator<T> {
        let indexSet = this.pendingVisibleIndexSet || this.visibleIndexSet;
        for (let i of indexSet) {
            yield i;
        }
    }

    shouldUpdate() {
        let pendingVisibleIndexSet = this.getVisibleIndexSet();
        return !isSetEqual(
            pendingVisibleIndexSet,
            this.visibleIndexSet
        );
    }

    didBeginUpdate() {
        super.didBeginUpdate();
        this.pendingVisibleIndexSet = this.getVisibleIndexSet();
        // console.debug(`[${this.id}] visible items: ` + Object.keys(this.visibleItems).length);
        // console.debug(`[${this.id}] currentVisibleIndexSet: ` + JSON.stringify(Array.from(this.visibleIndexSet)));
        // console.debug(`[${this.id}] pendingVisibleIndexSet: ` + JSON.stringify(Array.from(this.pendingVisibleIndexSet)));
    }

    didEndUpdate() {
        let pendingVisibleIndexSet = this.pendingVisibleIndexSet;
        if (pendingVisibleIndexSet) {
            this.visibleIndexSet = pendingVisibleIndexSet;
        }
        super.didEndUpdate();
    }

    /**
     * Called to determine which items are visible.
     * @returns A set of item indexes.
     */
    getVisibleIndexSet(): Set<T> {
        return this.props.getVisibleIndexSet(
            this.getVisibleLocationRange(),
            this,
        );
    }
}
