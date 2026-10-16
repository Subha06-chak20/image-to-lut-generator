/**
 * Minimal 3x3 linear algebra for color transfer (Phase 4).
 *
 * Matrices are row-major number[9]. Only what the Monge-Kantorovich linear
 * transfer needs: multiplication, symmetric square root and inverse square root
 * via a Jacobi eigendecomposition.
 */

export type M3 = number[]; // length 9, row-major

export function matMul(a: M3, b: M3): M3 {
  const out = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j];
      out[i * 3 + j] = s;
    }
  }
  return out;
}

export function transpose(m: M3): M3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function applyMatVec(m: M3, v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * Jacobi eigendecomposition of a symmetric 3x3 matrix.
 * Returns eigenvalues and an eigenvector matrix whose columns are the vectors.
 */
export function jacobiEigen(m: M3): { values: number[]; vectors: M3 } {
  const a = m.slice();
  let v: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  for (let iter = 0; iter < 100; iter++) {
    // Largest off-diagonal magnitude.
    let p = 0, q = 1, max = Math.abs(a[1]);
    if (Math.abs(a[2]) > max) { max = Math.abs(a[2]); p = 0; q = 2; }
    if (Math.abs(a[5]) > max) { max = Math.abs(a[5]); p = 1; q = 2; }
    if (max < 1e-12) break;

    const app = a[p * 3 + p];
    const aqq = a[q * 3 + q];
    const apq = a[p * 3 + q];

    const tau = (aqq - app) / (2 * apq);
    const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    // Rotate A: A' = J^T A J with J = [[c, s],[ -s, c]] on (p,q).
    const newA = a.slice();
    newA[p * 3 + p] = app - t * apq;
    newA[q * 3 + q] = aqq + t * apq;
    newA[p * 3 + q] = 0;
    newA[q * 3 + p] = 0;

    const r = 3 - p - q; // remaining index
    const arp = a[r * 3 + p];
    const arq = a[r * 3 + q];
    newA[r * 3 + p] = c * arp - s * arq;
    newA[p * 3 + r] = newA[r * 3 + p];
    newA[r * 3 + q] = s * arp + c * arq;
    newA[q * 3 + r] = newA[r * 3 + q];

    for (let i = 0; i < 9; i++) a[i] = newA[i];

    // Accumulate eigenvectors: V = V J.
    for (let i = 0; i < 3; i++) {
      const vip = v[i * 3 + p];
      const viq = v[i * 3 + q];
      v[i * 3 + p] = c * vip - s * viq;
      v[i * 3 + q] = s * vip + c * viq;
    }
  }

  return { values: [a[0], a[4], a[8]], vectors: v };
}

/** Symmetric square root of a symmetric positive-semidefinite matrix. */
export function matSqrtSym(m: M3): M3 {
  const { values, vectors } = jacobiEigen(m);
  const d = values.map((x) => Math.sqrt(Math.max(0, x)));
  return rebuild(vectors, d);
}

/** Inverse symmetric square root (regularized to avoid blow-ups). */
export function matInvSqrtSym(m: M3, eps = 1e-6): M3 {
  const { values, vectors } = jacobiEigen(m);
  const d = values.map((x) => 1 / Math.sqrt(Math.max(eps, x)));
  return rebuild(vectors, d);
}

function rebuild(vectors: M3, d: number[]): M3 {
  // V diag(d) V^T
  const vd: M3 = [
    vectors[0] * d[0], vectors[1] * d[1], vectors[2] * d[2],
    vectors[3] * d[0], vectors[4] * d[1], vectors[5] * d[2],
    vectors[6] * d[0], vectors[7] * d[1], vectors[8] * d[2],
  ];
  return matMul(vd, transpose(vectors));
}
