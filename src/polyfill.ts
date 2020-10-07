import { Animated } from 'react-native';

if (!Animated.subtract) {
    // Some versions of React Native Web (e.g. 0.11.7) are missing `subtract`.
    Animated.subtract = (a, b) => (
        Animated.add(a, Animated.multiply(b, -1))
    );
}
