/** A native dropdown, restyled. */
export interface SelectOption { value: string; label: string }
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /** Plain strings, or {value,label} objects. */
  options?: (string | SelectOption)[];
}
export declare function Select(props: SelectProps): JSX.Element;
