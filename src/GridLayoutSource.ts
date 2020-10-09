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
    emptyPointRange,
    forEachInstertedPointInRange,
    isPointRangeEqual,
} from "./util";

declare type T = IPoint;

export interface GridLayoutSourceProps extends LayoutSourceProps<T> {
    
}

export default class GridLayoutSource extends LayoutSource<IPoint, GridLayoutSourceProps> {
    visibleItems: { [xy: string]: IItem<T> };
    visibleRange: [T, T];
    pendingVisibleRange?: [T, T];

    constructor(props: GridLayoutSourceProps) {
        super(props);
        this.visibleItems = {};
        this.visibleRange = emptyPointRange();
    }

    getItemContentLayout(index: T): IItemLayout {
        let { itemSize: size } = this;
        return {
            offset: {
                x: index.x * size.x,
                y: index.y * size.y,
            },
            size,
        };
    }

    encodeIndex(index: T): string {
        return `${index.x},${index.y}`;
    }

    getVisibleItem(index: T): IItem<T> | undefined {
       return this.visibleItems[this.encodeIndex(index)];
    }

    setVisibleItem(index: T, item: IItem<T> | undefined) {
        let i = this.encodeIndex(index);
        if (item) {
            this.visibleItems[i] = item;
        } else {
            delete this.visibleItems[i];
        }
    }

    * itemUpdates(): Generator<IItemUpdate<T>> {
        let pendingVisibleRange = this.pendingVisibleRange;
        if (!pendingVisibleRange) {
            return;
        }
        // Hidden items
        let it = forEachInstertedPointInRange(
            pendingVisibleRange,
            this.visibleRange,
        );
        for (let i of it) {
            yield { remove: i };
        }

        // Shown items
        it = forEachInstertedPointInRange(
            this.visibleRange,
            pendingVisibleRange,
        );
        for (let i of it) {
            yield { add: i };
        }
    }

    * visibleIndexes(): Generator<T> {
        let [p0, pN] = this.pendingVisibleRange || this.visibleRange;
        for (let x = p0.x; x < pN.x; x++) {
            for (let y = p0.y; y < pN.y; y++) {
                yield { x, y };
            }
        }
    }

    shouldUpdate(view: Grid) {
        let pendingVisibleRange = this.getVisibleGridIndexRange(view);
        return !isPointRangeEqual(
            pendingVisibleRange,
            this.visibleRange
        );
    }

    beginUpdate(view: Grid) {
        super.beginUpdate(view);
        this.pendingVisibleRange = this.getVisibleGridIndexRange(view);
        // console.debug(`[${this.id}] visible items: ${Object.keys(this.visibleItems).length} (ok: ${Object.values(this.visibleItems).filter(item => !!item.ref?.current).length})`);
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
}
