import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DiamondNode as DiamondNodeType } from "../types";

const getColorWithOpacity = (color?: string, opacity = 100) => {
  if (!color) return undefined;
  if (opacity >= 100) return color;
  if (opacity <= 0) return "transparent";
  const match = color.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return color;

  const r = Number.parseInt(match[1].slice(0, 2), 16);
  const g = Number.parseInt(match[1].slice(2, 4), 16);
  const b = Number.parseInt(match[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
};

export function DiamondNode({ data }: NodeProps<DiamondNodeType>) {
  const useCustomColors = data.useCustomColors === true;
  const customStyle: React.CSSProperties = useCustomColors
    ? {
        backgroundColor: getColorWithOpacity(data.backgroundColor, data.backgroundOpacity ?? 100),
        borderColor: getColorWithOpacity(data.borderColor, data.borderOpacity ?? 100),
      }
    : {};
  const labelStyle: React.CSSProperties = useCustomColors
    ? { color: data.textColor || undefined }
    : {};

  return (
    <div className="rfDiamondWrap">
      {/* handles around the diamond */}
      <Handle type="target" position={Position.Top} style={{ top: -6 }} />
      <Handle type="source" position={Position.Bottom} style={{ bottom: -6 }} />
      <Handle type="source" position={Position.Left} style={{ left: -6 }} />
      <Handle type="source" position={Position.Right} style={{ right: -6 }} />

      <div className="rfDiamond" style={customStyle}>
        <div className="rfDiamond__label" style={labelStyle}>{data.label}</div>
      </div>
    </div>
  );
}
