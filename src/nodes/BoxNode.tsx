import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BoxNode as BoxNodeType } from "../types";

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
        backgroundColor: data.backgroundColor || undefined,
        borderColor: data.borderColor || undefined,
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
