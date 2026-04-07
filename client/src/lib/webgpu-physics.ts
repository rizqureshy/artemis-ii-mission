export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  hue: number;
}

export interface BlackHoleParams {
  x: number;
  y: number;
  z: number;
  mass: number;
  horizon: number;
  gravityRadius: number;
  gScale: number;
  timeScale: number;
}

const GRAVITY_COMPUTE_SHADER = `
struct Particle {
  pos: vec4f,
  vel: vec4f,
}

struct Params {
  bhPos: vec4f,
  bhParams: vec4f,
  count: u32,
  _pad: u32,
  _pad2: u32,
  _pad3: u32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let idx = id.x;
  if (idx >= params.count) {
    return;
  }

  var p = particles[idx];
  let life = p.pos.w;
  let hue = p.vel.w;
  
  if (life <= 0.0) {
    return;
  }

  let mass = params.bhPos.w;
  let horizon = params.bhParams.x;
  let gravityRadius = params.bhParams.y;
  let gScale = params.bhParams.z;
  let dt = params.bhParams.w;

  let dx = params.bhPos.x - p.pos.x;
  let dy = params.bhPos.y - p.pos.y;
  let dz = params.bhPos.z - p.pos.z;
  let d2 = dx * dx + dy * dy + dz * dz;
  let d = sqrt(d2);

  if (d < horizon) {
    p.pos.w = 0.0;
    particles[idx] = p;
    return;
  }

  if (d < gravityRadius) {
    let soft: f32 = 140.0;
    let inv = 1.0 / pow(d2 + soft * soft, 0.75);
    let a = gScale * mass * inv;
    
    p.vel.x += dx * a * dt;
    p.vel.y += dy * a * dt;
    p.vel.z += dz * a * dt;
  }

  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  p.pos.z += p.vel.z * dt;
  
  p.pos.w = life - dt * 0.4;
  p.vel.w = hue;

  if (abs(p.pos.x) > 5000.0 || abs(p.pos.y) > 5000.0 || abs(p.pos.z) > 5000.0) {
    p.pos.w = 0.0;
  }

  particles[idx] = p;
}
`;

const RAY_COMPUTE_SHADER = `
struct Ray {
  pos: vec4f,
  dir: vec4f,
}

struct Params {
  bhPos: vec4f,
  bhParams: vec4f,
  count: u32,
  _pad: u32,
  _pad2: u32,
  _pad3: u32,
}

@group(0) @binding(0) var<storage, read_write> rays: array<Ray>;
@group(0) @binding(1) var<uniform> params: Params;

fn normalize3(v: vec3f) -> vec3f {
  let len = sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 0.0001) {
    return vec3f(0.0, 0.0, 1.0);
  }
  return v / len;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let idx = id.x;
  if (idx >= params.count) {
    return;
  }

  var r = rays[idx];
  let speed = r.pos.w;
  let life = r.dir.w;
  
  if (life <= 0.0) {
    return;
  }

  let mass = params.bhPos.w;
  let horizon = params.bhParams.x;
  let gravityRadius = params.bhParams.y;
  let gScale = params.bhParams.z;
  let dt = params.bhParams.w;

  let dx = params.bhPos.x - r.pos.x;
  let dy = params.bhPos.y - r.pos.y;
  let dz = params.bhPos.z - r.pos.z;
  let d2 = dx * dx + dy * dy + dz * dz;
  let d = sqrt(d2);

  if (d < horizon) {
    r.dir.w = 0.0;
    rays[idx] = r;
    return;
  }

  var dirX = r.dir.x;
  var dirY = r.dir.y;
  var dirZ = r.dir.z;

  if (d < gravityRadius) {
    let soft: f32 = 140.0;
    let inv = 1.0 / pow(d2 + soft * soft, 0.75);
    let a = gScale * mass * inv;
    let bend: f32 = 0.00038;
    
    dirX += dx * a * bend * dt;
    dirY += dy * a * bend * dt;
    dirZ += dz * a * bend * dt;
    let normalized = normalize3(vec3f(dirX, dirY, dirZ));
    dirX = normalized.x;
    dirY = normalized.y;
    dirZ = normalized.z;
  }

  r.pos.x += dirX * speed * dt;
  r.pos.y += dirY * speed * dt;
  r.pos.z += dirZ * speed * dt;
  r.dir.x = dirX;
  r.dir.y = dirY;
  r.dir.z = dirZ;

  if (abs(r.pos.x) > 5000.0 || abs(r.pos.y) > 5000.0 || abs(r.pos.z) > 5000.0) {
    r.dir.w = 0.0;
  }

  rays[idx] = r;
}
`;

