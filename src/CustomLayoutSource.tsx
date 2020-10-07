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
} from "./util";

export interface CustomLayoutSourceProps extends LayoutSourceProps<number> {
    getItemLayout(index: number): IItemLayout;
    getVisibleIndexSet(
        visibleRange: [IPoint, IPoint],
        layoutSource: CustomLayoutSource,
        view: Grid,
    ): Set<number>;
}

export default class CustomLayoutSource extends LayoutSource<number, CustomLayoutSourceProps> {
    visibleItems: { [i: number]: IItem };
    visibleIndexSet: Set<number>;
    pendingVisibleIndexSet?: Set<number>;

    constructor(props: CustomLayoutSourceProps) {
        super(props);
        this.visibleItems = {};
        this.visibleIndexSet = new Set();
    }

    getItemContentLayout(index: number): IItemLayout {
        return this.props.getItemLayout(index);
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

    * visibleIndexes(): Generator<number> {
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

    beginUpdate(view: Grid) {
        super.beginUpdate(view);
        this.pendingVisibleIndexSet = this.getVisibleIndexSet(view);
        // console.debug(`[${this.id}] visible items: ` + Object.keys(this.visibleItems).length);
        // console.debug(`[${this.id}] currentVisibleIndexSet: ` + JSON.stringify(Array.from(this.visibleIndexSet)));
        // console.debug(`[${this.id}] pendingVisibleIndexSet: ` + JSON.stringify(Array.from(this.pendingVisibleIndexSet)));
    }

    commitUpdate(view: Grid) {
        let pendingVisibleIndexSet = this.pendingVisibleIndexSet;
        if (pendingVisibleIndexSet) {
            this.visibleIndexSet = pendingVisibleIndexSet;
        }
        // console.debug(`[${this.id}] commit update with item layouts: ` + JSON.stringify(Object.values(this.visibleItems).map(item => item.layout), null, 2));
        super.commitUpdate(view);
    }

    endUpdate(view: Grid) {
        this.pendingVisibleIndexSet = undefined;
        super.endUpdate(view);
    }

    getVisibleIndexSet(view: Grid): Set<number> {
        return this.props.getVisibleIndexSet(
            this.getVisiblePointRange(view),
            this,
            view
        );
    }
}
