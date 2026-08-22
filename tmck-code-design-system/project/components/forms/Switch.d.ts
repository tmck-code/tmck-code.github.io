/** A binary toggle. The knob is the one control allowed to use --ease-spring. */
export interface SwitchProps {
  label?: React.ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}
export declare function Switch(props: SwitchProps): JSX.Element;
