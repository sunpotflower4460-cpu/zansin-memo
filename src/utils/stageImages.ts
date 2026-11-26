import type { ImageSourcePropType } from 'react-native';
import archived from '../../assets/stage-archived.png';
import seed from '../../assets/stage-seed.png';
import sprout from '../../assets/stage-sprout.png';
import tree from '../../assets/stage-flower.png';
import type { GrowthState } from '../domain/types';

// 種・芽・花・保管の育ちを示す手描き風のイラスト（花の内部キーは 'tree'）。
export const stageImages: Record<GrowthState, ImageSourcePropType> = { seed, sprout, tree, archived };
