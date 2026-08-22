/** A single-line text field. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Helper text under the field. */
  hint?: string;
  /** Error message — replaces the hint and turns the border red. */
  error?: string;
  /** Leading Lucide icon name. */
  icon?: string;
  /** Static mono prefix, e.g. "$" or "github.com/". */
  prefix?: string;
  /** Sets the value in JetBrains Mono — use for commands, paths and handles. */
  mono?: boolean;
}
export declare function Input(props: InputProps): JSX.Element;
