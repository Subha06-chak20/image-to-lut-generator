import React, { useState } from 'react';
import { Adjustments, GradeOpId } from '../types';
import {
  GRADE_OP_META,
  isDefaultOpOrder,
  moveOp,
  normalizeOpOrder,
  opMeta,
  reorderOp,
} from '../services/grade/order';

interface GradeOrderPanelProps {
  values: Adjustments;
  onChange: (v: Adjustments) => void;
  disabled: boolean;
}

/**
 * Reorder the operations that make up the grade.
 *
 * The order is real: it is the sequence the pipeline dispatches over, so putting
 * the wheels before contrast is not a cosmetic difference — the maths is applied
 * in the order shown. Every operation always runs exactly once; this only changes
 * where.
 *
 * Dragging is the direct manipulation; the arrow buttons are the same operation
 * without a pointer, which also makes the feature reachable from a keyboard.
 */
const GradeOrderPanel: React.FC<GradeOrderPanelProps> = ({ values, onChange, disabled }) => {
  const order = normalizeOpOrder(values.opOrder);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const commit = (next: GradeOpId[]) => onChange({ ...values, opOrder: next });

  const step = (id: GradeOpId, delta: -1 | 1) => commit(moveOp(order, id, delta));

  const onDrop = (to: number) => {
    if (dragIndex !== null) commit(reorderOp(order, dragIndex, to));
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Order of operations
        </span>
        <button
          onClick={() => onChange({ ...values, opOrder: [...GRADE_OP_META.map((m) => m.id)] })}
          disabled={disabled || isDefaultOpOrder(values.opOrder)}
          aria-label="Reset operation order"
          className={`text-[10px] text-muted-foreground hover:text-primary transition-all ${
            isDefaultOpOrder(values.opOrder) ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <i className="fa-solid fa-rotate-left mr-1"></i>Reset
        </button>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Operations are applied top to bottom. Every operation is always applied once —
        changing this only changes when.
      </p>

      <ol className="space-y-1.5">
        {order.map((id, i) => {
          const meta = opMeta(id);
          const isDragging = dragIndex === i;
          const isTarget = overIndex === i && dragIndex !== null && dragIndex !== i;
          return (
            <li
              key={id}
              draggable={!disabled}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                if (disabled || dragIndex === null) return;
                e.preventDefault();
                setOverIndex(i);
              }}
              onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(i);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
                isDragging ? 'opacity-40' : ''
              } ${
                isTarget
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border bg-muted/40 hover:bg-muted'
              } ${disabled ? 'opacity-50' : ''}`}
            >
              <span
                className="fa-solid fa-grip-vertical text-[10px] text-muted-foreground/60"
                aria-hidden="true"
              ></span>
              <span className="w-3 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <i className={`fa-solid ${meta.icon} w-3 shrink-0 text-[10px] text-muted-foreground`}></i>
              <span className="flex-1 truncate text-[11px] text-foreground/90" title={meta.hint}>
                {meta.label}
              </span>

              <button
                onClick={() => step(id, -1)}
                disabled={disabled || i === 0}
                aria-label={`Move ${meta.label} earlier`}
                className="rounded px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
              >
                <i className="fa-solid fa-chevron-up"></i>
              </button>
              <button
                onClick={() => step(id, 1)}
                disabled={disabled || i === order.length - 1}
                aria-label={`Move ${meta.label} later`}
                className="rounded px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
              >
                <i className="fa-solid fa-chevron-down"></i>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default GradeOrderPanel;