export class WebGPUPhysics {
  private device: GPUDevice | null = null;
  private particlePipeline: GPUComputePipeline | null = null;
  private rayPipeline: GPUComputePipeline | null = null;
  private particleBuffer: GPUBuffer | null = null;
  private rayBuffer: GPUBuffer | null = null;
  private particleParamsBuffer: GPUBuffer | null = null;
  private rayParamsBuffer: GPUBuffer | null = null;
  private particleBindGroup: GPUBindGroup | null = null;
  private rayBindGroup: GPUBindGroup | null = null;
  private maxParticles = 10000;
  private maxRays = 5000;
  private initialized = false;
  private supported = false;

  async init(): Promise<boolean> {
    if (this.initialized) return this.supported;
    this.initialized = true;

    if (!navigator.gpu) {
      console.log('WebGPU not supported, using CPU fallback');
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.log('No WebGPU adapter found, using CPU fallback');
        return false;
      }

      this.device = await adapter.requestDevice();
      
      const particleShaderModule = this.device.createShaderModule({
        code: GRAVITY_COMPUTE_SHADER,
      });

      const rayShaderModule = this.device.createShaderModule({
        code: RAY_COMPUTE_SHADER,
      });

      const bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'storage' as GPUBufferBindingType },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' as GPUBufferBindingType },
          },
        ],
      });

      const pipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      });

      this.particlePipeline = this.device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: particleShaderModule,
          entryPoint: 'main',
        },
      });

      this.rayPipeline = this.device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: rayShaderModule,
          entryPoint: 'main',
        },
      });

      this.particleBuffer = this.device.createBuffer({
        size: this.maxParticles * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });

      this.rayBuffer = this.device.createBuffer({
        size: this.maxRays * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });

      this.particleParamsBuffer = this.device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.rayParamsBuffer = this.device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.particleBindGroup = this.device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.particleBuffer } },
          { binding: 1, resource: { buffer: this.particleParamsBuffer } },
        ],
      });

      this.rayBindGroup = this.device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.rayBuffer } },
          { binding: 1, resource: { buffer: this.rayParamsBuffer } },
        ],
      });

      this.supported = true;
      console.log('WebGPU physics initialized successfully');
      return true;
    } catch (e) {
      console.error('WebGPU initialization failed:', e);
      return false;
    }
  }

  isSupported(): boolean {
    return this.supported;
  }

  updateParticlesSync(
    particles: Particle[],
    bh: BlackHoleParams,
    dt: number
  ): void {
    if (!this.device || !this.particleBuffer || !this.particleParamsBuffer || !this.particlePipeline || !this.particleBindGroup) {
      return;
    }

    const count = Math.min(particles.length, this.maxParticles);
    if (count === 0) return;

    const particleData = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      particleData[i * 8 + 0] = p.x;
      particleData[i * 8 + 1] = p.y;
      particleData[i * 8 + 2] = p.z;
      particleData[i * 8 + 3] = p.life;
      particleData[i * 8 + 4] = p.vx;
      particleData[i * 8 + 5] = p.vy;
      particleData[i * 8 + 6] = p.vz;
      particleData[i * 8 + 7] = p.hue;
    }

    const paramsData = new ArrayBuffer(48);
    const floatView = new Float32Array(paramsData);
    const uintView = new Uint32Array(paramsData);
    
    floatView[0] = bh.x;
    floatView[1] = bh.y;
    floatView[2] = bh.z;
    floatView[3] = bh.mass;
    floatView[4] = bh.horizon;
    floatView[5] = bh.gravityRadius;
    floatView[6] = bh.gScale;
    floatView[7] = dt;
    uintView[8] = count;

    this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);
    this.device.queue.writeBuffer(this.particleParamsBuffer, 0, new Float32Array(paramsData));

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.particlePipeline);
    passEncoder.setBindGroup(0, this.particleBindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(count / 64));
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  async readParticlesBack(particles: Particle[]): Promise<void> {
    if (!this.device || !this.particleBuffer) return;

    const count = Math.min(particles.length, this.maxParticles);
    if (count === 0) return;

    const readBuffer = this.device.createBuffer({
      size: count * 32,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(this.particleBuffer, 0, readBuffer, 0, count * 32);
    this.device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(readBuffer.getMappedRange());

    for (let i = 0; i < count; i++) {
      particles[i].x = resultData[i * 8 + 0];
      particles[i].y = resultData[i * 8 + 1];
      particles[i].z = resultData[i * 8 + 2];
      particles[i].life = resultData[i * 8 + 3];
      particles[i].vx = resultData[i * 8 + 4];
      particles[i].vy = resultData[i * 8 + 5];
      particles[i].vz = resultData[i * 8 + 6];
      particles[i].hue = resultData[i * 8 + 7];
    }

    readBuffer.unmap();
    readBuffer.destroy();
  }

  updateRaysSync(
    rays: Array<{ x: number; y: number; z: number; dx: number; dy: number; dz: number; speed: number; life: number }>,
    bh: BlackHoleParams,
    dt: number
  ): void {
    if (!this.device || !this.rayBuffer || !this.rayParamsBuffer || !this.rayPipeline || !this.rayBindGroup) {
      return;
    }

    const count = Math.min(rays.length, this.maxRays);
    if (count === 0) return;

    const rayData = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      const r = rays[i];
      rayData[i * 8 + 0] = r.x;
      rayData[i * 8 + 1] = r.y;
      rayData[i * 8 + 2] = r.z;
      rayData[i * 8 + 3] = r.speed;
      rayData[i * 8 + 4] = r.dx;
      rayData[i * 8 + 5] = r.dy;
      rayData[i * 8 + 6] = r.dz;
      rayData[i * 8 + 7] = r.life;
    }

    const paramsData = new ArrayBuffer(48);
    const floatView = new Float32Array(paramsData);
    const uintView = new Uint32Array(paramsData);
    
    floatView[0] = bh.x;
    floatView[1] = bh.y;
    floatView[2] = bh.z;
    floatView[3] = bh.mass;
    floatView[4] = bh.horizon;
    floatView[5] = bh.gravityRadius;
    floatView[6] = bh.gScale;
    floatView[7] = dt;
    uintView[8] = count;

    this.device.queue.writeBuffer(this.rayBuffer, 0, rayData);
    this.device.queue.writeBuffer(this.rayParamsBuffer, 0, new Float32Array(paramsData));

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.rayPipeline);
    passEncoder.setBindGroup(0, this.rayBindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(count / 64));
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  async readRaysBack(rays: Array<{ x: number; y: number; z: number; dx: number; dy: number; dz: number; speed: number; life: number }>): Promise<void> {
    if (!this.device || !this.rayBuffer) return;

    const count = Math.min(rays.length, this.maxRays);
    if (count === 0) return;

    const readBuffer = this.device.createBuffer({
      size: count * 32,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(this.rayBuffer, 0, readBuffer, 0, count * 32);
    this.device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(readBuffer.getMappedRange());

    for (let i = 0; i < count; i++) {
      rays[i].x = resultData[i * 8 + 0];
      rays[i].y = resultData[i * 8 + 1];
      rays[i].z = resultData[i * 8 + 2];
      rays[i].speed = resultData[i * 8 + 3];
      rays[i].dx = resultData[i * 8 + 4];
      rays[i].dy = resultData[i * 8 + 5];
      rays[i].dz = resultData[i * 8 + 6];
      rays[i].life = resultData[i * 8 + 7];
    }

    readBuffer.unmap();
    readBuffer.destroy();
  }

  destroy() {
    this.particleBuffer?.destroy();
    this.rayBuffer?.destroy();
    this.particleParamsBuffer?.destroy();
    this.rayParamsBuffer?.destroy();
    this.device?.destroy();
  }
}

export const webGPUPhysics = new WebGPUPhysics();
