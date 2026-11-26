let counter = 0;

/** 端末内で衝突しないID。再試行で作り直さないよう、呼び出し側が操作の開始時に一度だけ作る。 */
export const createId = (): string => {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};
