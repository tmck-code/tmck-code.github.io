/** Underline tabs. The active marker is a flush 2px amber underline — never a pill. */
export interface TabItem { id: string; label?: string; icon?: string; count?: number }
export interface TabsProps {
  items: (TabItem | string)[];
  value?: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}
export declare function Tabs(props: TabsProps): JSX.Element;
