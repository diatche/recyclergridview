import { PanResponderCallbacks } from "react-native";
import { IInsets } from "./types";

export const kInsetKeys: (keyof IInsets)[] = ['top', 'right', 'bottom', 'left'];
export const kZeroInsets: IInsets = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
}

export const kPanResponderCallbackKeys: (keyof PanResponderCallbacks)[] = [
    'onMoveShouldSetPanResponder',
    'onMoveShouldSetPanResponder',
    'onStartShouldSetPanResponder',
    'onPanResponderGrant',
    'onPanResponderMove',
    'onPanResponderRelease',
    'onPanResponderTerminate',
    'onMoveShouldSetPanResponderCapture',
    'onStartShouldSetPanResponderCapture',
    'onPanResponderReject',
    'onPanResponderStart',
    'onPanResponderEnd',
    'onPanResponderTerminationRequest',
    'onShouldBlockNativeResponder',
];
