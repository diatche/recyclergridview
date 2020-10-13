import {
    IItemLayout,
    LayoutSource,
    LayoutSourceProps,
    RecyclerGridView as Grid,
} from "./internal";
import {
    IItem,
    IItemUpdate,
} from "./types";
import {
    emptyRange,
    forEachInstertedIndexInRange,
    horizontalBooleanToAxis,
    isRangeEqual,
    zeroPoint,
} from "./util";

declare type T = number;

export interface UniformLayoutSourceProps extends LayoutSourceProps<T> {
    horizontal?: boolean;
}

export default class FlatLayoutSource extends LayoutSource<T, UniformLayoutSourceProps> {
    horizontal: boolean;
    visibleItems: { [i: number]: IItem<T> };
    visibleRange: [T, T];
    pendingVisibleRange?: [T, T];

    constructor(props: UniformLayoutSourceProps) {
        super(props);
        this.horizontal = !!props.horizontal;
        this.visibleItems = {};
        this.visibleRange = emptyRange();
    }

    getItemContentLayout(index: T): IItemLayout {
        let offset = zeroPoint();
        let { itemSize: size } = this;
        let axis = horizontalBooleanToAxis(this.horizontal);
        offset[axis] = index * size[axis];
        return { offset, size };
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
        let pendingVisibleRange = this.pendingVisibleRange;
        if (!pendingVisibleRange) {
            return;
        }
        // Hidden items
        let it = forEachInstertedIndexInRange(
            pendingVisibleRange,
            this.visibleRange,
        );
        for (let i of it) {
            yield { remove: i };
        }

        // Shown items
        it = forEachInstertedIndexInRange(
            this.visibleRange,
            pendingVisibleRange,
        );
        for (let i of it) {
            yield { add: i };
        }
    }

    * visibleIndexes(): Generator<T> {
        let [i0, iN] = this.pendingVisibleRange || this.visibleRange;
        for (let i = i0; i < iN; i++) {
            yield i;
        }
    }

    shouldUpdate(view: Grid) {
        let pendingVisibleRange = this.getVisibleRange(view);
        return !isRangeEqual(
            pendingVisibleRange,
            this.visibleRange
        );
    }

    didBeginUpdate(view: Grid) {
        super.didBeginUpdate(view);
        this.pendingVisibleRange = this.getVisibleRange(view);
        // console.debug(`[${this.id}] visible items: ` + Object.keys(this.visibleItems).length);
        // console.debug(`[${this.id}] currentVisibleRange: ` + JSON.stringify(this.visibleRange));
        // console.debug(`[${this.id}] pendingVisibleRange: ` + JSON.stringify(this.pendingVisibleRange));
    }

    didCommitUpdate(view: Grid) {
        let pendingVisibleRange = this.pendingVisibleRange;
        if (pendingVisibleRange) {
            this.visibleRange = pendingVisibleRange;
        }
        super.didCommitUpdate(view);
    }

    didEndUpdate(view: Grid) {
        this.pendingVisibleRange = undefined;
        super.didEndUpdate(view);
    }

    getVisibleRange(view: Grid): [T, T] {
        let [startPoint, endPoint] = this.getVisibleGridIndexRange(view);
        let axis = horizontalBooleanToAxis(this.horizontal);
        return [startPoint[axis], endPoint[axis]];
    }
}
