/**
 * A Lucide icon glyph, masked so it takes currentColor.
 */
export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon name, kebab-case, e.g. "git-branch". */
  name: string;
  /** Pixel size. 16 dense, 20 default, 24 headers. */
  size?: number;
}
export declare function Icon(props: IconProps): JSX.Element;
