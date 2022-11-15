import { MeshBasicMaterial, DoubleSide, ShaderMaterial, Color, Vector3 } from 'three'

const VertexShader = `
uniform vec3 view_vector; // 视角
varying vec3 vNormal; // 法线
varying vec3 vPositionNormal;
void main() {
  vNormal = normalize( normalMatrix * normal ); // 转换到视图空间
  vPositionNormal = normalize(normalMatrix * view_vector);
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
const FragmentShader = `
uniform vec3 glowColor;
uniform float b;
uniform float p;
uniform float s;
varying vec3 vNormal;
varying vec3 vPositionNormal;
void main() {
  float a = pow(b + s * abs(dot(vNormal, vPositionNormal)), p );
  gl_FragColor = vec4( glowColor, a );
}
`

export class Province {
  static basicMaterial() {
    return new MeshBasicMaterial({
      transparent: true,
      opacity: 0.7,
      color: "#87CEFA",
      side: DoubleSide, // FrontSide BackSide DoubleSide
      // depthWrite: false,
      // wireframe: true
    })
  }
  static shaderMaterial() {
    return new ShaderMaterial({
      uniforms: {
        s: { value: -1.0 },
        b: { value: 1.0 },
        p: { value: 2.0 },
        glowColor: { value: new Color(0x00ffff) },
        view_vector: { value: new Vector3(0, 0, 1) },
      },
      vertexShader: VertexShader,
      fragmentShader: FragmentShader,
      side: DoubleSide,
      // blending: AdditiveBlending,
      // transparent: true
    })
  }
}