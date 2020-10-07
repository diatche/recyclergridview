import React from "react";
import Animated from 'react-native-reanimated';

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
const ScrollLock = ({ locked: lockedValue }: ScrollLockProps) => null;

export default ScrollLock;
