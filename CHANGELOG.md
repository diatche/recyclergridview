# Change Log

## master

Changes on the `master` branch, but not yet released, will be listed here.

## 0.2.0

### Features

-   [[#25](https://github.com/diatche/evergrid/pull/25)] It is now possible to call `scrollTo` and `scrollBy` multiple times. Scrolling information will be merged.
-   [[#25](https://github.com/diatche/evergrid/pull/25)] Added previous and new values to `didChangeLocationOffsetBase` (previously `didChangeLocation`) and `willChangeScale` callbacks.
-   [[#25](https://github.com/diatche/evergrid/pull/25)] Added `willChangeLocationOffsetBase` and `willChangeScale` callbacks, which fire before scrolling starts.

### Breaking Changes

-   [[#25](https://github.com/diatche/evergrid/pull/25)] Renamed `didChangeLocation` to `didChangeLocationOffsetBase`.
-   [[#25](https://github.com/diatche/evergrid/pull/25)] Calling super in `didChangeScale`, `didChangeLocationOffsetBase` (previously `didChangeLocation`), `didChangeContainerSize`, `didChangeViewportSize`, `didChangeContainerOffset` and `didChangeAnchor` is now discouraged.

## 0.1.0

**15 Apr 2021**

### Features

-   [[#24](https://github.com/diatche/evergrid/pull/24)] Added `options` to `willShowItem` callback on `LayoutSource`, which now also contains a `previous` item snapshot. This allows making more informed changes to item contents based on the item update.
-   [[#24](https://github.com/diatche/evergrid/pull/24)] Added `layoutSource` to `shouldRenderItem` callback on `LayoutSource` to allow referencing the current layout source's state.

## 0.0.1

**19 Apr 2020**

-   Initial release.
