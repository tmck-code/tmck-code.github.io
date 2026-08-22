/** A checkbox with an amber filled box and a mono tick. */
export interface CheckboxProps {
  label?: React.ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  id?: string;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
