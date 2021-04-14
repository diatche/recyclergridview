# Change Log

## develop

Changes on the `develop` branch, but not yet released, will be listed here.

### Features

-   Added `options` to `willShowItem` callback on `LayoutSource`, which now also contains a `previous` item snapshot. This allows making more informed changes to item contents based on the item update.
-   Added `layoutSource` to `shouldRenderItem` callback on `LayoutSource` to allow referencing the current layout source's state.

## 0.0.1

**19 Apr 2020**

-   Initial release.
