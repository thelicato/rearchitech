import { type ChangeEvent, useCallback, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  NodeToolbar,
  Position,
  ReactFlow,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";

import "@xyflow/react/dist/base.css";

import { BoxNode } from "./nodes/BoxNode";
import { DiamondNode } from "./nodes/DiamondNode";
import { GroupNode } from "./nodes/GroupNode";
import { TextNode } from "./nodes/TextNode";
import { HorizontalEdge } from "./edges/HorizontalEdge";
import { PaddedSmoothStepEdge } from "./edges/PaddedSmoothStepEdge";
import { RoutedEdge } from "./edges/RoutedEdge";
import type { AppNode, BoxNodeData } from "./types";

type ToolboxNodeType = AppNode["type"];
type BoxVariant = NonNullable<BoxNodeData["variant"]>;
type GroupTitlePlacement = "inside" | "outside";
type GroupTitlePosition =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "top-left"
  | "top-right";

type ToolboxItem = {
  label: string;
  type: ToolboxNodeType;
  icon: string;
  data: () => AppNode["data"];
  height?: number;
  width?: number;
  zIndex?: number;
};

type FlowFile = {
  version?: number;
  nodes?: unknown;
  edges?: unknown;
};

const nodeKinds = new Set<ToolboxNodeType>(["box", "diamond", "group", "text"]);
const edgeKinds = new Set(["padded", "horizontal", "routed"]);
const boxVariants = new Set<BoxVariant>(["default", "dark", "green", "red"]);
const titleAlignments = new Set(["left", "center"]);
const groupTitlePlacements = new Set<GroupTitlePlacement>(["inside", "outside"]);
const groupTitlePositions = new Set<GroupTitlePosition>([
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "top-center",
  "top-left",
  "top-right",
]);
const legacyGroupTitlePositions: Record<string, GroupTitlePosition> = {
  bottom: "bottom-center",
  left: "top-left",
  right: "top-right",
  top: "top-center",
};
const groupColors = ["#2f6f8f", "#15c1a3", "#7c3aed", "#dd4a21", "#f2c94c", "#111827"];
const edgeRoutes = [
  { label: "Padded", value: "padded" },
  { label: "Horizontal", value: "horizontal" },
  { label: "Routed", value: "routed" },
];
const EXPORT_PADDING = 48;
const DRAWIO_PADDING = 180;
const MIN_EXPORT_WIDTH = 640;
const MIN_EXPORT_HEIGHT = 360;
const DRAWIO_BACKGROUND_COLOR = "#0f1116";
const DRAWIO_ROOT_ID = "1";
const SELECTION_KEY_CODE = "Shift";

const toolboxItems: ToolboxItem[] = [
  {
    label: "Box",
    type: "box",
    icon: "box",
    data: () => ({
      title: "New box",
      content: "Add details",
      variant: "default",
    }),
  },
  {
    label: "Decision",
    type: "diamond",
    icon: "diamond",
    data: () => ({ label: "Yes?" }),
  },
  {
    label: "Group",
    type: "group",
    icon: "group",
    width: 420,
    height: 260,
    zIndex: -1,
    data: () => ({
      color: "#2f6f8f",
      title: "Group",
      titlePlacement: "inside",
      titlePosition: "top-center",
    }),
  },
  {
    label: "Text",
    type: "text",
    icon: "text",
    data: () => ({
      color: "#f5f7fb",
      fontSize: "16",
      text: "Text",
    }),
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toText = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

const toColorInput = (value: unknown, fallback: string) => {
  const color = toText(value, fallback);
  return isHexColor(color) ? color : fallback;
};

const normalizeGroupTitlePlacement = (value: unknown): GroupTitlePlacement => {
  const placement = toText(value, "inside");
  return groupTitlePlacements.has(placement as GroupTitlePlacement)
    ? (placement as GroupTitlePlacement)
    : "inside";
};

const normalizeGroupTitlePosition = (
  value: unknown,
  legacySide: unknown = "top",
): GroupTitlePosition => {
  const position = toText(value);
  if (groupTitlePositions.has(position as GroupTitlePosition)) {
    return position as GroupTitlePosition;
  }

  return legacyGroupTitlePositions[toText(legacySide, "top")] ?? "top-center";
};

const createEdgeMarker = (color = "var(--edge-marker)") => ({
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
  color,
});

type NodeExportLayout = {
  height: number;
  node: AppNode;
  width: number;
};

type ExportBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const defaultNodeSizes: Record<ToolboxNodeType, { height: number; width: number }> = {
  box: { height: 88, width: 236 },
  diamond: { height: 50, width: 50 },
  group: { height: 260, width: 420 },
  text: { height: 32, width: 140 },
};

const variantDrawioColors: Record<BoxVariant, { fill: string; font: string; stroke: string }> = {
  default: { fill: "#4b5c6b", font: "#f5f7fb", stroke: "#687987" },
  dark: { fill: "#1f2028", font: "#f5f7fb", stroke: "#4c4f5e" },
  green: { fill: "#15c1a3", font: "#ffffff", stroke: "#0c806c" },
  red: { fill: "#dd4a21", font: "#ffffff", stroke: "#9f3216" },
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const formatNumber = (value: number) => `${Number(value.toFixed(2))}`;

const SVG_FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const escapeHtml = (value: string) => escapeXml(value).replaceAll("\n", "<br>");

const toDrawioColor = (value: unknown, fallback: string) => {
  const color = toText(value, fallback);
  return isHexColor(color) ? color : fallback;
};

const toSvgColor = (value: string, fallback: string) => {
  if (isHexColor(value)) return value;

  const rgb = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) return fallback;

  return `#${[rgb[1], rgb[2], rgb[3]]
    .map((channel) => Number.parseInt(channel, 10).toString(16).padStart(2, "0"))
    .join("")}`;
};

const hexToRgb = (hex: string) => {
  const normalized = toDrawioColor(hex, "#000000").slice(1);
  return {
    b: Number.parseInt(normalized.slice(4, 6), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    r: Number.parseInt(normalized.slice(0, 2), 16),
  };
};

const toHex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

const mixColor = (hex: string, target: "#000000" | "#ffffff", amount: number) => {
  const color = hexToRgb(hex);
  const targetColor = hexToRgb(target);

  return `#${toHex(color.r + (targetColor.r - color.r) * amount)}${toHex(
    color.g + (targetColor.g - color.g) * amount,
  )}${toHex(color.b + (targetColor.b - color.b) * amount)}`;
};

const getRelativeLuminance = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const getGroupBorderColor = (color: string) =>
  getRelativeLuminance(color) < 0.42
    ? mixColor(color, "#ffffff", 0.45)
    : mixColor(color, "#000000", 0.35);

const getBoxDrawioColors = (data: BoxNodeData) => {
  if (data.useCustomColors === true) {
    return {
      fill: toDrawioColor(data.backgroundColor, "#4b5c6b"),
      font: toDrawioColor(data.textColor, "#ffffff"),
      stroke: toDrawioColor(data.borderColor, "#ffffff"),
    };
  }

  return variantDrawioColors[data.variant ?? "default"];
};

const getGroupTitleLayout = ({
  height,
  placement,
  position,
  title,
  width,
  x,
  y,
}: {
  height: number;
  placement: GroupTitlePlacement;
  position: GroupTitlePosition;
  title: string;
  width: number;
  x: number;
  y: number;
}) => {
  const titleWidth = Math.min(280, Math.max(56, title.length * 7 + 18));
  const titleHeight = 22;
  const [vertical, horizontal] = position.split("-") as [
    "bottom" | "top",
    "center" | "left" | "right",
  ];
  let titleX = x + 8;

  if (horizontal === "center") {
    titleX = x + width / 2 - titleWidth / 2;
  }

  if (horizontal === "right") {
    titleX = x + width - titleWidth - 8;
  }

  const titleY =
    vertical === "top"
      ? placement === "inside"
        ? y + 8
        : y - titleHeight - 8
      : placement === "inside"
        ? y + height - titleHeight - 8
        : y + height + 8;

  return {
    height: titleHeight,
    width: titleWidth,
    x: titleX,
    y: titleY,
  };
};

const getNodeExportSize = (node: AppNode, element?: HTMLElement | null) => {
  const measured = (node as AppNode & { measured?: { height?: number; width?: number } }).measured;
  const fallback = defaultNodeSizes[node.type];

  return {
    height:
      (element && element.offsetHeight) ||
      (isPositiveNumber(node.height) ? node.height : undefined) ||
      measured?.height ||
      fallback.height,
    width:
      (element && element.offsetWidth) ||
      (isPositiveNumber(node.width) ? node.width : undefined) ||
      measured?.width ||
      fallback.width,
  };
};

const getExportBounds = (layouts: NodeExportLayout[]) => {
  const first = layouts[0];
  if (!first) return { height: 0, width: 0, x: 0, y: 0 };

  const minX = Math.min(...layouts.map((layout) => layout.node.position.x));
  const minY = Math.min(...layouts.map((layout) => layout.node.position.y));
  const maxX = Math.max(...layouts.map((layout) => layout.node.position.x + layout.width));
  const maxY = Math.max(...layouts.map((layout) => layout.node.position.y + layout.height));

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
};

const wrapSvgText = (value: string, maxChars: number) =>
  value
    .split("\n")
    .flatMap((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [""];

      const lines: string[] = [];
      let current = "";

      words.forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars && current) {
          lines.push(current);
          current = word;
        } else {
          current = next;
        }
      });

      if (current) lines.push(current);
      return lines;
    });

const getSvgText = ({
  anchor = "start",
  fill,
  fontSize,
  fontWeight = 600,
  lineHeight,
  lines,
  x,
  y,
}: {
  anchor?: "middle" | "start";
  fill: string;
  fontSize: number;
  fontWeight?: number;
  lineHeight: number;
  lines: string[];
  x: number;
  y: number;
}) => {
  if (lines.length === 0) return "";

  return [
    `<text x="${formatNumber(x)}" y="${formatNumber(y)}" fill="${fill}" font-family="${SVG_FONT_STACK}" font-size="${fontSize}" font-weight="${fontWeight}" text-anchor="${anchor}">`,
    lines
      .map(
        (line, index) =>
          `<tspan x="${formatNumber(x)}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(
            line,
          )}</tspan>`,
      )
      .join(""),
    "</text>",
  ].join("");
};

const getSvgNodeOrigin = (layout: NodeExportLayout, bounds: ExportBounds) => ({
  x: layout.node.position.x - bounds.x + EXPORT_PADDING,
  y: layout.node.position.y - bounds.y + EXPORT_PADDING,
});

const getSvgMarkerId = (edgeId: string) => `arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const getEdgeColor = (edge?: Edge) => {
  const data = isRecord(edge?.data) ? edge.data : {};
  const color = toText(data.color);
  return isHexColor(color) ? color : "#4b5c6b";
};

const getSvgEdges = (
  flowElement: HTMLElement,
  bounds: ExportBounds,
  edges: Edge[],
) => {
  const edgeGroups = Array.from(flowElement.querySelectorAll<SVGGElement>(".react-flow__edge"));
  if (edgeGroups.length === 0) return { defs: "", paths: "" };

  const offsetX = EXPORT_PADDING - bounds.x;
  const offsetY = EXPORT_PADDING - bounds.y;
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const defs: string[] = [];
  const paths: string[] = [];

  edgeGroups.forEach((edgeGroup) => {
    const edgeId = edgeGroup.dataset.id ?? "";
    const edge = edgeById.get(edgeId);
    const path = edgeGroup.querySelector<SVGPathElement>("path.react-flow__edge-path");
    const d = path?.getAttribute("d");
    if (!edge || !d) return;

    const color = getEdgeColor(edge);
    const data = isRecord(edge.data) ? edge.data : {};
    const markerId = getSvgMarkerId(edge.id);
    const dashed = data.dashed === true ? ' stroke-dasharray="7 7"' : "";

    defs.push(
      `<marker id="${markerId}" markerWidth="18" markerHeight="18" viewBox="-10 -10 20 20" refX="0" refY="0" orient="auto" markerUnits="strokeWidth"><path d="M -6 -5 L 6 0 L -6 5 z" fill="${color}"/></marker>`,
    );
    paths.push(
      `<path d="${escapeXml(d)}" transform="translate(${formatNumber(offsetX)} ${formatNumber(
        offsetY,
      )})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${dashed} marker-end="url(#${markerId})"/>`,
    );
  });

  return {
    defs: defs.join(""),
    paths: paths.join(""),
  };
};

const getSvgEdgeLabels = (
  flowElement: HTMLElement,
  bounds: ExportBounds,
) => {
  const labels = Array.from(
    flowElement.querySelectorAll<HTMLElement>(".react-flow__edgelabel-renderer .edgeOverlay"),
  );
  if (labels.length === 0) return "";

  return labels
    .map((label) => {
      const text = label.querySelector<HTMLElement>(".edgeTextLabel")?.innerText.trim();
      if (!text) return "";

      const transform = label.style.transform;
      const matches = Array.from(transform.matchAll(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/g));
      const lastMatch = matches[matches.length - 1];
      if (!lastMatch) return "";

      const x = Number.parseFloat(lastMatch[1]) + EXPORT_PADDING - bounds.x;
      const y = Number.parseFloat(lastMatch[2]) + EXPORT_PADDING - bounds.y;
      const color = toSvgColor(label.style.color, "#4b5c6b");
      const lines = wrapSvgText(text, 28);
      const labelWidth = Math.min(
        220,
        Math.max(34, Math.max(...lines.map((line) => line.length)) * 6.2 + 16),
      );
      const labelHeight = Math.max(20, lines.length * 13 + 7);
      const textStartY = y - ((lines.length - 1) * 13) / 2 + 3.5;

      return [
        `<g>`,
        `<rect x="${formatNumber(x - labelWidth / 2)}" y="${formatNumber(
          y - labelHeight / 2,
        )}" width="${formatNumber(labelWidth)}" height="${formatNumber(
          labelHeight,
        )}" rx="${formatNumber(labelHeight / 2)}" fill="${DRAWIO_BACKGROUND_COLOR}" fill-opacity="0.88" stroke="#ffffff" stroke-opacity="0.14"/>`,
        getSvgText({
          anchor: "middle",
          fill: color,
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 13,
          lines,
          x,
          y: textStartY,
        }),
        `</g>`,
      ].join("");
    })
    .join("");
};

