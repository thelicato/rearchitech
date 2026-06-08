import React from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { GroupNode as GroupNodeType } from "../types";

const DEFAULT_GROUP_COLOR = "#2f6f8f";
const legacyTitlePositions = {
  bottom: "bottom-center",
  left: "top-left",
  right: "top-right",
  top: "top-center",
} as const;

function normalizeHex(value?: string) {
  if (value === "transparent") return value;
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) return DEFAULT_GROUP_COLOR;
  return value;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function toHex(value: number) {
  return Math.round(value).toString(16).padStart(2, "0");
}

function mixColor(hex: string, target: "#000000" | "#ffffff", amount: number) {
  const color = hexToRgb(hex);
  const targetColor = hexToRgb(target);

  return `#${toHex(color.r + (targetColor.r - color.r) * amount)}${toHex(
    color.g + (targetColor.g - color.g) * amount,
  )}${toHex(color.b + (targetColor.b - color.b) * amount)}`;
}

function getRelativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  const color = normalizeHex(data.color);
  const isTransparent = color === "transparent";
  const baseBorderColor = isTransparent
    ? "transparent"
    : getRelativeLuminance(color) < 0.42
    ? mixColor(color, "#ffffff", 0.45)
    : mixColor(color, "#000000", 0.35);
  const backgroundOpacity = ((data.backgroundOpacity ?? 100) / 100) * 0.2;
  const borderOpacity = Math.max(0, Math.min(100, data.borderOpacity ?? 100)) / 100;
  const backgroundColor = isTransparent ? "transparent" : toRgba(color, backgroundOpacity);
  const borderColor = isTransparent ? "transparent" : toRgba(baseBorderColor, borderOpacity);
  const titlePosition =
    data.titlePosition ?? legacyTitlePositions[data.titleSide ?? "top"] ?? "top-center";
  const titlePlacement = data.titlePlacement ?? "inside";
  const titleClassName = `rfGroupTitle rfGroupTitle--${titlePosition} rfGroupTitle--${titlePlacement}`;

  return (
    <div
      className="rfGroupNode"
      style={{
        backgroundColor,
        borderColor,
        boxShadow: data.shadow === false ? "none" : undefined,
      }}
    >
      {data.title ? (
        <div
          className={titleClassName}
          style={{
            backgroundColor: isTransparent ? "transparent" : `${color}ee`,
            borderColor,
            color: isTransparent ? "#111827" : getRelativeLuminance(color) < 0.42 ? "#ffffff" : "#111827",
          }}
        >
          {data.title}
        </div>
      ) : null}
      <NodeResizer
        color={borderColor}
        isVisible={selected}
        minHeight={120}
        minWidth={180}
      />
    </div>
  );
}
