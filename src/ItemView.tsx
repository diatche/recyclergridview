import React from 'react';
import { Animated, ViewProps } from 'react-native';
import { LayoutSource } from './internal';
import { IItem } from './types';

export interface ItemViewProps extends ViewProps {
    item: IItem<any>;
    layoutSource: LayoutSource;
    renderItem: () => React.ReactNode;
    useNativeDriver: boolean;
}

interface ItemViewState {
    renderNonce: number;
}

export default class ItemView extends React.Component<
    ItemViewProps,
    ItemViewState
> {
    private _needsRender = true;
    private _showAnimation?: Animated.CompositeAnimation;

    constructor(props: ItemViewProps) {
        super(props);
        this.state = {
            renderNonce: 0,
        };
    }

    componentDidMount() {
        let { item, layoutSource, useNativeDriver } = this.props;
        // console.debug(`item ${JSON.stringify(item.index)} mounted`);

        let { showDuration = 0 } = layoutSource.props;
        if (showDuration > 0) {
            // Animate opacity to reduce jarring effect
            // after render.
            this._showAnimation = Animated.timing(item.animated.opacity, {
                toValue: 1,
                duration: layoutSource.props.showDuration,
                useNativeDriver,
            });
            this._showAnimation.start();
        } // Else, no duration: opacity set in item update
    }

    componentWillUnmount() {
        // console.debug(`item ${JSON.stringify(this.props.item.index)} unmounted`);
        this._showAnimation?.stop();
    }

    shouldComponentUpdate(
        nextProps: ItemViewProps,
        nextState: ItemViewState
    ): boolean {
        return (
            nextState.renderNonce !== this.state.renderNonce ||
            nextProps.item !== this.props.item
        );
    }

    setNeedsRender() {
        if (this._needsRender) {
            return;
        }
        this._needsRender = true;
        let { renderNonce } = this.state;
        renderNonce += 1;
        this.setState({ renderNonce });
    }

    render() {
        let { item, renderItem } = this.props;
        this._needsRender = false;

        // console.debug(`item ${JSON.stringify(this.props.item.index)} rendered`);
        return (
            <Animated.View
                style={[
                    {
                        transform: [
                            {
                                translateX: item.animated.viewLayout.offset.x,
                            },
                            {
                                translateY: item.animated.viewLayout.offset.y,
                            },
                        ],
                        position: 'absolute',
                        width: item.animated.viewLayout.size.x,
                        height: item.animated.viewLayout.size.y,
                        opacity: item.animated.opacity,
                        zIndex: item.zIndex || 0,
                    },
                ]}
            >
                {renderItem()}
            </Animated.View>
        );
    }
}
