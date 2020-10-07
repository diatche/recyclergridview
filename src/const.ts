import { AxisType, IInsets, Direction } from "./types";

export const kHorizontalAxisTypes: AxisType[] = [
    'topAxis',
    'bottomAxis',
];

export const kVerticalAxisTypes: AxisType[] = [
    'rightAxis',
    'leftAxis',
];

export const kAllAxisTypes = kHorizontalAxisTypes.concat(kVerticalAxisTypes);
export const kAllAxisTypeSet = new Set(kAllAxisTypes);

export const kInsetKeys: (keyof IInsets)[] = ['top', 'right', 'bottom', 'left'];
export const kZeroInsets: IInsets = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
}

export const kDirectionToAxis: { [D in Direction]: 'x' | 'y' } = {
    horizontal: 'x',
    vertical: 'y',
};
