import { Adjustments, Stats } from '../../types';
import { GradeNode, GradePipeline, TransferEngineId } from './types';

/**
 * Build a grade pipeline from the flat slider model.
 *
 * Mapping preserves the original behavior exactly:
 * - transfer node mix = adjustments.intensity + 1  (0 = identity, 1 = look, 2 = exaggerated)
 * - adjust node mix   = 1 (full tone/color controls)
 */
export function buildPipeline(
  stats: Stats,
  adjustments: Adjustments,
  engine: TransferEngineId = 'reinhard',
): GradePipeline {
  const nodes: GradeNode[] = [
    {
      type: 'transfer',
      id: 'transfer',
      enabled: true,
      mix: adjustments.intensity + 1,
      params: { engine, stats },
    },
    {
      type: 'adjust',
      id: 'adjust',
      enabled: true,
      mix: 1,
      params: { ...adjustments },
    },
  ];
  return { nodes };
}
