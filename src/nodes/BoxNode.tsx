import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BoxNode as BoxNodeType } from "../types";

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

export function BoxNode({ data }: NodeProps<BoxNodeType>) {
  const variant = data.variant ?? "default";
  const useCustomColors = data.useCustomColors === true;

  const className =
    useCustomColors
      ? "rfNode rfNode--custom"
      : variant === "dark"
      ? "rfNode rfNode--dark"
      : variant === "green"
      ? "rfNode rfNode--green"
      : variant === "red"
      ? "rfNode rfNode--red"
      : "rfNode";
  const customStyle: React.CSSProperties = useCustomColors
    ? {
        backgroundColor: getColorWithOpacity(
          data.backgroundColor,
          data.backgroundOpacity ?? 100,
        ),
        borderColor: getColorWithOpacity(data.borderColor, data.borderOpacity ?? 100),
        color: data.textColor || undefined,
      }
    : {};
  const titleClassName =
    data.titleAlign === "center" ? "rfNode__title rfNode__title--center" : "rfNode__title";
  const imageClassName =
    data.imageHasBackground === false ? "rfNode__image rfNode__image--plain" : "rfNode__image";

  return (
    <div className={className} style={customStyle}>
      <Handle type="target" position={Position.Top} />

      <div className={titleClassName}>{data.title}</div>

      {data.imageUrl ? (
        <img className={imageClassName} src={data.imageUrl} alt={data.imageAlt ?? ""} />
      ) : null}

      {data.subtitle ? <div className="rfNode__subtitle">{data.subtitle}</div> : null}

      {data.content ? <div className="rfNode__content">{data.content}</div> : null}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
