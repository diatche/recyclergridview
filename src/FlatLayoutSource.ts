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

export interface UniformLayoutSourceProps extends LayoutSourceProps<number> {
    horizontal?: boolean;
}

export default class FlatLayoutSource extends LayoutSource<number, UniformLayoutSourceProps> {
    horizontal: boolean;
    visibleItems: { [i: number]: IItem };
    visibleRange: [number, number];
    pendingVisibleRange?: [number, number];

    constructor(props: UniformLayoutSourceProps = {}) {
        super(props);
        this.horizontal = !!props.horizontal;
        this.visibleItems = {};
        this.visibleRange = emptyRange();
    }

    getItemContentLayout(index: number): IItemLayout {
        let offset = zeroPoint();
        let { itemSize: size, zIndex } = this;
        let axis = horizontalBooleanToAxis(this.horizontal);
        offset[axis] = index * size[axis];
        return { offset, size, zIndex };
    }

    getVisibleItem(index: number): IItem | undefined {
       return this.visibleItems[index];
    }

    setVisibleItem(index: number, item: IItem | undefined) {
        if (item) {
            this.visibleItems[index] = item;
        } else {
            delete this.visibleItems[index];
        }
    }

    * itemUpdates(): Generator<IItemUpdate<number>> {
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

    * visibleIndexes(): Generator<number> {
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

    beginUpdate(view: Grid) {
        super.beginUpdate(view);
        this.pendingVisibleRange = this.getVisibleRange(view);
        // console.debug(`[${this.id}] visible items: ` + Object.keys(this.visibleItems).length);
        // console.debug(`[${this.id}] currentVisibleRange: ` + JSON.stringify(this.visibleRange));
        // console.debug(`[${this.id}] pendingVisibleRange: ` + JSON.stringify(this.pendingVisibleRange));
    }

    commitUpdate(view: Grid) {
        let pendingVisibleRange = this.pendingVisibleRange;
        if (pendingVisibleRange) {
            this.visibleRange = pendingVisibleRange;
        }
        super.commitUpdate(view);
    }

    endUpdate(view: Grid) {
        this.pendingVisibleRange = undefined;
        super.endUpdate(view);
    }

    getVisibleRange(view: Grid): [number, number] {
        let [startPoint, endPoint] = this.getVisibleGridIndexRange(view);
        let axis = horizontalBooleanToAxis(this.horizontal);
        return [startPoint[axis], endPoint[axis]];
    }
}
