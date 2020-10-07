import React from "react";
import Animated from 'react-native-reanimated';
import { RemoveScroll } from "react-remove-scroll";

export interface ScrollLockProps {
    locked: Animated.Value<number>;
}

/**
 * Because the collection view does not use a scroll view,
 * we need to manually lock scroll to prevent unwanted movement
 * of parent containers during panning.
 * 
 * This has the added benefit of disabling iOS Safari window bounce
 * during panning.
 */
const ScrollLock = ({ locked: lockedValue }: ScrollLockProps) => {
    const [locked, setLocked] = React.useState(false);
    
    React.useEffect(() => {
        let handle = lockedValue.addListener(({ value }) => {
            let x = !!value;
            if (x === locked) {
                return;
            }
            setLocked(x);
        });
        return () => lockedValue.removeListener(handle);
    });

    return (
        <RemoveScroll enabled={locked} children={[]} />
    );
};

export default ScrollLock;