const getSvgGroupTitle = (layout: NodeExportLayout, bounds: ExportBounds) => {
  if (layout.node.type !== "group") return "";

  const title = toText(layout.node.data.title).trim();
  if (!title) return "";

  const { x, y } = getSvgNodeOrigin(layout, bounds);
  const color = toDrawioColor(layout.node.data.color, "#2f6f8f");
  const borderColor = getGroupBorderColor(color);
  const titleColor = getRelativeLuminance(color) < 0.42 ? "#ffffff" : "#111827";
  const placement = normalizeGroupTitlePlacement(layout.node.data.titlePlacement);
  const position = normalizeGroupTitlePosition(
    layout.node.data.titlePosition,
    layout.node.data.titleSide,
  );
  const titleLayout = getGroupTitleLayout({
    height: layout.height,
    placement,
    position,
    title,
    width: layout.width,
    x,
    y,
  });

  return [
    `<g>`,
    `<rect x="${formatNumber(titleLayout.x)}" y="${formatNumber(
      titleLayout.y,
    )}" width="${formatNumber(titleLayout.width)}" height="${formatNumber(
      titleLayout.height,
    )}" rx="6" fill="${color}" fill-opacity="0.93" stroke="${borderColor}"/>`,
    getSvgText({
      anchor: "middle",
      fill: titleColor,
      fontSize: 11,
      fontWeight: 850,
      lineHeight: 13,
      lines: [title],
      x: titleLayout.x + titleLayout.width / 2,
      y: titleLayout.y + 14,
    }),
    "</g>",
  ].join("");
};

const getSvgBoxNode = (layout: NodeExportLayout, bounds: ExportBounds) => {
  if (layout.node.type !== "box") return "";

  const { x, y } = getSvgNodeOrigin(layout, bounds);
  const { width, height } = layout;
  const colors = getBoxDrawioColors(layout.node.data);
  const title = toText(layout.node.data.title);
  const subtitle = toText(layout.node.data.subtitle);
  const content = toText(layout.node.data.content);
  const imageUrl = toText(layout.node.data.imageUrl);
  const isCentered = layout.node.data.titleAlign === "center";
  const textX = isCentered ? x + width / 2 : x + 12;
  const anchor = isCentered ? "middle" : "start";
  const maxChars = Math.max(8, Math.floor((width - 24) / 7));
  const parts = [
    `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(
      width,
    )}" height="${formatNumber(
      height,
    )}" rx="10" fill="${colors.fill}" stroke="${colors.stroke}" filter="url(#nodeShadow)"/>`,
  ];
  let cursorY = y + 19;

  if (title) {
    const titleLines = wrapSvgText(title, maxChars);
    parts.push(
      getSvgText({
        anchor,
        fill: colors.font,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 15,
        lines: titleLines,
        x: textX,
        y: cursorY,
      }),
    );
    cursorY += titleLines.length * 15 + 2;
  }

  if (imageUrl) {
    const imageX = x + 12;
    const imageWidth = width - 24;
    const imageHeight = Math.min(150, Math.max(38, height * 0.34));

    if (layout.node.data.imageHasBackground !== false) {
      parts.push(
        `<rect x="${formatNumber(imageX)}" y="${formatNumber(
          cursorY,
        )}" width="${formatNumber(imageWidth)}" height="${formatNumber(
          imageHeight,
        )}" rx="8" fill="#000000" fill-opacity="0.16"/>`,
      );
    }
    parts.push(
      `<image href="${escapeXml(imageUrl)}" x="${formatNumber(imageX)}" y="${formatNumber(
        cursorY,
      )}" width="${formatNumber(imageWidth)}" height="${formatNumber(
        imageHeight,
      )}" preserveAspectRatio="xMidYMid meet"/>`,
    );
    cursorY += imageHeight + 10;
  }

  if (subtitle) {
    const subtitleLines = wrapSvgText(subtitle, maxChars);
    parts.push(
      getSvgText({
        fill: colors.font,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 13,
        lines: subtitleLines,
        x: x + 12,
        y: cursorY,
      }),
    );
    cursorY += subtitleLines.length * 13 + 4;
  }

  if (content) {
    const contentLines = wrapSvgText(content, maxChars);
    parts.push(
      getSvgText({
        fill: colors.font,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 15,
        lines: contentLines,
        x: x + 12,
        y: cursorY,
      }),
    );
  }

  return `<g>${parts.join("")}</g>`;
};

