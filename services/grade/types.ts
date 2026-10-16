import { Adjustments, Stats } from '../../types';

export type TransferEngineId = 'reinhard' | 'mongeKantorovich' | 'histogramMatch' | 'threeWay';

export interface TransferParams {
  engine: TransferEngineId;
  stats: Stats;
}

/** Adjustment params reuse the existing flat slider model verbatim. */
export type AdjustParams = Adjustments;

interface NodeBase {
  id: string;
  enabled: boolean;
  /** Blend factor: result = input + (nodeOutput - input) * mix. 1 = full effect. */
  mix: number;
}

export interface TransferNode extends NodeBase {
  type: 'transfer';
  params: TransferParams;
}

export interface AdjustNode extends NodeBase {
  type: 'adjust';
  params: AdjustParams;
}

export type GradeNode = TransferNode | AdjustNode;

export interface GradePipeline {
  nodes: GradeNode[];
}
