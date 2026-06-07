import React from "react";
import { BaseEdge, useInternalNode, type Edge, type EdgeProps } from "@xyflow/react";
import { EdgeDeleteControl } from "./EdgeDeleteControl";

export type SourceSide = "left" | "right" | "bottom";
export type TargetAlign = "left" | "center" | "right";

export type RoutedEdgeData = {
  color?: string;
  dashed?: boolean;
  label?: string;

  /** px padding away from nodes at both ends */
  gap?: number;

  /** where the edge exits the source node (no "top") */
  sourceSide?: SourceSide;

  /**
   * Landing position on the arriving node, relative to the arriving side:
   * - If arriving on TOP/BOTTOM: left/center/right maps along WIDTH.
   * - If arriving on LEFT/RIGHT: left/center/right maps along HEIGHT (top/center/bottom).
   */
  targetAlign?: TargetAlign;

  /** inset px for left/right align so it doesn't hug corners */
  targetAlignInset?: number;

  /**
   * 0..1: where the FIRST bend happens along the primary axis:
   * - bottom: controls bendY between sourceY and targetY
   * - left/right: controls bendX between sourceX and targetX
   */
  curvePct?: number;

  /** rounded corner radius in px (applies to both corners) */
  cornerRadius?: number;
};

export type RoutedEdge = Edge<RoutedEdgeData, "routed">;

const DEFAULT_GAP = 12;
const DEFAULT_INSET = 16;
const DEFAULT_RADIUS = 14;
const DEFAULT_CURVE_PCT = 0.5;

