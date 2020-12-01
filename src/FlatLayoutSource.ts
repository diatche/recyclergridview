import {
    IItemLayout,
    LayoutSource,
    LayoutSourceProps,
    Evergrid as Grid,
} from "./internal";
import {
    IAnimationBaseOptions,
    IItem,
    IItemUpdate,
    IPoint,
} from "./types";
import {
    emptyRange,
    forEachInstertedIndexInRange,
    horizontalBooleanToAxis,
    isRangeEqual,
    zeroPoint,
} from "./util";

declare type T = number;

export interface FlatLayoutSourceProps extends LayoutSourceProps<T> {
    onVisibleRangeChange?: (
        visibleRange: [T, T],
        layoutSource: LayoutSource,
    ) => void;
    horizontal?: boolean;
}

export default class FlatLayoutSource extends LayoutSource<T, FlatLayoutSourceProps> {
    horizontal: boolean;
    visibleItems: { [i: number]: IItem<T> };
    visibleRange: [T, T];
    pendingVisibleRange?: [T, T];

    constructor(props: FlatLayoutSourceProps) {
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
    
    getVisibleItemAtLocation(p: IPoint, ): IItem<T> | undefined {
        let i = this.getGridIndex(p, { floor: true });
        let axis = horizontalBooleanToAxis(this.horizontal);
        return this.getVisibleItem(i[axis]);
    }

    willAddItem(
        item: IItem<T>,
        options?: IAnimationBaseOptions
    ) {
        // Shift indexes of visible items
        let visibleRange = this.pendingVisibleRange || this.visibleRange;
        for (let i = visibleRange[1] - 1; i >= item.index; i--) {
            let item = this.visibleItems[i];
            if (item) {
                this.updateItem(item, i + 1, options);
            }
        }
        if (item.index < this.visibleRange[0]) {
            this.visibleRange[0] += 1;
        }
        this.visibleRange[1] += 1;
    }

    didRemoveItem(
        { index }: { index: T },
        options?: IAnimationBaseOptions
    ) {
        // Shift indexes of visible items
        let visibleRange = this.pendingVisibleRange || this.visibleRange;
        if (visibleRange[1] <= visibleRange[0]) {
            return;
        }
        for (let i = index; i < visibleRange[1] - 1; i++) {
            let item = this.visibleItems[i + 1];
            if (item) {
                this.updateItem(item, i, options);
            }
        }
        delete this.visibleItems[this.visibleRange[1] - 1];
        if (index < this.visibleRange[0]) {
            this.visibleRange[0] -= 1;
        }
        this.visibleRange[1] -= 1;
    }

    shouldUpdate() {
        let pendingVisibleRange = this.getVisibleRange();
        return !isRangeEqual(
            pendingVisibleRange,
            this.visibleRange
        );
    }

    didBeginUpdate() {
        super.didBeginUpdate();
        this.pendingVisibleRange = this.getVisibleRange();
        // console.debug(`[${this.id}] visible items: ` + Object.keys(this.visibleItems).length);
        // console.debug(`[${this.id}] currentVisibleRange: ` + JSON.stringify(this.visibleRange));
        // console.debug(`[${this.id}] pendingVisibleRange: ` + JSON.stringify(this.pendingVisibleRange));
    }

    didEndUpdate() {
        let pendingVisibleRange = this.pendingVisibleRange;
        if (pendingVisibleRange) {
            this.visibleRange = pendingVisibleRange;
        }
        super.didEndUpdate();
        if (pendingVisibleRange) {
            this.props.onVisibleRangeChange?.(pendingVisibleRange, this);
        }
    }

    getVisibleRange(): [T, T] {
        let [startPoint, endPoint] = this.getVisibleGridIndexRange();
        let axis = horizontalBooleanToAxis(this.horizontal);
        return [startPoint[axis], endPoint[axis]];
    }
}
