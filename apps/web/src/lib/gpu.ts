/**
 * Detecção de capacidade do dispositivo para ajustar a qualidade do 3D
 * (PWA mobile precisa de 1x DPR e menos amostragem; desktop vai até 2x).
 */
export interface GpuProfile {
  isMobile: boolean;
  lowPower: boolean;
  /** Faixa de DPR aceita pelo <Canvas dpr={[min, max]}>. */
  dpr: [number, number];
  /** Resolução do cubemap do HDRI (menor = menos amostragem/VRAM). */
  envResolution: number;
  antialias: boolean;
  prefersReducedMotion: boolean;
}

let cached: GpuProfile | null = null;

function detectWebglRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    return '';
  }
}

export function getGpuProfile(): GpuProfile {
  if (cached) return cached;
  const ua = navigator.userAgent;
  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.matchMedia('(pointer: coarse)').matches;
  const renderer = detectWebglRenderer();
  const softwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
  const weakMobileGpu = /Mali-[GT]?[0-9]{1,3}\b|Adreno \(TM\) [1-5][0-9]{2}\b|PowerVR/i.test(
    renderer,
  );
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const lowPower = softwareRenderer || weakMobileGpu || memory <= 2 || (isMobile && memory <= 4);

  cached = {
    isMobile,
    lowPower,
    dpr: isMobile || lowPower ? [1, 1] : [1, 2],
    envResolution: lowPower ? 32 : isMobile ? 64 : 256,
    antialias: !isMobile && !lowPower,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  return cached;
}