const getSvgDiamondNode = (layout: NodeExportLayout, bounds: ExportBounds) => {
  if (layout.node.type !== "diamond") return "";

  const { x, y } = getSvgNodeOrigin(layout, bounds);
  const size = Math.min(layout.width, layout.height);
  const cx = x + layout.width / 2;
  const cy = y + layout.height / 2;
  const lines = wrapSvgText(toText(layout.node.data.label), 8);

  return [
    `<g>`,
    `<rect x="${formatNumber(cx - size / 2)}" y="${formatNumber(
      cy - size / 2,
    )}" width="${formatNumber(size)}" height="${formatNumber(
      size,
    )}" rx="12" fill="#4b5c6b" stroke="#687987" transform="rotate(45 ${formatNumber(
      cx,
    )} ${formatNumber(cy)})" filter="url(#nodeShadow)"/>`,
    getSvgText({
      anchor: "middle",
      fill: "#f5f7fb",
      fontSize: 11,
      fontWeight: 800,
      lineHeight: 12,
      lines,
      x: cx,
      y: cy - ((lines.length - 1) * 12) / 2 + 4,
    }),
    `</g>`,
  ].join("");
};

const getSvgGroupNode = (layout: NodeExportLayout, bounds: ExportBounds) => {
  if (layout.node.type !== "group") return "";

  const { x, y } = getSvgNodeOrigin(layout, bounds);
  const color = toDrawioColor(layout.node.data.color, "#2f6f8f");
  const borderColor = getGroupBorderColor(color);

  return [
    `<g>`,
    `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(
      layout.width,
    )}" height="${formatNumber(
      layout.height,
    )}" rx="8" fill="${color}" fill-opacity="0.2" stroke="${borderColor}" stroke-width="2"/>`,
    getSvgGroupTitle(layout, bounds),
    `</g>`,
  ].join("");
};

const getSvgTextNode = (layout: NodeExportLayout, bounds: ExportBounds) => {
  if (layout.node.type !== "text") return "";

  const { x, y } = getSvgNodeOrigin(layout, bounds);
  const fontSize = Number.parseInt(toText(layout.node.data.fontSize, "16"), 10) || 16;
  const color = toDrawioColor(layout.node.data.color, "#f5f7fb");
  const lines = wrapSvgText(toText(layout.node.data.text, "Text"), Math.max(8, Math.floor(layout.width / 8)));

  return getSvgText({
    fill: color,
    fontSize,
    fontWeight: 750,
    lineHeight: Math.ceil(fontSize * 1.22),
    lines,
    x: x + 6,
    y: y + fontSize,
  });
};

const getSvgNode = (layout: NodeExportLayout, bounds: ExportBounds) => {
  if (layout.node.type === "box") return getSvgBoxNode(layout, bounds);
  if (layout.node.type === "diamond") return getSvgDiamondNode(layout, bounds);
  if (layout.node.type === "group") return getSvgGroupNode(layout, bounds);
  return getSvgTextNode(layout, bounds);
};

