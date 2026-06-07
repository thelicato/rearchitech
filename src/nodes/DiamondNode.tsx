import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DiamondNode as DiamondNodeType } from "../types";

export function DiamondNode({ data }: NodeProps<DiamondNodeType>) {
  return (
    <div className="rfDiamondWrap">
      {/* handles around the diamond */}
      <Handle type="target" position={Position.Top} style={{ top: -6 }} />
      <Handle type="source" position={Position.Bottom} style={{ bottom: -6 }} />
      <Handle type="source" position={Position.Left} style={{ left: -6 }} />
      <Handle type="source" position={Position.Right} style={{ right: -6 }} />

      <div className="rfDiamond">
        <div className="rfDiamond__label">{data.label}</div>
      </div>
    </div>
  );
}
