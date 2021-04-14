import React from 'react';
import { Animated, View, ViewProps } from 'react-native';
import ItemView from './ItemView';
import { EvergridLayout, LayoutSource } from './internal';
import { IItem } from './types';
import ScrollLock from './ScrollLock';

export type ItemRenderCallback<T = any, C = any> = (
    item: IItem<T>,
    layoutSource: LayoutSource<T>,
    context: C
) => React.ReactNode;
export interface ItemRenderInfo<T = any, C = any> {
    renderItem: ItemRenderCallback<T, C>;
    context: C;
}
export type ItemRenderMapInput =
    | { [layoutSourceID: string]: ItemRenderInfo | ItemRenderCallback }
    | ItemRenderCallback;
export type ItemRenderMap = { [layoutSourceID: string]: ItemRenderInfo };

export interface EvergridProps extends Animated.AnimatedProps<ViewProps> {
    renderItem: ItemRenderMapInput;
    layout: EvergridLayout;
    scrollLock?: boolean;
}

interface EvergridState {
    renderNonce: number;
}

// interface EvergridSnapshot {
//     renderItems: boolean;
// }

export default class Evergrid extends React.PureComponent<
    EvergridProps,
    EvergridState
> {
    itemRenderMap: ItemRenderMap;

    private _needsRender = true;
    private _needsFirstRender = true;
    private _renderTimer: any;
    private _scrollLocked$ = new Animated.Value(0);
    private _scrollLocked = false;
    private _needsItemRenderMapUpdate = true;

    constructor(props: EvergridProps) {
        super(props);
        this.state = {
            renderNonce: 0,
        };

        if (
            !this.props.layout ||
            !(this.props.layout instanceof EvergridLayout)
        ) {
            throw new Error('Must specify valid layout');
        }

        this.itemRenderMap = {};
        this.props.layout.configure(this);
    }

    componentDidMount() {
        this.props.layout.componentDidMount();
    }

    componentWillUnmount() {
        this.cancelScheduledRender();
        this.props.layout.componentWillUnmount();
    }

    setNeedsItemRenderMapUpdate() {
        this._needsItemRenderMapUpdate = true;
    }

    updateItemRenderMap() {
        this._needsItemRenderMapUpdate = false;

        if (!this.props.renderItem) {
            throw new Error(`Missing required property: renderItem`);
        }

        let itemRenderMap: ItemRenderMap = {};
        for (let layoutSource of this.props.layout.layoutSources) {
            let renderItem: ItemRenderCallback | undefined;
            let context: any = undefined;
            if (typeof this.props.renderItem === 'function') {
                // Shared render method
                renderItem = this.props.renderItem;
            } else {
                // Render method for each layout source
                let funcOrObject = this.props.renderItem[layoutSource.id];
                if (typeof funcOrObject === 'object') {
                    renderItem = funcOrObject.renderItem;
                    context = funcOrObject.context;
                } else {
                    renderItem = funcOrObject;
                }
            }
            if (typeof renderItem !== 'function') {
                throw new Error(
                    `Must specify a valid render method for layout source "${layoutSource.id}"`
                );
            }
            itemRenderMap[layoutSource.id] = { renderItem, context };
        }
        this.itemRenderMap = itemRenderMap;
    }

    lockScroll() {
        if (this._scrollLocked) {
            return;
        }
        this._scrollLocked = true;
        this._scrollLocked$.setValue(1);
    }

    unlockScroll() {
        if (!this._scrollLocked) {
            return;
        }
        this._scrollLocked = false;
        this._scrollLocked$.setValue(0);
    }

    get needsRender(): boolean {
        return this._needsRender;
    }

    setNeedsRender() {
        if (this._needsRender) {
            return;
        }
        this._needsRender = true;
        this.scheduleRender();
        // if (!this.needsUpdate) {
        //     // Schedule render after updates only
        //     this.scheduleRender();
        // }
    }

    scheduleRender() {
        this.setState({ renderNonce: this.state.renderNonce + 1 });
        // this._renderTimer = setTimeout(() => {
        //     this._renderTimer = 0;
        //     if (!this._mounted) {
        //         return;
        //     }
        //     this.setState({ renderNonce: this.state.renderNonce + 1 });
        // }, 1);
    }

    cancelScheduledRender() {
        if (this._renderTimer) {
            clearTimeout(this._renderTimer);
            this._renderTimer = 0;
        }
    }

    render() {
        // console.debug('render recycler grid view');
        // console.debug('begin render recycler grid view');
        if (this._needsItemRenderMapUpdate) {
            this.updateItemRenderMap();
        }

        let itemViews: React.ReactNode[] = [];
        if (!this._needsFirstRender) {
            for (let layoutSource of this.props.layout.layoutSources) {
                itemViews = itemViews.concat(
                    this._renderLayoutSource(layoutSource)
                );
            }
        } // Else: wait for first empty render to get layout.

        this._needsFirstRender = false;
        this._needsRender = false;
        this.cancelScheduledRender();
        this.props.layout.cancelScheduledUpdate();

        // console.debug('end render recycler grid view');

        return (
            <Animated.View
                {...this.props}
                {...this.props.layout.panResponder?.panHandlers}
                style={[
                    this.props.style,
                    {
                        overflow: 'hidden',
                    },
                ]}
                // onLayout={Animated.event(
                //     [{
                //         nativeEvent: {
                //             layout: {
                //                 width: this.containerSize$.x,
                //                 height: this.containerSize$.y,
                //             }
                //         }
                //     }],
                //     {
                //         // listener: event => {},
                //         useNativeDriver: this._useNativeDriver
                //     }
                // )}
                onLayout={(event: any) => {
                    Animated.event(
                        [
                            {
                                nativeEvent: {
                                    layout: {
                                        x: this.props.layout.containerOffset$.x,
                                        y: this.props.layout.containerOffset$.y,
                                        width: this.props.layout.containerSize$
                                            .x,
                                        height: this.props.layout.containerSize$
                                            .y,
                                    },
                                },
                            },
                        ],
                        {
                            // listener: event => {},
                            useNativeDriver: this.props.layout.useNativeDriver,
                        }
                    )(event);
                    this.props.onLayout?.(event);
                }}
            >
                <ScrollLock locked={this._scrollLocked$} />
                {itemViews}
            </Animated.View>
        );
    }

    createItemViewRef(): React.RefObject<ItemView> {
        return React.createRef<ItemView>();
    }

    private _renderLayoutSource<T>(
        layoutSource: LayoutSource<T>
    ): React.ReactNode[] {
        // console.debug(`[${layoutSource.id}] begin render`);
        let items: React.ReactNode[] = [];

        try {
            // Render visible items
            for (let index of layoutSource.visibleIndexes()) {
                let item = layoutSource.getVisibleItem(index);
                if (!item) {
                    // We cannot dequeue a item as it would trigger a `findDOMNode` event inside `render()`.
                    console.warn(
                        `Creating item in render method. This should have been done in UNSAFE_componentWillUpdate(). Layout source: ${layoutSource.id}`
                    );
                    item = layoutSource.createItem(index);
                }
                items.push(this._renderItem(item, layoutSource));
            }

            // Render queued items to keep them from being unmounted
            for (let item of layoutSource.flatQueuedItems()) {
                if (item.ref.current) {
                    // Item view node is mounted
                    items.push(this._renderItem(item, layoutSource));
                }
            }
        } catch (error) {
            console.error('Error during render: ' + error?.message || error);
        }

        // console.debug(`[${layoutSource.id}] end render`);
        return items;
    }

    private _renderItem<T>(
        item: IItem<T>,
        layoutSource: LayoutSource<T>
    ): React.ReactNode {
        let renderer = this.itemRenderMap[layoutSource.id];
        if (!renderer) {
            throw new Error(
                `Must specify a valid render method for layout source "${layoutSource.id}"`
            );
        }
        // let viewKey = item.viewKey;
        // if (!viewKey) {
        //     viewKey = String(++this._itemViewCounter);
        //     item.viewKey = viewKey;
        //     console.debug(`[${layoutSource.id}] item ${JSON.stringify(item.index)} layout key: ${viewKey}`);
        // }
        return (
            <ItemView
                ref={item.ref}
                key={item.viewKey}
                item={item}
                layoutSource={layoutSource}
                renderItem={() =>
                    renderer.renderItem(item, layoutSource, renderer.context)
                }
                useNativeDriver={this.props.layout.useNativeDriver}
            />
        );
    }
}
