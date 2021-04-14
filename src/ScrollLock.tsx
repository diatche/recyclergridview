import React from 'react';
import { Animated, Platform } from 'react-native';

const RemoveScroll$ =
    Platform.OS === 'web'
        ? import('react-remove-scroll').catch(error => {
              console.info(
                  'Scroll locking is not possible, because "react-remove-scroll" could not be loaded: ' +
                      error.message
              );
              return {};
          })
        : Promise.resolve({});

export interface ScrollLockProps {
    locked: Animated.Value;
}

/**
 * Because the collection view does not use a scroll view,
 * we need to manually lock scroll to prevent unwanted movement
 * of parent containers during panning.
 *
 * This has the added benefit of disabling iOS Safari window bounce
 * during panning.
 */
const ScrollLock = React.memo(({ locked: lockedValue }: ScrollLockProps) => {
    const [RemoveScroll, setRemoveScroll] = React.useState<any>(null);
    const [locked, setLocked] = React.useState(false);

    React.useEffect(() => {
        RemoveScroll$.then((res: any) =>
            setRemoveScroll(res?.RemoveScroll || null)
        );
    }, []);

    React.useEffect(() => {
        let handle = '';
        if (RemoveScroll) {
            handle = lockedValue.addListener(({ value }) => {
                setLocked(!!value);
            });
        }
        return () => {
            if (handle) {
                lockedValue.removeListener(handle);
            }
        };
    }, [lockedValue, RemoveScroll]);

    return RemoveScroll ? (
        <RemoveScroll enabled={locked} children={[]} />
    ) : null;
});

export default ScrollLock;
