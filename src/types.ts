import type { Node } from "@xyflow/react";
import type { ReactNode } from "react";

export type BoxNodeData = {
  /** Can be string or JSX */
  title?: ReactNode;
  subtitle?: ReactNode;
  titleAlign?: "left" | "center";
  imageUrl?: string;
  imageAlt?: string;
  imageHasBackground?: boolean;
  useCustomColors?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderOpacity?: number;
  textColor?: string;

  /** Arbitrary JSX content rendered inside the node */
  content?: ReactNode;

  variant?: "default" | "dark" | "green" | "red";
};

export type DiamondNodeData = {
  label: ReactNode;
  useCustomColors?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderOpacity?: number;
  textColor?: string;
};

export type GroupNodeData = {
  color?: string;
  backgroundOpacity?: number;
  borderOpacity?: number;
  color?: string;
  backgroundOpacity?: number;
  borderOpacity?: number;
  title?: string;
  titlePlacement?: "inside" | "outside";
  titlePosition?:
    | "bottom-center"
    | "bottom-left"
    | "bottom-right"
    | "top-center"
    | "top-left"
    | "top-right";
  /** Legacy diagrams used this field before titlePosition was introduced. */
  titleSide?: "bottom" | "left" | "right" | "top";
};

export type TextNodeData = {
  color?: string;
  fontSize?: string;
  text?: string;
};

export type BoxNode = Node<BoxNodeData, "box">;
export type DiamondNode = Node<DiamondNodeData, "diamond">;
export type GroupNode = Node<GroupNodeData, "group">;
export type TextNode = Node<TextNodeData, "text">;

export type AppNode = BoxNode | DiamondNode | GroupNode | TextNode;