const buildPortableSvg = (
  layouts: NodeExportLayout[],
  edges: Edge[],
  flowElement: HTMLElement,
  backgroundColor: string,
) => {
  const bounds = getExportBounds(layouts);
  const width = Math.ceil(Math.max(bounds.width + EXPORT_PADDING * 2, MIN_EXPORT_WIDTH));
  const height = Math.ceil(Math.max(bounds.height + EXPORT_PADDING * 2, MIN_EXPORT_HEIGHT));
  const svgEdges = getSvgEdges(flowElement, bounds, edges);
  const edgeLabels = getSvgEdgeLabels(flowElement, bounds);
  const nodeMarkup = [...layouts]
    .sort((a, b) => (a.node.zIndex ?? 0) - (b.node.zIndex ?? 0))
    .map((layout) => getSvgNode(layout, bounds))
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000000" flood-opacity="0.35"/></filter>${svgEdges.defs}</defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundColor}"/>`,
    `<g id="edges">${svgEdges.paths}</g>`,
    `<g id="nodes">${nodeMarkup}</g>`,
    edgeLabels ? `<g id="edge-labels">${edgeLabels}</g>` : "",
    `</svg>`,
  ].join("");
};

const sanitizeNodeData = (type: ToolboxNodeType, data: unknown): AppNode["data"] => {
  const safeData = isRecord(data) ? data : {};

  if (type === "group") {
    const color = toText(safeData.color, "#2f6f8f");

    return {
      color: isHexColor(color) ? color : "#2f6f8f",
      title: toText(safeData.title, "Group"),
      titlePlacement: normalizeGroupTitlePlacement(safeData.titlePlacement),
      titlePosition: normalizeGroupTitlePosition(safeData.titlePosition, safeData.titleSide),
    };
  }

  if (type === "text") {
    const color = toText(safeData.color, "#f5f7fb");
    const fontSize = toText(safeData.fontSize, "16");

    return {
      color: isHexColor(color) ? color : "#f5f7fb",
      fontSize,
      text: toText(safeData.text, "Text"),
    };
  }

  if (type === "diamond") {
    return { label: toText(safeData.label, "Decision") };
  }

  const variant = toText(safeData.variant, "default");
  const titleAlign = toText(safeData.titleAlign, "left");

  return {
    title: toText(safeData.title, "Box"),
    subtitle: toText(safeData.subtitle),
    content: toText(safeData.content, "Add details"),
    backgroundColor: toText(safeData.backgroundColor, "#4b5c6b"),
    borderColor: toText(safeData.borderColor, "rgba(255,255,255,0.12)"),
    imageUrl: toText(safeData.imageUrl),
    imageAlt: toText(safeData.imageAlt),
    imageHasBackground: toBoolean(safeData.imageHasBackground, true),
    textColor: toText(safeData.textColor, "#ffffff"),
    titleAlign: titleAlignments.has(titleAlign) ? (titleAlign as "left" | "center") : "left",
    useCustomColors: toBoolean(safeData.useCustomColors, false),
    variant: boxVariants.has(variant as BoxVariant) ? (variant as BoxVariant) : "default",
  };
};

const sanitizeNodes = (nodes: unknown): AppNode[] => {
  if (!Array.isArray(nodes)) return [];

  return nodes.flatMap((node, index) => {
    if (!isRecord(node)) return [];

    const type = toText(node.type) as ToolboxNodeType;
    if (!nodeKinds.has(type)) return [];

    const position = isRecord(node.position) ? node.position : {};
    const x = typeof position.x === "number" ? position.x : 160 + index * 24;
    const y = typeof position.y === "number" ? position.y : 120 + index * 24;
    const width = typeof node.width === "number" ? node.width : type === "group" ? 420 : undefined;
    const height = typeof node.height === "number" ? node.height : type === "group" ? 260 : undefined;
    const zIndex = typeof node.zIndex === "number" ? node.zIndex : type === "group" ? -1 : undefined;

    return [
      {
        id: toText(node.id, `node-${index + 1}`),
        type,
        position: { x, y },
        data: sanitizeNodeData(type, node.data),
        ...(width ? { width } : null),
        ...(height ? { height } : null),
        ...(typeof zIndex === "number" ? { zIndex } : null),
      } as AppNode,
    ];
  });
};

const sanitizeEdges = (edges: unknown, nodes: AppNode[]): Edge[] => {
  if (!Array.isArray(edges)) return [];

  const nodeIds = new Set(nodes.map((node) => node.id));

  return edges.flatMap((edge, index) => {
    if (!isRecord(edge)) return [];

    const source = toText(edge.source);
    const target = toText(edge.target);
    if (!nodeIds.has(source) || !nodeIds.has(target)) return [];

    const type = toText(edge.type, "padded");
    const data = isRecord(edge.data) ? edge.data : {};
    const color = toText(data.color);
    const safeColor = isHexColor(color) ? color : "";
    const sanitizedData = {
      ...data,
      color: safeColor,
      dashed: toBoolean(data.dashed, false),
      label: toText(data.label),
    };

    return [
      {
        id: toText(edge.id, `edge-${index + 1}`),
        source,
        target,
        type: edgeKinds.has(type) ? type : "padded",
        data: sanitizedData,
        ...(safeColor
          ? {
              markerEnd: createEdgeMarker(safeColor),
              style: { stroke: safeColor, strokeWidth: 2 },
            }
          : null),
      },
    ];
  });
};

type DrawioGeometry = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const parseDrawioStyle = (style: string) =>
  style.split(";").reduce<Record<string, string>>((styles, part) => {
    if (!part) return styles;

    const [key, ...valueParts] = part.split("=");
    if (!key) return styles;

    styles[key] = valueParts.length > 0 ? valueParts.join("=") : "1";
    return styles;
  }, {});

const parseNumber = (value: string | null, fallback: number) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getDirectChild = (element: Element, tagName: string) =>
  Array.from(element.children).find((child) => child.tagName === tagName) ?? null;

const getDrawioGeometry = (cell: Element, fallback: DrawioGeometry): DrawioGeometry => {
  const geometry = getDirectChild(cell, "mxGeometry");

  return {
    height: parseNumber(geometry?.getAttribute("height") ?? null, fallback.height),
    width: parseNumber(geometry?.getAttribute("width") ?? null, fallback.width),
    x: parseNumber(geometry?.getAttribute("x") ?? null, fallback.x),
    y: parseNumber(geometry?.getAttribute("y") ?? null, fallback.y),
  };
};

const toImportedId = (prefix: string, rawId: string, index: number, usedIds: Set<string>) => {
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const baseId = `${prefix}-${safeId || index + 1}`;
  let id = baseId;
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(id);
  return id;
};

const getDrawioStyleColor = (
  styles: Record<string, string>,
  key: string,
  fallback: string,
) => {
  const color = styles[key];
  return color && color !== "none" ? toDrawioColor(color, fallback) : fallback;
};

const getDrawioLabelInfo = (value: string) => {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = value.replace(/<br\s*\/?>/gi, "\n");

  const image = wrapper.querySelector("img");
  const blocks = Array.from(wrapper.querySelectorAll("div"))
    .filter((element) => !element.querySelector("img"))
    .map((element) => element.textContent?.replace(/\u00a0/g, " ").trim() ?? "")
    .filter(Boolean);
  const text = (wrapper.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  const lines = blocks.length > 0 ? blocks : text.split("\n").filter(Boolean);
  const firstBlock = wrapper.querySelector("div");

  return {
    imageUrl: image?.getAttribute("src") ?? "",
    lines,
    text,
    titleAlign: firstBlock?.style.textAlign === "center" ? "center" : "left",
  };
};

const parseXmlDocument = (contents: string) => {
  const document = new DOMParser().parseFromString(contents, "text/xml");
  return document.querySelector("parsererror") ? null : document;
};

const decodeDrawioDiagramContents = async (contents: string) => {
  const trimmed = contents.trim();
  if (!trimmed || trimmed.includes("<mxGraphModel")) return trimmed;

  const DecompressionStreamCtor = globalThis.DecompressionStream;
  if (!DecompressionStreamCtor) return "";

  try {
    const binary = globalThis.atob(trimmed);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

    for (const format of ["deflate-raw", "deflate"]) {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(
          new DecompressionStreamCtor(format as CompressionFormat),
        );
        const inflated = await new Response(stream).text();

        try {
          return decodeURIComponent(inflated);
        } catch {
          return inflated;
        }
      } catch {
        // Try the next deflate flavor.
      }
    }
  } catch {
    return "";
  }

  return "";
};

const getDrawioModelDocument = async (contents: string) => {
  const directDocument = parseXmlDocument(contents);
  if (directDocument?.querySelector("mxGraphModel")) return directDocument;

  const diagrams = Array.from(directDocument?.querySelectorAll("diagram") ?? []);
  for (const diagram of diagrams) {
    const decoded = await decodeDrawioDiagramContents(diagram.textContent ?? "");
    if (!decoded) continue;

    const diagramDocument = parseXmlDocument(decoded);
    if (diagramDocument?.querySelector("mxGraphModel")) return diagramDocument;
  }

  return null;
};

const inferDrawioNodeType = (
  cell: Element,
  styles: Record<string, string>,
): ToolboxNodeType => {
  const style = cell.getAttribute("style") ?? "";

  if (styles.container === "1") return "group";
  if (styles.shape === "rhombus" || style.split(";").includes("rhombus")) return "diamond";
  if (styles.shape === "text" || style.split(";").includes("text")) return "text";
  if (styles.fillColor === "none" && styles.strokeColor === "none") return "text";

  return "box";
};

const getGroupTitlePositionFromGeometry = (
  nodeGeometry: DrawioGeometry,
  titleGeometry?: DrawioGeometry,
) => {
  if (!titleGeometry) {
    return {
      titlePlacement: "inside" as const,
      titlePosition: "top-center" as const,
    };
  }

  const titleCenterX = titleGeometry.x + titleGeometry.width / 2;
  const horizontal =
    titleCenterX < nodeGeometry.x + nodeGeometry.width / 3
      ? "left"
      : titleCenterX > nodeGeometry.x + (nodeGeometry.width * 2) / 3
        ? "right"
        : "center";
  const vertical =
    titleGeometry.y + titleGeometry.height / 2 < nodeGeometry.y + nodeGeometry.height / 2
      ? "top"
      : "bottom";
  const titlePlacement =
    titleGeometry.y < nodeGeometry.y || titleGeometry.y >= nodeGeometry.y + nodeGeometry.height
      ? "outside"
      : "inside";

  return {
    titlePlacement,
    titlePosition: `${vertical}-${horizontal}` as GroupTitlePosition,
  };
};

const isDrawioBackgroundCell = (id: string, styles: Record<string, string>) =>
  id === "background" ||
  (styles.locked === "1" &&
    styles.movable === "0" &&
    styles.resizable === "0" &&
    styles.deletable === "0");

const parseDrawioFile = async (contents: string) => {
  const document = await getDrawioModelDocument(contents);
  const model = document?.querySelector("mxGraphModel");
  if (!model) return { edges: [], nodes: [] };

  const cells = Array.from(model.querySelectorAll("mxCell"));
  const cellByDrawioId = new Map(
    cells.map((cell) => [cell.getAttribute("id") ?? "", cell]).filter(([id]) => id),
  );
  const absoluteGeometryByDrawioId = new Map<string, DrawioGeometry>();
  const getAbsoluteDrawioGeometry = (
    cell: Element,
    fallback: DrawioGeometry,
    seenIds = new Set<string>(),
  ): DrawioGeometry => {
    const id = cell.getAttribute("id") ?? "";
    const cached = absoluteGeometryByDrawioId.get(id);
    if (cached) return cached;

    const geometry = getDrawioGeometry(cell, fallback);
    const parentId = cell.getAttribute("parent") ?? "";
    const parent = cellByDrawioId.get(parentId);

    if (parent?.getAttribute("vertex") === "1" && !seenIds.has(parentId)) {
      const parentGeometry = getAbsoluteDrawioGeometry(
        parent,
        { height: 0, width: 0, x: 0, y: 0 },
        new Set([...seenIds, id]),
      );
      geometry.x += parentGeometry.x;
      geometry.y += parentGeometry.y;
    }

    absoluteGeometryByDrawioId.set(id, geometry);
    return geometry;
  };
  const vertexCells = cells.filter((cell) => cell.getAttribute("vertex") === "1");
  const vertexIds = new Set(vertexCells.map((cell) => cell.getAttribute("id") ?? ""));
  const titleByDrawioId = new Map<string, { geometry: DrawioGeometry; title: string }>();

  vertexCells.forEach((cell) => {
    const id = cell.getAttribute("id") ?? "";
    if (!id.endsWith("-title")) return;

    const parentId = id.slice(0, -"-title".length);
    if (!vertexIds.has(parentId)) return;

    titleByDrawioId.set(parentId, {
      geometry: getAbsoluteDrawioGeometry(cell, { height: 22, width: 120, x: 0, y: 0 }),
      title: getDrawioLabelInfo(cell.getAttribute("value") ?? "").text,
    });
  });

  const nodeRecords = vertexCells.flatMap((cell, index) => {
    const drawioId = cell.getAttribute("id") ?? `cell-${index + 1}`;
    const styles = parseDrawioStyle(cell.getAttribute("style") ?? "");
    const titleParentId = drawioId.endsWith("-title")
      ? drawioId.slice(0, -"-title".length)
      : "";

    if (isDrawioBackgroundCell(drawioId, styles)) return [];
    if (titleParentId && vertexIds.has(titleParentId)) return [];

    const type = inferDrawioNodeType(cell, styles);
    const fallbackSize = defaultNodeSizes[type];
    const geometry = getAbsoluteDrawioGeometry(cell, {
      height: fallbackSize.height,
      width: fallbackSize.width,
      x: 160 + index * 24,
      y: 120 + index * 24,
    });

    return [{ cell, drawioId, geometry, styles, type }];
  });

  if (nodeRecords.length === 0) return { edges: [], nodes: [] };

  const minX = Math.min(...nodeRecords.map((record) => record.geometry.x));
  const minY = Math.min(...nodeRecords.map((record) => record.geometry.y));
  const drawioIdToNodeId = new Map<string, string>();
  const usedNodeIds = new Set<string>();

  const nodes = nodeRecords.map((record, index) => {
    const id = toImportedId("drawio", record.drawioId, index, usedNodeIds);
    const label = getDrawioLabelInfo(record.cell.getAttribute("value") ?? "");
    const fillColor = getDrawioStyleColor(record.styles, "fillColor", "#4b5c6b");
    const strokeColor = getDrawioStyleColor(record.styles, "strokeColor", "#ffffff");
    const fontColor = getDrawioStyleColor(record.styles, "fontColor", "#ffffff");

    drawioIdToNodeId.set(record.drawioId, id);

    if (record.type === "diamond") {
      return {
        id,
        type: "diamond",
        position: { x: record.geometry.x - minX + 120, y: record.geometry.y - minY + 90 },
        data: { label: label.text || "Decision" },
        height: record.geometry.height,
        width: record.geometry.width,
      } as AppNode;
    }

    if (record.type === "group") {
      const groupTitle = titleByDrawioId.get(record.drawioId);
      const titleSettings = getGroupTitlePositionFromGeometry(
        record.geometry,
        groupTitle?.geometry,
      );

      return {
        id,
        type: "group",
        position: { x: record.geometry.x - minX + 120, y: record.geometry.y - minY + 90 },
        data: {
          color: fillColor,
          title: groupTitle?.title || label.text || "Group",
          titlePlacement: titleSettings.titlePlacement,
          titlePosition: titleSettings.titlePosition,
        },
        height: record.geometry.height,
        width: record.geometry.width,
        zIndex: -1,
      } as AppNode;
    }

    if (record.type === "text") {
      return {
        id,
        type: "text",
        position: { x: record.geometry.x - minX + 120, y: record.geometry.y - minY + 90 },
        data: {
          color: fontColor,
          fontSize: record.styles.fontSize ?? "16",
          text: label.text || "Text",
        },
        height: record.geometry.height,
        width: record.geometry.width,
      } as AppNode;
    }

    const title = label.lines[0] || label.text || "Box";
    const remainingLines = label.lines.slice(1);

    return {
      id,
      type: "box",
      position: { x: record.geometry.x - minX + 120, y: record.geometry.y - minY + 90 },
      data: {
        backgroundColor: fillColor,
        borderColor: strokeColor,
        content: remainingLines.slice(1).join("\n") || remainingLines[0] || "",
        imageAlt: "",
        imageHasBackground: true,
        imageUrl: label.imageUrl,
        subtitle: remainingLines.length > 1 ? remainingLines[0] : "",
        textColor: fontColor,
        title,
        titleAlign: label.titleAlign as "center" | "left",
        useCustomColors: true,
        variant: "default",
      },
      height: record.geometry.height,
      width: record.geometry.width,
    } as AppNode;
  });

  const usedEdgeIds = new Set<string>();
  const edges = cells.flatMap((cell, index) => {
    if (cell.getAttribute("edge") !== "1") return [];

    const source = drawioIdToNodeId.get(cell.getAttribute("source") ?? "");
    const target = drawioIdToNodeId.get(cell.getAttribute("target") ?? "");
    if (!source || !target) return [];

    const styles = parseDrawioStyle(cell.getAttribute("style") ?? "");
    const color = getDrawioStyleColor(styles, "strokeColor", "#4b5c6b");
    const id = toImportedId("drawio-edge", cell.getAttribute("id") ?? "", index, usedEdgeIds);

    return [
      {
        id,
        source,
        target,
        type: "padded",
        data: {
          color,
          dashed: styles.dashed === "1" || Boolean(styles.dashPattern),
          label: getDrawioLabelInfo(cell.getAttribute("value") ?? "").text,
        },
        markerEnd: createEdgeMarker(color),
        style: { stroke: color, strokeWidth: 2 },
      },
    ];
  });

  return { edges, nodes };
};

const buildBoxDrawioLabel = (data: BoxNodeData) => {
  const align = data.titleAlign === "center" ? "center" : "left";
  const parts: string[] = [];
  const title = toText(data.title);
  const subtitle = toText(data.subtitle);
  const content = toText(data.content);
  const imageUrl = toText(data.imageUrl);

  if (title) {
    parts.push(
      `<div style="font-weight:700;font-size:12px;line-height:1.2;text-align:${align};">${escapeHtml(
        title,
      )}</div>`,
    );
  }

  if (imageUrl) {
    const imageBackground =
      data.imageHasBackground === false
        ? ""
        : "background:rgba(0,0,0,0.16);border-radius:8px;padding:4px;";

    parts.push(
      `<div style="margin-top:8px;margin-bottom:8px;text-align:center;${imageBackground}"><img src="${escapeHtml(
        imageUrl,
      )}" style="max-width:100%;max-height:150px;" /></div>`,
    );
  }

  if (subtitle) {
    parts.push(
      `<div style="margin-top:6px;font-size:11px;font-weight:600;line-height:1.25;opacity:0.78;">${escapeHtml(
        subtitle,
      )}</div>`,
    );
  }

  if (content) {
    parts.push(
      `<div style="margin-top:8px;font-size:12px;line-height:1.3;">${escapeHtml(content)}</div>`,
    );
  }

  return parts.join("");
};

