import * as THREE from 'three';

export const HORIZON_COLOR = new THREE.Color(0xbcd4e6);
export const SUN_DIR = new THREE.Vector3(0.42, 0.36, -0.83).normalize();

const skyVert = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFrag = /* glsl */`
  varying vec3 vWorld;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  uniform vec3 uSunDir;

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    vec3 col;
    if (h < 0.5) {
      col = mix(uBottom, uMid, smoothstep(0.30, 0.5, h));
    } else {
      col = mix(uMid, uTop, smoothstep(0.5, 0.92, h));
    }

    // pendar matahari
    float sun = max(dot(dir, normalize(uSunDir)), 0.0);
    col += vec3(1.0, 0.92, 0.74) * pow(sun, 12.0) * 0.55;
    col += vec3(1.0, 0.96, 0.86) * pow(sun, 800.0) * 2.2;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeCloudTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');

  // gumpalan awan dari beberapa lingkaran kabur
  ctx.globalCompositeOperation = 'lighter';
  const blobs = 26;
  for (let i = 0; i < blobs; i++) {
    // gumpalan besar di tengah, serpihan kecil di pinggir → siluet lebih alami
    const big = i < 7;
    const spreadX = big ? 0.42 : 0.86;
    const spreadY = big ? 0.20 : 0.42;
    const bx = s * (0.5 + (Math.random() - 0.5) * spreadX);
    const by = s * (0.52 + (Math.random() - 0.5) * spreadY);
    const br = s * (big ? 0.13 + Math.random() * 0.10 : 0.04 + Math.random() * 0.07);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, `rgba(255,255,255,${big ? 0.40 : 0.26})`);
    g.addColorStop(0.45, `rgba(255,255,255,${big ? 0.18 : 0.10})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;

    const geo = new THREE.SphereGeometry(1, 24, 16);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x2f6fb5) },
        uMid: { value: new THREE.Color(0x86b6dd) },
        uBottom: { value: new THREE.Color(0xd7e5ee) },
        uSunDir: { value: SUN_DIR.clone() }
      }
    });
    this.dome = new THREE.Mesh(geo, this.mat);
    this.dome.scale.setScalar(9000);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // lapisan awan — sprite yang "dibungkus" mengelilingi pemain
    this.cloudArea = 7000;
    this.clouds = new THREE.Group();
    const tex = makeCloudTexture();
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
      fog: false
    });
    for (let i = 0; i < 44; i++) {
      const s = new THREE.Sprite(mat);
      const size = 700 + Math.random() * 1100;
      s.scale.set(size, size * (0.34 + Math.random() * 0.18), 1);
      s.position.set(
        (Math.random() - 0.5) * this.cloudArea,
        1150 + Math.random() * 1400,
        (Math.random() - 0.5) * this.cloudArea
      );
      s.userData.base = s.position.clone();
      this.clouds.add(s);
    }
    scene.add(this.clouds);
  }

  update(camera) {
    this.dome.position.copy(camera.position);

    // wrap awan supaya selalu ada di sekitar pemain
    const a = this.cloudArea;
    for (const s of this.clouds.children) {
      const b = s.userData.base;
      s.position.x = b.x + Math.round((camera.position.x - b.x) / a) * a;
      s.position.z = b.z + Math.round((camera.position.z - b.z) / a) * a;
    }
  }
}