type Pt = { x: number; y: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function clamp01(n: number) {
  return clamp(Number.isFinite(n) ? n : DEFAULT_CURVE_PCT, 0, 1);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function getNodeBox(internalNode: any) {
  if (!internalNode) return null;
  const pos = internalNode.internals?.positionAbsolute;
  const w = internalNode.measured?.width ?? internalNode.width ?? 0;
  const h = internalNode.measured?.height ?? internalNode.height ?? 0;
  if (!pos || !w || !h) return null;
  return { x: pos.x, y: pos.y, w, h };
}

/** Center anchor on source side */
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

/**
 * Arriving side is derived (rotated behavior):
 * - bottom exits => arrive TOP
 * - left exits   => arrive LEFT
 * - right exits  => arrive RIGHT
 */
type TargetSide = "top" | "left" | "right";
function targetSideFromSource(sourceSide: SourceSide): TargetSide {
  if (sourceSide === "bottom") return "top";
  if (sourceSide === "left") return "left";
  return "right";
}

/** Landing anchor on the target side, with left/center/right alignment + inset */
function targetAnchor(
  box: { x: number; y: number; w: number; h: number },
  side: TargetSide,
  align: TargetAlign,
  inset: number
): Pt {
  const safeInsetW = clamp(inset, 0, box.w / 2 - 4);
  const safeInsetH = clamp(inset, 0, box.h / 2 - 4);

  if (side === "top") {
    const xLeft = box.x + safeInsetW;
    const xCenter = box.x + box.w / 2;
    const xRight = box.x + box.w - safeInsetW;
    const x = align === "left" ? xLeft : align === "right" ? xRight : xCenter;
    return { x, y: box.y };
  }

  // left/right side: interpret align along HEIGHT (top/center/bottom)
  const yTop = box.y + safeInsetH;
  const yCenter = box.y + box.h / 2;
  const yBottom = box.y + box.h - safeInsetH;
  const y = align === "left" ? yTop : align === "right" ? yBottom : yCenter;

  if (side === "left") return { x: box.x, y };
  return { x: box.x + box.w, y }; // right
}

/** Apply the nice end padding (gap) away from node borders */
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
function applyGapTarget(p: Pt, side: TargetSide, gap: number): Pt {
  switch (side) {
    case "top":
      return { x: p.x, y: p.y - gap };
    case "left":
      return { x: p.x - gap, y: p.y };
    case "right":
      return { x: p.x + gap, y: p.y };
  }
}

/**
 * Build a rounded orthogonal polyline through points.
 * Rounds every interior corner with a quadratic curve.
 */
function buildRoundedPath(points: Pt[], radius: number) {
  const r = Math.max(0, radius);
  if (points.length < 2) return "";

  const fmt = (n: number) => Number(n.toFixed(2));

  // remove exact duplicates
  const pts: Pt[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);
  }
  if (pts.length < 2) return "";

  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;

  for (let i = 1; i < pts.length; i++) {
    const curr = pts[i];

    // last point: straight
    if (i === pts.length - 1) {
      d += ` L ${fmt(curr.x)} ${fmt(curr.y)}`;
      continue;
    }

    const prev = pts[i - 1];
    const next = pts[i + 1];

    const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const len2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    const rr = Math.min(r, len1 / 2, len2 / 2);

    const v1 = { x: Math.sign(curr.x - prev.x), y: Math.sign(curr.y - prev.y) };
    const v2 = { x: Math.sign(next.x - curr.x), y: Math.sign(next.y - curr.y) };

    const pA = { x: curr.x - v1.x * rr, y: curr.y - v1.y * rr };
    const pB = { x: curr.x + v2.x * rr, y: curr.y + v2.y * rr };

    d += ` L ${fmt(pA.x)} ${fmt(pA.y)} Q ${fmt(curr.x)} ${fmt(curr.y)} ${fmt(pB.x)} ${fmt(pB.y)}`;
  }

  return d;
}

export function RoutedEdge(props: EdgeProps<RoutedEdge>) {
  const {
    id,
    source,
    target,
    markerEnd,
    markerStart,
    selected,
    style,
    data,
    sourceX,
    sourceY,
    targetX,
    targetY,
  } = props;

  const sNode = useInternalNode(source);
  const tNode = useInternalNode(target);

  const sBox = getNodeBox(sNode);
  const tBox = getNodeBox(tNode);

  // fallback while measuring
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
  const curvePct = clamp01(data?.curvePct ?? DEFAULT_CURVE_PCT);

  const dashed = !!data?.dashed;
  const color = typeof data?.color === "string" && data.color ? data.color : undefined;
  const label = typeof data?.label === "string" ? data.label : "";

  const sourceSide: SourceSide = data?.sourceSide ?? "bottom";
  const targetSide = targetSideFromSource(sourceSide);

  const targetAlign: TargetAlign = data?.targetAlign ?? "center";

  const s0 = applyGapSource(sourceAnchor(sBox, sourceSide), sourceSide, gap);
  const t0 = applyGapTarget(targetAnchor(tBox, targetSide, targetAlign, inset), targetSide, gap);

  // Choose bend coordinate (the FIRST bend) based on curvePct along primary axis:
  // bottom => bendY between s.y and t.y
  // left/right => bendX between s.x and t.x
  const minBend = 18; // keep room for corners

  let points: Pt[];

  if (sourceSide === "bottom") {
    // vertical -> horizontal -> vertical (arrive top)
    let bendY = lerp(s0.y, t0.y, curvePct);
    const lo = Math.min(s0.y, t0.y) + minBend;
    const hi = Math.max(s0.y, t0.y) - minBend;
    if (hi > lo) bendY = clamp(bendY, lo, hi);

    points = [
      s0,
      { x: s0.x, y: bendY },
      { x: t0.x, y: bendY },
      t0,
    ];
  } else {
    // left/right: horizontal -> vertical -> horizontal (arrive left/right)
    let bendX = lerp(s0.x, t0.x, curvePct);
    const lo = Math.min(s0.x, t0.x) + minBend;
    const hi = Math.max(s0.x, t0.x) - minBend;
    if (hi > lo) bendX = clamp(bendX, lo, hi);

    points = [
      s0,
      { x: bendX, y: s0.y },
      { x: bendX, y: t0.y },
      t0,
    ];
  }

  const edgePath = buildRoundedPath(points, radius);
  const middlePoint = points[Math.floor(points.length / 2)];

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
        x={middlePoint.x}
        y={middlePoint.y}
      />
    </>
  );
}