const getDrawioNodeCell = (
  layout: NodeExportLayout,
  drawioId: string,
  x: number,
  y: number,
) => {
  const { node, width, height } = layout;
  let style = "";
  let value = "";

  if (node.type === "box") {
    const colors = getBoxDrawioColors(node.data);
    style = [
      "rounded=1",
      "whiteSpace=wrap",
      "html=1",
      "arcSize=8",
      "spacing=10",
      "shadow=1",
      `fillColor=${colors.fill}`,
      `strokeColor=${colors.stroke}`,
      `fontColor=${colors.font}`,
    ].join(";");
    value = buildBoxDrawioLabel(node.data);
  }

  if (node.type === "diamond") {
    style = [
      "rhombus",
      "whiteSpace=wrap",
      "html=1",
      "rounded=1",
      "shadow=1",
      "fillColor=#4b5c6b",
      "strokeColor=#687987",
      "fontColor=#f5f7fb",
      "fontSize=11",
      "fontStyle=1",
    ].join(";");
    value = escapeHtml(toText(node.data.label));
  }

  if (node.type === "group") {
    const color = toDrawioColor(node.data.color, "#2f6f8f");
    style = [
      "rounded=1",
      "whiteSpace=wrap",
      "html=1",
      "container=1",
      "collapsible=0",
      "connectable=0",
      "fillOpacity=20",
      "strokeWidth=2",
      `fillColor=${color}`,
      `strokeColor=${getGroupBorderColor(color)}`,
    ].join(";");
  }

  if (node.type === "text") {
    style = [
      "text",
      "html=1",
      "strokeColor=none",
      "fillColor=none",
      "whiteSpace=wrap",
      "rounded=0",
      "align=left",
      "verticalAlign=top",
      `fontColor=${toDrawioColor(node.data.color, "#f5f7fb")}`,
      `fontSize=${Number.parseInt(toText(node.data.fontSize, "16"), 10) || 16}`,
      "fontStyle=1",
    ].join(";");
    value = escapeHtml(toText(node.data.text, "Text"));
  }

  return [
    `<mxCell id="${drawioId}" value="${escapeXml(value)}" style="${escapeXml(
      `${style};`,
    )}" vertex="1" parent="${DRAWIO_ROOT_ID}">`,
    `<mxGeometry x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(
      width,
    )}" height="${formatNumber(height)}" as="geometry" />`,
    "</mxCell>",
  ].join("");
};

const getGroupTitleDrawioCell = (
  layout: NodeExportLayout,
  drawioId: string,
  x: number,
  y: number,
) => {
  if (layout.node.type !== "group") return "";

  const title = toText(layout.node.data.title).trim();
  if (!title) return "";

  const color = toDrawioColor(layout.node.data.color, "#2f6f8f");
  const borderColor = getGroupBorderColor(color);
  const titleColor = getRelativeLuminance(color) < 0.42 ? "#ffffff" : "#111827";
  const placement = normalizeGroupTitlePlacement(layout.node.data.titlePlacement);
  const position = normalizeGroupTitlePosition(
    layout.node.data.titlePosition,
    layout.node.data.titleSide,
  );
  const titleLayout = getGroupTitleLayout({
    height: layout.height,
    placement,
    position,
    title,
    width: layout.width,
    x,
    y,
  });

  const style = [
    "text",
    "html=1",
    "rounded=1",
    "whiteSpace=wrap",
    "align=center",
    "verticalAlign=middle",
    "spacing=4",
    "fontSize=11",
    "fontStyle=1",
    `fillColor=${color}`,
    `strokeColor=${borderColor}`,
    `fontColor=${titleColor}`,
  ]
    .filter(Boolean)
    .join(";");

  return [
    `<mxCell id="${drawioId}-title" value="${escapeXml(
      escapeHtml(title),
    )}" style="${escapeXml(`${style};`)}" vertex="1" parent="${DRAWIO_ROOT_ID}">`,
    `<mxGeometry x="${formatNumber(titleLayout.x)}" y="${formatNumber(
      titleLayout.y,
    )}" width="${formatNumber(titleLayout.width)}" height="${formatNumber(
      titleLayout.height,
    )}" as="geometry" />`,
    "</mxCell>",
  ].join("");
};

