import React from 'react';
import { Animated } from 'react-native';
import { LayoutSource } from './internal';
import { IItem } from './types';

export interface ItemViewProps {
    id: string;
    item: IItem<any>;
    layoutSource: LayoutSource;
    renderItem: () => React.ReactNode;
    useNativeDriver: boolean;
}

const ItemView = React.memo(({
    id,
    item,
    layoutSource,
    renderItem,
    useNativeDriver,
}: ItemViewProps) => {
    const [renderNonce, setRenderNonce] = React.useState(0);
    
    React.useEffect(() => {
        let { showDuration = 0 } = layoutSource.props;
        if (showDuration > 0) {
            // Animate opacity to reduce jarring effect
            // after render.
            Animated.timing(item.animated.opacity, {
                toValue: 1,
                duration: layoutSource.props.showDuration,
                useNativeDriver,
            }).start();
        } // Else, no duration: opacity set in item update

        let handle = item.animated.renderNonce.addListener(({ value }) => (
            setRenderNonce(value)
        ));
        return () => item.animated.renderNonce.removeListener(handle);
    }, [item]);

    return (
        <Animated.View
            key={id}
            ref={item.ref}
            style={[
                {
                    transform: [{
                        translateX: item.animated.viewLayout.offset.x,
                    }, {
                        translateY: item.animated.viewLayout.offset.y,
                    }],
                    position: "absolute",
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
});

export default ItemView;
