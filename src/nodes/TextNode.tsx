import React from "react";
import type { NodeProps } from "@xyflow/react";
import type { TextNode as TextNodeType } from "../types";

export function TextNode({ data }: NodeProps<TextNodeType>) {
  return (
    <div
      className="rfTextNode"
      style={{
        color: data.color || undefined,
        fontSize: data.fontSize || undefined,
      }}
    >
      {data.text || "Text"}
    </div>
  );
}