const getDrawioEdgeCell = (edge: Edge, edgeId: string, nodeIdBySourceId: Map<string, string>) => {
  const sourceId = nodeIdBySourceId.get(edge.source);
  const targetId = nodeIdBySourceId.get(edge.target);
  if (!sourceId || !targetId) return "";

  const data = isRecord(edge.data) ? edge.data : {};
  const color = toDrawioColor(data.color, "#4b5c6b");
  const dashed = data.dashed === true;
  const label = toText(data.label);
  const style = [
    "edgeStyle=orthogonalEdgeStyle",
    "rounded=1",
    "orthogonalLoop=1",
    "jettySize=auto",
    "html=1",
    "endArrow=block",
    "endFill=1",
    "strokeWidth=2",
    `strokeColor=${color}`,
    `fontColor=${color}`,
    `labelBackgroundColor=${DRAWIO_BACKGROUND_COLOR}`,
    dashed ? "dashed=1" : "",
    dashed ? "dashPattern=8 8" : "",
  ]
    .filter(Boolean)
    .join(";");

  return [
    `<mxCell id="${edgeId}" value="${escapeXml(
      escapeHtml(label),
    )}" style="${escapeXml(`${style};`)}" edge="1" parent="${DRAWIO_ROOT_ID}" source="${sourceId}" target="${targetId}">`,
    '<mxGeometry relative="1" as="geometry" />',
    "</mxCell>",
  ].join("");
};

const buildDrawioXml = (layouts: NodeExportLayout[], edges: Edge[]) => {
  const bounds = getExportBounds(layouts);
  const pageWidth = Math.ceil(Math.max(bounds.width + DRAWIO_PADDING * 2, MIN_EXPORT_WIDTH));
  const pageHeight = Math.ceil(Math.max(bounds.height + DRAWIO_PADDING * 2, MIN_EXPORT_HEIGHT));
  const sortedLayouts = [...layouts].sort(
    (a, b) => (a.node.zIndex ?? 0) - (b.node.zIndex ?? 0),
  );
  const nodeIdBySourceId = new Map<string, string>();

  sortedLayouts.forEach((layout, index) => {
    nodeIdBySourceId.set(layout.node.id, `n${index + 1}`);
  });

  const nodeCells = sortedLayouts
    .map((layout) => {
      const drawioId = nodeIdBySourceId.get(layout.node.id) ?? layout.node.id;
      const x = layout.node.position.x - bounds.x + DRAWIO_PADDING;
      const y = layout.node.position.y - bounds.y + DRAWIO_PADDING;

      return [
        getDrawioNodeCell(layout, drawioId, x, y),
        getGroupTitleDrawioCell(layout, drawioId, x, y),
      ].join("");
    })
    .join("");

  const edgeCells = edges
    .map((edge, index) => getDrawioEdgeCell(edge, `e${index + 1}`, nodeIdBySourceId))
    .join("");
  const backgroundCell = [
    `<mxCell id="background" value="" style="shape=rectangle;rounded=0;whiteSpace=wrap;html=1;fillColor=${DRAWIO_BACKGROUND_COLOR};gradientColor=none;opacity=100;fillOpacity=100;strokeColor=${DRAWIO_BACKGROUND_COLOR};strokeWidth=0;strokeOpacity=0;shadow=0;glass=0;sketch=0;connectable=0;locked=1;movable=0;resizable=0;rotatable=0;deletable=0;editable=0;" vertex="1" parent="${DRAWIO_ROOT_ID}">`,
    `<mxGeometry x="0" y="0" width="${pageWidth}" height="${pageHeight}" as="geometry" />`,
    "</mxCell>",
  ].join("");
  const modifiedAt = new Date().toISOString();

  return [
    `<mxfile host="app.diagrams.net" modified="${modifiedAt}" agent="rearchitech" version="24.7.17">`,
    `<diagram id="rearchitech" name="Page-1" background="${DRAWIO_BACKGROUND_COLOR}">`,
    `<mxGraphModel dx="${pageWidth}" dy="${pageHeight}" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" background="${DRAWIO_BACKGROUND_COLOR}" math="0" shadow="0">`,
    "<root>",
    '<mxCell id="0" />',
    `<mxCell id="${DRAWIO_ROOT_ID}" parent="0" />`,
    backgroundCell,
    nodeCells,
    edgeCells,
    "</root>",
    "</mxGraphModel>",
    "</diagram>",
    "</mxfile>",
  ].join("");
};

