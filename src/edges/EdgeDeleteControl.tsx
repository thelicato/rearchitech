import React from "react";
import { EdgeLabelRenderer, useReactFlow } from "@xyflow/react";

type EdgeDeleteControlProps = {
  color?: string;
  edgeId: string;
  label?: string;
  selected?: boolean;
  x: number;
  y: number;
};

export function EdgeDeleteControl({ color, edgeId, label, selected, x, y }: EdgeDeleteControlProps) {
  const { deleteElements } = useReactFlow();

  if (!label && !selected) return null;
  const className = selected
    ? "edgeOverlay edgeOverlay--selected nodrag nopan"
    : "edgeOverlay nodrag nopan";

  return (
    <EdgeLabelRenderer>
      <div
        className={className}
        style={{
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          color,
        }}
      >
        {selected ? (
          <button
            className="edgeDeleteButton"
            type="button"
            aria-label="Delete edge"
            onClick={() => void deleteElements({ edges: [{ id: edgeId }] })}
          >
            X
          </button>
        ) : null}
        {label ? <div className="edgeTextLabel">{label}</div> : null}
      </div>
    </EdgeLabelRenderer>
  );
}
