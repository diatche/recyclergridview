import {
    IItemLayout,
    LayoutSource,
    LayoutSourceProps,
    RecyclerGridView as Grid,
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
    getItemLayout?: (index: T) => IItemCustomLayout;
    getVisibleIndexSet(
        visibleRange: [IPoint, IPoint],
        layoutSource: CustomLayoutSource,
        view: Grid,
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

    shouldUpdate(view: Grid) {
        let pendingVisibleIndexSet = this.getVisibleIndexSet(view);
        return !isSetEqual(
            pendingVisibleIndexSet,
            this.visibleIndexSet
        );
    }

    didBeginUpdate(view: Grid) {
        super.didBeginUpdate(view);
        this.pendingVisibleIndexSet = this.getVisibleIndexSet(view);
        // console.debug(`[${this.id}] visible items: ` + Object.keys(this.visibleItems).length);
        // console.debug(`[${this.id}] currentVisibleIndexSet: ` + JSON.stringify(Array.from(this.visibleIndexSet)));
        // console.debug(`[${this.id}] pendingVisibleIndexSet: ` + JSON.stringify(Array.from(this.pendingVisibleIndexSet)));
    }

    didEndUpdate(view: Grid) {
        let pendingVisibleIndexSet = this.pendingVisibleIndexSet;
        if (pendingVisibleIndexSet) {
            this.visibleIndexSet = pendingVisibleIndexSet;
        }
        super.didEndUpdate(view);
    }

    getVisibleIndexSet(view: Grid): Set<T> {
        return this.props.getVisibleIndexSet(
            this.getVisibleLocationRange(view),
            this,
            view
        );
    }
}