export default function App() {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const flowRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const idCounterRef = useRef(1);
  const placementOffsetRef = useRef(0);

  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState("");
  const [showConnectionPoints, setShowConnectionPoints] = useState(true);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      box: BoxNode,
      diamond: DiamondNode,
      group: GroupNode,
      text: TextNode,
    }),
    [],
  );

  const edgeTypes = useMemo<EdgeTypes>(
    () => ({
      horizontal: HorizontalEdge,
      padded: PaddedSmoothStepEdge,
      routed: RoutedEdge,
    }),
    [],
  );

  const defaultEdgeOptions = useMemo<DefaultEdgeOptions>(
    () => ({
      type: "padded",
      style: {
        stroke: "var(--edge-stroke)",
        strokeWidth: 2,
      },
      markerEnd: createEdgeMarker(),
    }),
    [],
  );

  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes]);
  const selectedNode = useMemo(
    () =>
      selectedNodes.length === 1 && selectedNodes[0].id === selectedNodeId
        ? selectedNodes[0]
        : null,
    [selectedNodeId, selectedNodes],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );
  const selectedEdgeData = isRecord(selectedEdge?.data) ? selectedEdge.data : {};

  const createId = useCallback((prefix: string) => {
    const nextId = idCounterRef.current;
    idCounterRef.current += 1;
    return `${prefix}-${Date.now().toString(36)}-${nextId}`;
  }, []);

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const getNextNodePosition = useCallback(() => {
    const bounds = flowRef.current?.getBoundingClientRect();
    const offset = placementOffsetRef.current;
    placementOffsetRef.current = (offset + 36) % 180;

    return screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2 + offset,
      y: (bounds?.top ?? 0) + (bounds?.height ?? window.innerHeight) / 2 + offset,
    });
  }, [screenToFlowPosition]);

  const getCurrentNodeLayouts = useCallback(() => {
    const nodeElements = new Map(
      Array.from(flowRef.current?.querySelectorAll<HTMLElement>(".react-flow__node") ?? [])
        .filter((element) => element.dataset.id)
        .map((element) => [element.dataset.id as string, element]),
    );

    return nodes.map((node) => ({
      node,
      ...getNodeExportSize(node, nodeElements.get(node.id)),
    }));
  }, [nodes]);

  const addNodeFromToolbox = useCallback(
    (item: ToolboxItem) => {
      const nextNode = {
        id: createId("node"),
        type: item.type,
        position: getNextNodePosition(),
        data: item.data(),
        selected: true,
        ...(item.width ? { width: item.width } : null),
        ...(item.height ? { height: item.height } : null),
        ...(typeof item.zIndex === "number" ? { zIndex: item.zIndex } : null),
      } as AppNode;

      setNodes((nodesSnapshot) => [
        ...nodesSnapshot.map((node) => ({ ...node, selected: false }) as AppNode),
        nextNode,
      ]);
      setEdges((edgesSnapshot) => edgesSnapshot.map((edge) => ({ ...edge, selected: false })));
      setSelectedNodeId(nextNode.id);
      setSelectedEdgeId(null);
      setFileStatus("");
    },
    [createId, getNextNodePosition],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot) as AppNode[]);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((edgesSnapshot) => {
      const nextEdges = applyEdgeChanges(changes, edgesSnapshot);

      setSelectedEdgeId((currentId) => {
        const selectedEdge = nextEdges.find((edge) => edge.selected);
        if (selectedEdge) return selectedEdge.id;
        if (currentId && nextEdges.some((edge) => edge.id === currentId)) return currentId;
        return null;
      });

      return nextEdges;
    });
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((edgesSnapshot) =>
        addEdge(
          {
            ...connection,
            id: createId("edge"),
            type: "padded",
          },
          edgesSnapshot,
        ),
      );
    },
    [createId],
  );

  const onSelectionChange = useCallback(
    ({ edges: selectedEdges, nodes: selectedSelectionNodes }: OnSelectionChangeParams<AppNode, Edge>) => {
      setSelectedNodeId(
        selectedSelectionNodes.length === 1 ? selectedSelectionNodes[0].id : null,
      );
      setSelectedEdgeId(
        selectedSelectionNodes.length === 0 && selectedEdges.length === 1
          ? selectedEdges[0].id
          : null,
      );
    },
    [],
  );

  const updateSelectedNodeData = useCallback(
    (field: string, value: boolean | string) => {
      if (!selectedNodeId) return;

      setNodes((nodesSnapshot) =>
        nodesSnapshot.map((node) => {
          if (node.id !== selectedNodeId) return node;

          return {
            ...node,
            data: {
              ...node.data,
              [field]: value,
            },
          } as AppNode;
        }),
      );
    },
    [selectedNodeId],
  );

  const updateSelectedEdge = useCallback(
    (updates: Partial<Edge>) => {
      if (!selectedEdgeId) return;

      setEdges((edgesSnapshot) =>
        edgesSnapshot.map((edge) => (edge.id === selectedEdgeId ? { ...edge, ...updates } : edge)),
      );
    },
    [selectedEdgeId],
  );

  const updateSelectedEdgeData = useCallback(
    (field: string, value: boolean | number | string) => {
      if (!selectedEdgeId) return;

      setEdges((edgesSnapshot) =>
        edgesSnapshot.map((edge) => {
          if (edge.id !== selectedEdgeId) return edge;

          return {
            ...edge,
            data: {
              ...(isRecord(edge.data) ? edge.data : {}),
              [field]: value,
            },
          };
        }),
      );
    },
    [selectedEdgeId],
  );

  const updateSelectedEdgeColor = useCallback(
    (color: string) => {
      if (!selectedEdgeId) return;

      setEdges((edgesSnapshot) =>
        edgesSnapshot.map((edge) => {
          if (edge.id !== selectedEdgeId) return edge;

          return {
            ...edge,
            data: {
              ...(isRecord(edge.data) ? edge.data : {}),
              color,
            },
            markerEnd: createEdgeMarker(color),
            style: {
              ...edge.style,
              stroke: color,
              strokeWidth: 2,
            },
          };
        }),
      );
    },
    [selectedEdgeId],
  );

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;

    setNodes((nodesSnapshot) => nodesSnapshot.filter((node) => node.id !== selectedNodeId));
    setEdges((edgesSnapshot) =>
      edgesSnapshot.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId),
    );
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setFileStatus("Node deleted");
  }, [selectedNodeId]);

  const importSelectedNodeImage = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !selectedNodeId) return;

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        updateSelectedNodeData("imageUrl", result);
        updateSelectedNodeData("imageAlt", file.name);
      });
      reader.readAsDataURL(file);
      event.target.value = "";
    },
    [selectedNodeId, updateSelectedNodeData],
  );

  const exportFlowFile = useCallback(() => {
    const payload = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        nodes,
        edges,
      },
      null,
      2,
    );

    downloadBlob(new Blob([payload], { type: "application/json" }), "rearchitech.json");
    setFileStatus("Exported");
  }, [downloadBlob, edges, nodes]);

  const importFlowFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const contents = await file.text();
        const lowerName = file.name.toLowerCase();
        const trimmedContents = contents.trim();
        const isDrawioFile =
          lowerName.endsWith(".drawio") ||
          lowerName.endsWith(".xml") ||
          trimmedContents.startsWith("<mxfile") ||
          trimmedContents.startsWith("<mxGraphModel") ||
          trimmedContents.includes("<mxGraphModel");
        const imported = isDrawioFile
          ? await parseDrawioFile(contents)
          : (() => {
              const payload = JSON.parse(contents) as FlowFile;
              const nodes = sanitizeNodes(payload.nodes);

              return {
                edges: sanitizeEdges(payload.edges, nodes),
                nodes,
              };
            })();
        const nextNodes = imported.nodes;
        const nextEdges = imported.edges;

        if (nextNodes.length === 0 && isDrawioFile) {
          throw new Error("No supported draw.io nodes found");
        }

        setNodes(nextNodes);
        setEdges(nextEdges);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setFileStatus(
          `Imported ${nextNodes.length} nodes${isDrawioFile ? " from draw.io" : ""}`,
        );

        window.requestAnimationFrame(() => {
          if (nextNodes.length > 0) {
            fitView({ padding: 0.2 });
          }
        });
      } catch (error) {
        console.error(error);
        setFileStatus("Import failed");
      } finally {
        event.target.value = "";
      }
    },
    [fitView],
  );

  const exportCanvasSvg = useCallback(() => {
    if (!flowRef.current) return;

    const renderedNodes = getCurrentNodeLayouts();

    if (renderedNodes.length === 0) {
      setFileStatus("Nothing to export");
      return;
    }

    const backgroundColor =
      getComputedStyle(document.documentElement).getPropertyValue("--canvas-bg").trim() ||
      "#0f1116";
    const payload = buildPortableSvg(renderedNodes, edges, flowRef.current, backgroundColor);

    downloadBlob(new Blob([payload], { type: "image/svg+xml;charset=utf-8" }), "rearchitech.svg");
    setFileStatus("SVG saved");
  }, [downloadBlob, edges, getCurrentNodeLayouts]);

  const exportDrawioFile = useCallback(() => {
    const layouts = getCurrentNodeLayouts();

    if (layouts.length === 0) {
      setFileStatus("Nothing to export");
      return;
    }

    const payload = buildDrawioXml(layouts, edges);

    downloadBlob(new Blob([payload], { type: "application/vnd.jgraph.mxfile" }), "rearchitech.drawio");
    setFileStatus("draw.io saved");
  }, [downloadBlob, edges, getCurrentNodeLayouts]);

  const clearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setFileStatus("");
  }, []);

  return (
    <div className={showConnectionPoints ? "appShell" : "appShell appShell--hideConnectionPoints"}>
      <div className="flowCanvas" ref={flowRef}>
        <div className="reactFlowSurface">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
            }}
            onNodeClick={() => {
              setSelectedEdgeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            multiSelectionKeyCode={SELECTION_KEY_CODE}
            panOnDrag
            proOptions={{ hideAttribution: true }}
            selectionMode={SelectionMode.Partial}
            selectionKeyCode={SELECTION_KEY_CODE}
            connectionLineStyle={{ stroke: "var(--edge-stroke)", strokeWidth: 2 }}
          >
            <Background color="rgba(255,255,255,0.08)" gap={22} size={1} />
            {selectedNode ? (
              <NodeToolbar
                align="end"
                className="nodeDeleteToolbar"
                isVisible
                nodeId={selectedNode.id}
                offset={-12}
                position={Position.Top}
              >
                <button
                  aria-label="Delete selected node"
                  className="nodeDeleteButton nodrag nopan"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteSelectedNode();
                  }}
                >
                  X
                </button>
              </NodeToolbar>
            ) : null}
            <Controls position="bottom-right" />
          </ReactFlow>
        </div>

        <div className="appBrand nodrag nopan nokey" aria-label="Rearchitech">
          <img className="appBrand__mark" src="/rearchitech.svg" alt="" aria-hidden="true" />
          <span className="appBrand__name">Rearchitech</span>
        </div>

        <aside className="floatingToolbox nodrag nopan nokey" aria-label="Toolbox">
          <div className="toolboxSection">
            <div className="toolboxTitle">Add</div>
            <div className="toolboxGrid">
              {toolboxItems.map((item) => (
                <button
                  key={`${item.type}-${item.label}`}
                  className={`toolboxButton toolboxButton--${item.icon}`}
                  type="button"
                  onClick={() => addNodeFromToolbox(item)}
                >
                  <span className={`toolboxIcon toolboxIcon--${item.icon}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedNode ? (
            <div className="toolboxSection">
              <div className="toolboxTitle">Selected</div>

              {selectedNode.type === "diamond" ? (
                <label className="toolboxField">
                  <span>Label</span>
                  <input
                    value={toText(selectedNode.data.label)}
                    onChange={(event) => updateSelectedNodeData("label", event.target.value)}
                  />
                </label>
              ) : null}

              {selectedNode.type === "group" ? (
                <>
                  <label className="toolboxField">
                    <span>Title</span>
                    <input
                      value={toText(selectedNode.data.title)}
                      onChange={(event) => updateSelectedNodeData("title", event.target.value)}
                    />
                  </label>
                  <div className="colorSwatches" aria-label="Group color">
                    {groupColors.map((color) => (
                      <button
                        key={color}
                        className={
                          selectedNode.data.color === color
                            ? "colorSwatch colorSwatch--selected"
                            : "colorSwatch"
                        }
                        type="button"
                        style={{ backgroundColor: color }}
                        aria-label={`Set group color ${color}`}
                        onClick={() => updateSelectedNodeData("color", color)}
                      />
                    ))}
                  </div>
                  <label className="toolboxField">
                    <span>Color</span>
                    <input
                      type="color"
                      value={toColorInput(selectedNode.data.color, "#2f6f8f")}
                      onChange={(event) => updateSelectedNodeData("color", event.target.value)}
                    />
                  </label>
                  <label className="toolboxField">
                    <span>Title position</span>
                    <select
                      value={normalizeGroupTitlePosition(
                        selectedNode.data.titlePosition,
                        selectedNode.data.titleSide,
                      )}
                      onChange={(event) =>
                        updateSelectedNodeData("titlePosition", event.target.value)
                      }
                    >
                      <option value="top-left">Top left</option>
                      <option value="top-center">Top center</option>
                      <option value="top-right">Top right</option>
                      <option value="bottom-left">Bottom left</option>
                      <option value="bottom-center">Bottom center</option>
                      <option value="bottom-right">Bottom right</option>
                    </select>
                  </label>
                  <label className="toolboxField">
                    <span>Title placement</span>
                    <select
                      value={selectedNode.data.titlePlacement ?? "inside"}
                      onChange={(event) =>
                        updateSelectedNodeData("titlePlacement", event.target.value)
                      }
                    >
                      <option value="inside">Inside</option>
                      <option value="outside">Outside</option>
                    </select>
                  </label>
                </>
              ) : null}

              {selectedNode.type === "text" ? (
                <>
                  <label className="toolboxField">
                    <span>Text</span>
                    <textarea
                      rows={3}
                      value={toText(selectedNode.data.text)}
                      onChange={(event) => updateSelectedNodeData("text", event.target.value)}
                    />
                  </label>
                  <label className="toolboxField">
                    <span>Color</span>
                    <input
                      type="color"
                      value={toColorInput(selectedNode.data.color, "#f5f7fb")}
                      onChange={(event) => updateSelectedNodeData("color", event.target.value)}
                    />
                  </label>
                  <label className="toolboxField">
                    <span>Size</span>
                    <input
                      type="number"
                      min="10"
                      max="64"
                      value={toText(selectedNode.data.fontSize, "16")}
                      onChange={(event) => updateSelectedNodeData("fontSize", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {selectedNode.type === "box" ? (
                <>
                  <label className="toolboxField">
                    <span>Title</span>
                    <input
                      value={toText(selectedNode.data.title)}
                      onChange={(event) => updateSelectedNodeData("title", event.target.value)}
                    />
                  </label>
                  <label className="toolboxField">
                    <span>Subtitle</span>
                    <input
                      value={toText(selectedNode.data.subtitle)}
                      onChange={(event) => updateSelectedNodeData("subtitle", event.target.value)}
                    />
                  </label>
                  <label className="toolboxCheck">
                    <input
                      type="checkbox"
                      checked={selectedNode.data.titleAlign === "center"}
                      onChange={(event) =>
                        updateSelectedNodeData(
                          "titleAlign",
                          event.target.checked ? "center" : "left",
                        )
                      }
                    />
                    <span>Center title</span>
                  </label>
                  <label className="toolboxField">
                    <span>Image URL</span>
                    <input
                      value={toText(selectedNode.data.imageUrl)}
                      onChange={(event) => updateSelectedNodeData("imageUrl", event.target.value)}
                    />
                  </label>
                  <label className="toolboxCheck">
                    <input
                      type="checkbox"
                      checked={selectedNode.data.imageHasBackground !== false}
                      onChange={(event) =>
                        updateSelectedNodeData("imageHasBackground", event.target.checked)
                      }
                    />
                    <span>Image background</span>
                  </label>
                  <div className="toolboxActions toolboxActions--inline">
                    <button type="button" onClick={() => imageInputRef.current?.click()}>
                      Choose
                    </button>
                    <button type="button" onClick={() => updateSelectedNodeData("imageUrl", "")}>
                      Clear image
                    </button>
                  </div>
                  <input
                    ref={imageInputRef}
                    className="fileInput"
                    type="file"
                    accept="image/*"
                    onChange={importSelectedNodeImage}
                  />
                  <label className="toolboxField">
                    <span>Body</span>
                    <textarea
                      rows={3}
                      value={toText(selectedNode.data.content)}
                      onChange={(event) => updateSelectedNodeData("content", event.target.value)}
                    />
                  </label>
                  <label className="toolboxField">
                    <span>Variant</span>
                    <select
                      value={selectedNode.data.variant ?? "default"}
                      onChange={(event) => updateSelectedNodeData("variant", event.target.value)}
                      disabled={selectedNode.data.useCustomColors === true}
                    >
                      <option value="default">Default</option>
                      <option value="dark">Dark</option>
                      <option value="green">Success</option>
                      <option value="red">Alert</option>
                    </select>
                  </label>
                  <label className="toolboxCheck">
                    <input
                      type="checkbox"
                      checked={selectedNode.data.useCustomColors === true}
                      onChange={(event) =>
                        updateSelectedNodeData("useCustomColors", event.target.checked)
                      }
                    />
                    <span>Custom colors</span>
                  </label>
                  {selectedNode.data.useCustomColors === true ? (
                    <>
                      <label className="toolboxField">
                        <span>Background</span>
                        <input
                          type="color"
                          value={toColorInput(selectedNode.data.backgroundColor, "#4b5c6b")}
                          onChange={(event) =>
                            updateSelectedNodeData("backgroundColor", event.target.value)
                          }
                        />
                      </label>
                      <label className="toolboxField">
                        <span>Border</span>
                        <input
                          type="color"
                          value={toColorInput(selectedNode.data.borderColor, "#ffffff")}
                          onChange={(event) =>
                            updateSelectedNodeData("borderColor", event.target.value)
                          }
                        />
                      </label>
                      <label className="toolboxField">
                        <span>Text</span>
                        <input
                          type="color"
                          value={toColorInput(selectedNode.data.textColor, "#ffffff")}
                          onChange={(event) =>
                            updateSelectedNodeData("textColor", event.target.value)
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="toolboxSection">
              <div className="toolboxTitle">Edge</div>
              <label className="toolboxField">
                <span>Route</span>
                <select
                  value={selectedEdge.type ?? "padded"}
                  onChange={(event) => updateSelectedEdge({ type: event.target.value })}
                >
                  {edgeRoutes.map((route) => (
                    <option key={route.value} value={route.value}>
                      {route.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toolboxField">
                <span>Style</span>
                <select
                  value={selectedEdgeData.dashed === true ? "dashed" : "solid"}
                  onChange={(event) =>
                    updateSelectedEdgeData("dashed", event.target.value === "dashed")
                  }
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                </select>
              </label>
              <label className="toolboxField">
                <span>Text</span>
                <input
                  value={toText(selectedEdgeData.label)}
                  onChange={(event) => updateSelectedEdgeData("label", event.target.value)}
                />
              </label>
              <label className="toolboxField">
                <span>Color</span>
                <input
                  type="color"
                  value={toColorInput(selectedEdgeData.color, "#4b5c6b")}
                  onChange={(event) => updateSelectedEdgeColor(event.target.value)}
                />
              </label>
              {selectedEdge.type !== "padded" ? (
                <>
                  <label className="toolboxField">
                    <span>Source side</span>
                    <select
                      value={toText(selectedEdgeData.sourceSide, "bottom")}
                      onChange={(event) =>
                        updateSelectedEdgeData("sourceSide", event.target.value)
                      }
                    >
                      <option value="bottom">Bottom</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label className="toolboxField">
                    <span>Target align</span>
                    <select
                      value={toText(selectedEdgeData.targetAlign, "center")}
                      onChange={(event) =>
                        updateSelectedEdgeData("targetAlign", event.target.value)
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="toolboxSection">
            <div className="toolboxTitle">View</div>
            <label className="toolboxCheck">
              <input
                type="checkbox"
                checked={showConnectionPoints}
                onChange={(event) => setShowConnectionPoints(event.target.checked)}
              />
              <span>Show connection points</span>
            </label>
          </div>

        </aside>

        <aside className="floatingFiles nodrag nopan nokey" aria-label="Files">
          <div className="toolboxSection">
            <div className="toolboxTitle">Files</div>
            <div className="toolboxActions fileActions">
              <button type="button" onClick={exportFlowFile}>
                Export
              </button>
              <button type="button" onClick={() => importInputRef.current?.click()}>
                Import
              </button>
              <button type="button" onClick={exportCanvasSvg}>
                SVG
              </button>
              <button type="button" onClick={exportDrawioFile}>
                draw.io
              </button>
              <button type="button" onClick={clearCanvas}>
                Clear
              </button>
            </div>
            {fileStatus ? <div className="fileStatus">{fileStatus}</div> : null}
            <input
              ref={importInputRef}
              className="fileInput"
              type="file"
              accept="application/json,application/xml,text/xml,.json,.drawio,.xml"
              onChange={importFlowFile}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
