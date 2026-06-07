import React from "react";
import {
  BaseEdge,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  Position,
} from "@xyflow/react";
import { EdgeDeleteControl } from "./EdgeDeleteControl";

/**
 * Put dashed / padding settings on edge.data
 */
export type PaddedEdgeData = {
  color?: string;
  dashed?: boolean;
  gap?: number; // px gap at BOTH ends (default below)
  label?: string;
};

export type PaddedEdge = Edge<PaddedEdgeData, "padded">;

const DEFAULT_GAP = 12; // <- tweak this for more/less "padding" near nodes
const BORDER_RADIUS = 18;
const STEP_OFFSET = 24;

function offsetPoint(x: number, y: number, pos: Position, gap: number) {
  switch (pos) {
    case Position.Top:
      return { x, y: y - gap };
    case Position.Bottom:
      return { x, y: y + gap };
    case Position.Left:
      return { x: x - gap, y };
    case Position.Right:
      return { x: x + gap, y };
    default:
      return { x, y };
  }
}

export function PaddedSmoothStepEdge(props: EdgeProps<PaddedEdge>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    markerStart,
    selected,
    style,
    data,
  } = props;

  const gap = data?.gap ?? DEFAULT_GAP;
  const sPos = sourcePosition ?? Position.Bottom;
  const tPos = targetPosition ?? Position.Top;

  // Move endpoints away from nodes to create the nice "padding"
  const s = offsetPoint(sourceX, sourceY, sPos, gap);
  const t = offsetPoint(targetX, targetY, tPos, gap);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: s.x,
    sourceY: s.y,
    sourcePosition: sPos,
    targetX: t.x,
    targetY: t.y,
    targetPosition: tPos,
    borderRadius: BORDER_RADIUS,
    offset: STEP_OFFSET,
  });

  const dashed = !!data?.dashed;
  const color = typeof data?.color === "string" && data.color ? data.color : undefined;
  const label = typeof data?.label === "string" ? data.label : "";

  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(color ? { stroke: color } : null),
    ...(dashed ? { strokeDasharray: "7 7" } : null),
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={mergedStyle}
        className={dashed ? "rfEdgePath rfEdgePath--dashed" : "rfEdgePath"}
        interactionWidth={18} // easier to click/hover
      />
      <EdgeDeleteControl
        color={color}
        edgeId={id}
        label={label}
        selected={selected}
        x={labelX}
        y={labelY}
      />
    </>
  );
}
