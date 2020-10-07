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

export interface GridLayoutSourceProps extends LayoutSourceProps<IPoint> {
    
}

export default class GridLayoutSource extends LayoutSource<IPoint> {
    visibleItems: { [xy: string]: IItem };
    visibleRange: [IPoint, IPoint];
    pendingVisibleRange?: [IPoint, IPoint];

    constructor(props: GridLayoutSourceProps = {}) {
        super(props);
        this.visibleItems = {};
        this.visibleRange = emptyPointRange();
    }

    getItemContentLayout(index: IPoint): IItemLayout {
        return {
            offset: index,
            size: { x: 1, y: 1 },
        };
    }

    encodeIndex(index: IPoint): string {
        return `${index.x},${index.y}`;
    }

    getVisibleItem(index: IPoint): IItem | undefined {
       return this.visibleItems[this.encodeIndex(index)];
    }

    setVisibleItem(index: IPoint, item: IItem | undefined) {
        let i = this.encodeIndex(index);
        if (item) {
            this.visibleItems[i] = item;
        } else {
            delete this.visibleItems[i];
        }
    }

    * itemUpdates(): Generator<IItemUpdate<IPoint>> {
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

    * visibleIndexes(): Generator<IPoint> {
        let [p0, pN] = this.pendingVisibleRange || this.visibleRange;
        for (let x = p0.x; x < pN.x; x++) {
            for (let y = p0.y; y < pN.y; y++) {
                yield { x, y };
            }
        }
    }

    shouldUpdate(view: Grid) {
        let pendingVisibleRange = this.getVisibleRange(view);
        return !isPointRangeEqual(
            pendingVisibleRange,
            this.visibleRange
        );
    }

    beginUpdate(view: Grid) {
        super.beginUpdate(view);
        this.pendingVisibleRange = this.getVisibleRange(view);
        // console.debug(`[${this.id}] visible items: ${Object.keys(this.visibleItems).length} (ok: ${Object.values(this.visibleItems).filter(item => !!(item as any).ref?.current).length})`);
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

    getVisibleRange(view: Grid): [IPoint, IPoint] {
        let [start, end] = this.getVisiblePointRange(view);
        start.x = Math.floor(start.x);
        start.y = Math.floor(start.y);
        end.x = Math.ceil(end.x);
        end.y = Math.ceil(end.y);
        return [start, end];
    }
}
