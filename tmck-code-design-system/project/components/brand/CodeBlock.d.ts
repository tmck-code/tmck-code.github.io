/** An inset code block with a mono copy affordance. */
export interface CodeBlockProps {
  code?: string;
  /** Mono uppercase eyebrow, e.g. "install" or "bash". */
  label?: string;
  copyable?: boolean;
  style?: React.CSSProperties;
}
export declare function CodeBlock(props: CodeBlockProps): JSX.Element;
