"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";

import { buildFlowOutline, pathKey } from "@/lib/builder-outline";
import { type BranchPathSegment } from "@/lib/builder-utils";
import { type FormSchema } from "@/lib/types";

interface SelectPathOptions {
  scrollToFlowTop?: boolean;
}

interface Props {
  schema: FormSchema;
  activePath: BranchPathSegment[];
  onSelectPath: (path: BranchPathSegment[], options?: SelectPathOptions) => void;
}

const MOBILE_BREAKPOINT_QUERY = "(max-width: 1000px)";

export function FlowMinimapOverlay({ schema, activePath, onSelectPath }: Props) {
  const nodes = useMemo(() => buildFlowOutline(schema), [schema]);
  const activeId = useMemo(() => pathKey(activePath), [activePath]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);

    const syncCollapsedWithViewport = (matches: boolean) => {
      setIsCollapsed(matches);
    };

    syncCollapsedWithViewport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncCollapsedWithViewport(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return (
    <aside className={`card minimap-overlay${isCollapsed ? " is-collapsed" : ""}`} aria-label="Tree minimap">
      <header className="minimap-header">
        <div className="field">
          <strong className="section-title">Tree Minimap</strong>
          <span className="helper-text">
            {nodes.length} {nodes.length === 1 ? "flow" : "flows"}
          </span>
        </div>

        <button
          type="button"
          className="button-secondary minimap-toggle"
          aria-expanded={!isCollapsed}
          aria-controls="tree-minimap-body"
          onClick={() => setIsCollapsed((current) => !current)}
        >
          {isCollapsed ? "Open" : "Collapse"}
        </button>
      </header>

      {!isCollapsed ? (
        <div className="minimap-body" id="tree-minimap-body">
          {nodes.length <= 1 ? (
            <p className="helper-text">
              No follow-up flows yet. Main flow is currently the only path.
            </p>
          ) : null}

          <ul className="minimap-list">
            {nodes.map((node) => {
              const nodeStyle = {
                "--node-depth": `${node.depth}`
              } as CSSProperties;
              const isActive = activeId === node.id;

              return (
                <li key={node.id}>
                  <button
                    type="button"
                    className={`minimap-node${node.depth > 0 ? " has-depth" : ""}${isActive ? " is-active" : ""}`}
                    style={nodeStyle}
                    onClick={() => onSelectPath(node.path, { scrollToFlowTop: true })}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span className="minimap-node-row">
                      <strong>{node.path.length === 0 ? "Main flow" : node.title}</strong>
                      <span className="badge">{node.questionCount}</span>
                    </span>
                    <span className="minimap-node-meta">
                      {node.path.length === 0
                        ? "Pinned entry point"
                        : `from ${node.sourceQuestionLabel ?? "Question"} -> ${node.sourceOptionLabel ?? "Option"}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
