"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRoadmapStore } from "@/stores/roadmap-store";
import { ProgressBar } from "./progress-bar";
import { cn } from "@/lib/utils";
import type { Node } from "@/types/database";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

const CARD_MIN_HEIGHT = 56;

interface CardViewProps {
  roadmapId: string;
  rootNodeId: string | null;
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
}

export function CardView({ roadmapId, rootNodeId }: CardViewProps) {
  const { nodes, loading, focusedNodeId, selectedNodeId, selectNode, addNode, getChildren } =
    useRoadmapStore();

  const isMobile = useIsMobile();
  const CARD_WIDTH = isMobile ? 140 : 180;
  const CARD_GAP_X = isMobile ? 16 : 24;
  const CARD_GAP_Y = isMobile ? 48 : 60;

  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LayoutNode | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const effectiveRootId = focusedNodeId || rootNodeId;
  const rootNode = effectiveRootId ? nodes.get(effectiveRootId) : null;

  const buildLayout = useCallback(
    (nodeId: string, depth: number): LayoutNode | null => {
      const node = nodes.get(nodeId);
      if (!node) return null;

      const children = getChildren(nodeId);
      const childLayouts = children
        .map((c) => buildLayout(c.id, depth + 1))
        .filter((l): l is LayoutNode => l !== null);

      const height = CARD_MIN_HEIGHT;

      if (childLayouts.length === 0) {
        return {
          id: nodeId,
          x: 0,
          y: depth * (CARD_MIN_HEIGHT + CARD_GAP_Y),
          width: CARD_WIDTH,
          height,
          children: [],
        };
      }

      // Position children side by side
      let currentX = 0;
      for (const child of childLayouts) {
        const subtreeWidth = getSubtreeWidth(child, CARD_WIDTH, CARD_GAP_X);
        offsetSubtree(child, currentX, 0);
        currentX += subtreeWidth + CARD_GAP_X;
      }

      const totalChildrenWidth = currentX - CARD_GAP_X;
      const centerX = totalChildrenWidth / 2 - CARD_WIDTH / 2;

      return {
        id: nodeId,
        x: centerX,
        y: depth * (CARD_MIN_HEIGHT + CARD_GAP_Y),
        width: CARD_WIDTH,
        height,
        children: childLayouts,
      };
    },
    [nodes, getChildren, CARD_WIDTH, CARD_GAP_X, CARD_GAP_Y]
  );

  useEffect(() => {
    if (!rootNode) return;
    const tree = buildLayout(rootNode.id, 0);
    if (!tree) return;

    // Normalize so minimum x is 0
    const minX = findMinX(tree);
    offsetSubtree(tree, -minX + 40, 40); // 40px padding

    const bounds = findBounds(tree);
    setLayout(tree);
    setCanvasSize({
      width: bounds.maxX + CARD_WIDTH + 80,
      height: bounds.maxY + CARD_MIN_HEIGHT + 80,
    });
  }, [rootNode, buildLayout]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading nodes...</p>
      </div>
    );
  }

  if (!rootNode || !layout) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No nodes found</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <div
        className="relative"
        style={{
          width: `${canvasSize.width}px`,
          height: `${canvasSize.height}px`,
          minWidth: "100%",
          minHeight: "100%",
        }}
      >
        {/* SVG connectors */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvasSize.width}
          height={canvasSize.height}
        >
          <Connectors layout={layout} />
        </svg>

        {/* Cards */}
        <Cards
          layout={layout}
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          roadmapId={roadmapId}
          onSelect={selectNode}
          onAddChild={addNode}
        />
      </div>
    </div>
  );
}

function Connectors({ layout }: { layout: LayoutNode }) {
  const lines: React.ReactNode[] = [];

  function walk(node: LayoutNode) {
    const parentCx = node.x + node.width / 2;
    const parentBottom = node.y + node.height;

    for (const child of node.children) {
      const childCx = child.x + child.width / 2;
      const childTop = child.y;
      const midY = parentBottom + (childTop - parentBottom) / 2;

      lines.push(
        <path
          key={`${node.id}-${child.id}`}
          d={`M ${parentCx} ${parentBottom} L ${parentCx} ${midY} L ${childCx} ${midY} L ${childCx} ${childTop}`}
          fill="none"
          className="stroke-border"
          strokeWidth={1.5}
        />
      );

      walk(child);
    }
  }

  walk(layout);
  return <>{lines}</>;
}

function Cards({
  layout,
  nodes,
  selectedNodeId,
  roadmapId,
  onSelect,
  onAddChild,
}: {
  layout: LayoutNode;
  nodes: Map<string, Node>;
  selectedNodeId: string | null;
  roadmapId: string;
  onSelect: (id: string) => void;
  onAddChild: (roadmapId: string, parentId: string) => void;
}) {
  const cards: React.ReactNode[] = [];

  function walk(layoutNode: LayoutNode) {
    const node = nodes.get(layoutNode.id);
    if (!node) return;

    const isSelected = selectedNodeId === node.id;

    cards.push(
      <div
        key={node.id}
        className={cn(
          "group absolute rounded-lg border bg-card px-3 py-2 cursor-pointer transition-colors",
          isSelected
            ? "border-primary ring-1 ring-primary/30"
            : "hover:border-primary/50"
        )}
        style={{
          left: `${layoutNode.x}px`,
          top: `${layoutNode.y}px`,
          width: `${layoutNode.width}px`,
        }}
        onClick={() => onSelect(node.id)}
      >
        <div className="flex items-start justify-between gap-1">
          <span className="text-sm font-medium leading-tight truncate flex-1">
            {node.title}
          </span>
          {node.link && (
            <svg
              className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
              />
            </svg>
          )}
        </div>
        <div className="mt-1.5">
          <ProgressBar nodeId={node.id} />
        </div>

        {/* Add child button - appears on hover below the card */}
        <button
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex h-6 w-6 sm:h-5 sm:w-5 items-center justify-center rounded-full border bg-background sm:opacity-0 transition-opacity sm:group-hover:opacity-100 hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(roadmapId, node.id);
          }}
          title="Add child node"
        >
          <svg
            className="h-3 w-3 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
    );

    for (const child of layoutNode.children) {
      walk(child);
    }
  }

  walk(layout);
  return <>{cards}</>;
}

// Layout helpers

function getSubtreeWidth(node: LayoutNode, cardWidth: number, gapX: number): number {
  if (node.children.length === 0) return cardWidth;
  let width = 0;
  for (let i = 0; i < node.children.length; i++) {
    width += getSubtreeWidth(node.children[i], cardWidth, gapX);
    if (i < node.children.length - 1) width += gapX;
  }
  return Math.max(cardWidth, width);
}

function offsetSubtree(node: LayoutNode, dx: number, dy: number) {
  node.x += dx;
  node.y += dy;
  for (const child of node.children) {
    offsetSubtree(child, dx, dy);
  }
}

function findMinX(node: LayoutNode): number {
  let min = node.x;
  for (const child of node.children) {
    min = Math.min(min, findMinX(child));
  }
  return min;
}

function findBounds(node: LayoutNode): { maxX: number; maxY: number } {
  let maxX = node.x;
  let maxY = node.y;
  for (const child of node.children) {
    const childBounds = findBounds(child);
    maxX = Math.max(maxX, childBounds.maxX);
    maxY = Math.max(maxY, childBounds.maxY);
  }
  return { maxX, maxY };
}
