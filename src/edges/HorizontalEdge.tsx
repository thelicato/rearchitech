import React from "react";
import {
  BaseEdge,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { EdgeDeleteControl } from "./EdgeDeleteControl";

export type SourceSide = "left" | "right" | "bottom"; // ✅ no "top"
export type TargetAlign = "left" | "center" | "right";

export type HorizontalEdgeData = {
  color?: string;
  dashed?: boolean;
  label?: string;

  /** nice padding away from nodes at both ends */
  gap?: number;

  /** where the edge exits the source node */
  sourceSide?: SourceSide;

  /** where the edge lands on the TOP of the target node */
  targetAlign?: TargetAlign;

  /** inset px for left/right target align to avoid corners */
  targetAlignInset?: number;

  /**
   * Optional 0..1 landing percentage along the target width (after inset).
   * This effectively controls "where the bend happens" because the bend x == landing x
   * in a one-bend L-shaped route.
   *
   * 0 = left(inset), 0.5 = center, 1 = right(inset)
   */
  curvePct?: number;

  /** rounding radius for the single 90° corner */
  cornerRadius?: number;
};

export type HorizontalEdge = Edge<HorizontalEdgeData, "Horizontal">;

const DEFAULT_GAP = 12;
const DEFAULT_INSET = 16;
const DEFAULT_RADIUS = 14;

type Pt = { x: number; y: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function getNodeBox(internalNode: any) {
  if (!internalNode) return null;
  const pos = internalNode.internals?.positionAbsolute;
  const w = internalNode.measured?.width ?? internalNode.width ?? 0;
  const h = internalNode.measured?.height ?? internalNode.height ?? 0;
  if (!pos || !w || !h) return null;
  return { x: pos.x, y: pos.y, w, h };
}

function sourceAnchor(box: { x: number; y: number; w: number; h: number }, side: SourceSide): Pt {
  switch (side) {
    case "left":
      return { x: box.x, y: box.y + box.h / 2 };
    case "right":
      return { x: box.x + box.w, y: box.y + box.h / 2 };
    case "bottom":
      return { x: box.x + box.w / 2, y: box.y + box.h };
  }
}

function targetAnchorTop(
  box: { x: number; y: number; w: number; h: number },
  align: TargetAlign,
  inset: number,
  curvePct?: number
): Pt {
  const safeInset = clamp(inset, 0, box.w / 2 - 4);
  const minX = box.x + safeInset;
  const maxX = box.x + box.w - safeInset;

  // If curvePct is provided, it wins and becomes an exact landing %
  if (typeof curvePct === "number") {
    const t = clamp(curvePct, 0, 1);
    return { x: minX + t * (maxX - minX), y: box.y };
  }

  const x =
    align === "left" ? minX : align === "right" ? maxX : box.x + box.w / 2;

  return { x, y: box.y };
}

function applyGapSource(p: Pt, side: SourceSide, gap: number): Pt {
  switch (side) {
    case "left":
      return { x: p.x - gap, y: p.y };
    case "right":
      return { x: p.x + gap, y: p.y };
    case "bottom":
      return { x: p.x, y: p.y + gap };
  }
}

function applyGapTargetTop(p: Pt, gap: number): Pt {
  return { x: p.x, y: p.y - gap };
}

/**
 * Single-corner path:
 *  - Horizontal from s to (t.x, s.y)
 *  - Rounded 90° at corner
 *  - Vertical down/up to t
 *
 * If already aligned, falls back to straight line.
 */
function oneCornerPath(s: Pt, t: Pt, radius: number) {
  const fmt = (n: number) => Number(n.toFixed(2));

  // Straight cases (no bend needed)
  if (s.x === t.x || s.y === t.y) {
    return `M ${fmt(s.x)} ${fmt(s.y)} L ${fmt(t.x)} ${fmt(t.y)}`;
  }

  const corner: Pt = { x: t.x, y: s.y };

  const dx = corner.x - s.x; // horizontal segment
  const dy = t.y - corner.y; // vertical segment

  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  const rr = Math.max(0, Math.min(radius, ax / 2, ay / 2));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);

  const p1: Pt = { x: corner.x - sx * rr, y: corner.y }; // end of first straight
  const p2: Pt = { x: corner.x, y: corner.y + sy * rr }; // start of second straight

  // L → Q (rounded corner) → L
  return [
    `M ${fmt(s.x)} ${fmt(s.y)}`,
    `L ${fmt(p1.x)} ${fmt(p1.y)}`,
    `Q ${fmt(corner.x)} ${fmt(corner.y)} ${fmt(p2.x)} ${fmt(p2.y)}`,
    `L ${fmt(t.x)} ${fmt(t.y)}`,
  ].join(" ");
}

export function HorizontalEdge(props: EdgeProps<HorizontalEdge>) {
  const { id, source, target, markerEnd, markerStart, selected, style, data, sourceX, sourceY, targetX, targetY } = props;

  const sNode = useInternalNode(source);
  const tNode = useInternalNode(target);

  const sBox = getNodeBox(sNode);
  const tBox = getNodeBox(tNode);

  // Fallback during first render (before measurement): draw simple line
  if (!sBox || !tBox) {
    const fallback = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    const color = typeof data?.color === "string" && data.color ? data.color : undefined;
    const label = typeof data?.label === "string" ? data.label : "";
    return (
      <>
        <BaseEdge
          id={id}
          path={fallback}
          markerEnd={markerEnd}
          markerStart={markerStart}
          style={{
            ...style,
            ...(color ? { stroke: color } : null),
          }}
          interactionWidth={18}
        />
        <EdgeDeleteControl
          color={color}
          edgeId={id}
          label={label}
          selected={selected}
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2}
        />
      </>
    );
  }

  const gap = data?.gap ?? DEFAULT_GAP;
  const inset = data?.targetAlignInset ?? DEFAULT_INSET;
  const radius = data?.cornerRadius ?? DEFAULT_RADIUS;
  const dashed = !!data?.dashed;
  const color = typeof data?.color === "string" && data.color ? data.color : undefined;
  const label = typeof data?.label === "string" ? data.label : "";

  const sourceSide: SourceSide = data?.sourceSide ?? "bottom";
  const targetAlign: TargetAlign = data?.targetAlign ?? "center";

  const s0 = sourceAnchor(sBox, sourceSide);
  const t0 = targetAnchorTop(tBox, targetAlign, inset, data?.curvePct);

  const s = applyGapSource(s0, sourceSide, gap);
  const t = applyGapTargetTop(t0, gap);

  const edgePath = oneCornerPath(s, t, radius);
  const labelX = (s.x + t.x) / 2;
  const labelY = (s.y + t.y) / 2;

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
        interactionWidth={18}
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
