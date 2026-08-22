/**
 * A terminal frame. The brand's most-used surface — every project is a CLI tool.
 * @startingPoint section="Brand" subtitle="Terminal frame with prompt lines" viewport="700x260"
 */
export interface TerminalLine { text: string; prompt?: string; color?: string }
export interface TerminalWindowProps {
  /** Titlebar label, e.g. "zsh" or "pokesay". */
  title?: string;
  /** Strings, or {text, prompt, color} objects. Use CSS var strings for colour. */
  lines?: (string | TerminalLine)[];
  /** Set false for a bare, chrome-less block. */
  chrome?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function TerminalWindow(props: TerminalWindowProps): JSX.Element;
