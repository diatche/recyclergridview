import React from "react";
import {
    Animated,
    ViewProps,
} from "react-native";
import ItemView from "./ItemView";
import {
    EvergridLayout,
    LayoutSource,
} from "./internal";
import {
    IItem,
} from "./types";
import ScrollLock from "./ScrollLock";
import InteractiveValueXY from "./InteractiveValueXY";

const kWheelScalePowerBase = 1.02;

export interface EvergridProps extends ViewProps {
    renderItem: (item: IItem<any>, layoutSource: LayoutSource<any>) => React.ReactNode;
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
    private _ref = React.createRef<any>();
    private _needsRender = true;
    private _needsFirstRender = true;
    private _renderTimer: any;
    private _scrollLocked$ = new Animated.Value(0);
    private _scrollLocked = false;
    private _wheelHandler?: (event: WheelEvent) => void;
    private _wheelScale?: InteractiveValueXY;

    constructor(props: EvergridProps) {
        super(props);
        this.state = {
            renderNonce: 0,
        };
        
        if (!this.props.layout || !(this.props.layout instanceof EvergridLayout)) {
            throw new Error('Must layout property');
        }

        this.props.layout.view = this;
        this._wheelScale = new InteractiveValueXY(
            this.props.layout.scale$,
            { default: { x: 1, y: 1 } }
        );
        // this._wheelScale = new InteractiveValueXY(this.props.layout.viewOffset$);

        if (typeof this.props.renderItem !== 'function') {
            throw new Error('Must renderItem property');
        }
    }

    componentDidMount() {
        this.props.layout.componentDidMount();
        this.subscribeToWheelEvents();
    }

    componentWillUnmount() {
        this.unsubscribeFromWheelEvents();
        this.cancelScheduledRender();
        this.props.layout.componentWillUnmount();
    }

    subscribeToWheelEvents() {
        this.unsubscribeFromWheelEvents();
    
        this._wheelScale?.start();

        this._wheelHandler = (event: WheelEvent) => this.onWheelEvent(event);
        this._ref.current?.addEventListener?.(
            'wheel',
            this._wheelHandler,
            { passive: true },
        );
    }

    unsubscribeFromWheelEvents() {
        if (this._wheelHandler) {
            this._wheelScale?.stop();

            this._ref.current?.removeEventListener?.(
                'wheel',
                this._wheelHandler,
            );
            this._wheelHandler = undefined;
        }
    }

    onWheelEvent(event: WheelEvent) {
        let pixelStep = 10;
        switch (event.deltaMode) {
            case WheelEvent.DOM_DELTA_PIXEL:
                pixelStep = 1;
            case WheelEvent.DOM_DELTA_LINE:
                pixelStep = 10;
            case WheelEvent.DOM_DELTA_PAGE:
                pixelStep = 100;
        }
        let pixels = pixelStep * event.deltaY;
        let sign = pixels >= 0 ? -1 : 1;
        let mag = Math.abs(pixels);
        if (mag < 1) {
            return;
        }
        let scaleCoef = Math.pow(kWheelScalePowerBase, sign * Math.log10(mag)) || 1;

        this._wheelScale?.multiply({
            x: scaleCoef,
            y: scaleCoef,
        });
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

        let itemViews: React.ReactNode[] = [];
        if (!this._needsFirstRender) {
            for (let layoutSource of this.props.layout.layoutSources) {
                itemViews = itemViews.concat(this._renderLayoutSource(layoutSource));
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
                ref={this._ref}
                style={[
                    this.props.style,
                    {
                        overflow: "hidden",
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
                        [{
                            nativeEvent: {
                                layout: {
                                    x: this.props.layout.containerOffset$.x,
                                    y: this.props.layout.containerOffset$.y,
                                    width: this.props.layout.containerSize$.x,
                                    height: this.props.layout.containerSize$.y,
                                }
                            }
                        }],
                        {
                            // listener: event => {},
                            useNativeDriver: this.props.layout.useNativeDriver
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

    private _renderLayoutSource<T>(layoutSource: LayoutSource<T>): React.ReactNode[] {
        // console.debug(`[${layoutSource.id}] begin render`);
        let items: React.ReactNode[] = [];

        try {
            // Render visible items
            for (let index of layoutSource.visibleIndexes()) {
                let item = layoutSource.getVisibleItem(index);
                if (!item) {
                    // We cannot dequeue a item as it would trigger a `findDOMNode` event inside `render()`.
                    console.warn(`Creating item in render method. This should have been done in UNSAFE_componentWillUpdate(). Layout source: ${layoutSource.id}`);
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

    private _renderItem<T>(item: IItem<T>, layoutSource: LayoutSource<T>): React.ReactNode {
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
                renderItem={() => this.props.renderItem(item, layoutSource)}
                useNativeDriver={this.props.layout.useNativeDriver}
            />
        );
    }
}
