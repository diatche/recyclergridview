import {
    iterateAll,
    forEachInstertedIndexInSet,
    forEachInstertedIndexInRange,
    forEachInstertedPointInRange,
} from '../src/util';


describe('util', () => {
    describe('forEachInstertedIndexInSet', () => {
        it('should iterate upper intersection', () => {
            let indexes = iterateAll(forEachInstertedIndexInSet(
                new Set([0, 1, 2]),
                new Set([2, 3]),
            ));
            expect(indexes).toEqual([3]);
        });

        it('should iterate lower intersection', () => {
            let indexes = iterateAll(forEachInstertedIndexInSet(
                new Set([2, 3]),
                new Set([0, 1, 2]),
            ));
            expect(indexes).toEqual([0, 1]);
        });
    });

    describe('forEachInstertedIndexInRange', () => {
        it('should iterate upper intersection', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([0, 3], [2, 4]));
            expect(indexes).toEqual([3]);
        });

        it('should iterate lower intersection', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([2, 4], [0, 3]));
            expect(indexes).toEqual([0, 1]);
        });

        it('should handle inserting with no intersection in front', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([2, 4], [5, 7]));
            expect(indexes).toEqual([5, 6]);
        });

        it('should handle inserting with no intersection behind', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([5, 7], [2, 4]));
            expect(indexes).toEqual([2, 3]);
        });

        it('should handle inserting with superset', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([2, 4], [0, 6]));
            expect(indexes).toEqual([0, 1, 4, 5]);
        });

        it('should handle subset', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([0, 6], [2, 4]));
            expect(indexes).toEqual([]);
        });

        it('should handle lower intersection with negative indexes', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([-1, 1], [-2, 0]));
            expect(indexes).toEqual([-2]);
        });

        it('should handle upper intersection with negative indexes', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([-2, 0], [-1, 1]));
            expect(indexes).toEqual([0]);
        });

        it('should handle to empty', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([1, 3], [4, 4]));
            expect(indexes).toEqual([]);
        });

        it('should handle from empty', () => {
            let indexes = iterateAll(forEachInstertedIndexInRange([3, 3], [3, 4]));
            expect(indexes).toEqual([3]);
        });
    });

    describe('forEachInstertedPointInRange', () => {
        it('should iterate top-right intersection', () => {
            let indexes = iterateAll(forEachInstertedPointInRange(
                [{ x: 0, y: 0 }, { x: 2, y: 2 }],
                [{ x: 1, y: 1 }, { x: 3, y: 3 }],
            ));
            expect(indexes).toEqual([
                { x: 2, y: 1 },
                { x: 1, y: 2 },
                { x: 2, y: 2 },
            ]);
        });

        it('should iterate bottom-left intersection', () => {
            let indexes = iterateAll(forEachInstertedPointInRange(
                [{ x: 1, y: 1 }, { x: 3, y: 3 }],
                [{ x: 0, y: 0 }, { x: 2, y: 2 }],
            ));
            expect(indexes).toEqual([
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
            ]);
        });

        it('should iterate top-right non-intersection', () => {
            let indexes = iterateAll(forEachInstertedPointInRange(
                [{ x: 0, y: 0 }, { x: 3, y: 3 }],
                [{ x: 4, y: 4 }, { x: 7, y: 7 }],
            ));
            expect(indexes).toEqual([
                { x: 4, y: 4 },
                { x: 5, y: 4 },
                { x: 6, y: 4 },
                { x: 4, y: 5 },
                { x: 5, y: 5 },
                { x: 6, y: 5 },
                { x: 4, y: 6 },
                { x: 5, y: 6 },
                { x: 6, y: 6 },
            ]);
        });

        it('should iterate bottom-left non-intersection', () => {
            let indexes = iterateAll(forEachInstertedPointInRange(
                [{ x: 4, y: 4 }, { x: 7, y: 7 }],
                [{ x: 0, y: 0 }, { x: 3, y: 3 }],
            ));
            expect(indexes).toEqual([
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 2, y: 0 },
                { x: 0, y: 1 },
                { x: 1, y: 1 },
                { x: 2, y: 1 },
                { x: 0, y: 2 },
                { x: 1, y: 2 },
                { x: 2, y: 2 },
            ]);
        });
    });
});