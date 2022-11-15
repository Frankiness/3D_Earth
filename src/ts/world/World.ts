import {
  MeshBasicMaterial, PerspectiveCamera, BufferGeometry, Vector3, LineBasicMaterial, Color, Points,
  Scene, ShaderMaterial, WebGLRenderer, Line,
} from "three";
import {
  OrbitControls
} from "three/examples/jsm/controls/OrbitControls";

// interfaces
import { IWord } from '../interfaces/IWorld'


import { Basic } from './Basic'
import Sizes from '../Utils/Sizes'
import { Resources } from './Resources';

// earth 
import Earth from './Earth'
import Data from './Data'

import { lon2xyz } from '../Utils/common'

type earthConfig = {
  radius: number,
  rotateSpeed: number,
  isRotation: boolean
}
type Params = {
  pointSize: number,
  pointColor: string,
  currentPos: number,
  pointSpeed: number
}

// shader
const vertexShader = `
  attribute float aOpacity;
  uniform float uSize;
  varying float vOpacity;
  void main(){
      gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
      gl_PointSize = uSize;
      vOpacity=aOpacity;
  }
  `;

const fragmentShader = `
  varying float vOpacity;
  uniform vec3 uColor;
  float invert(float n){
      return 1.-n;
  }
  void main(){
    if(vOpacity <=0.2){
        discard;
    }
    vec2 uv=vec2(gl_PointCoord.x,invert(gl_PointCoord.y));
    vec2 cUv=2.*uv-1.;
    vec4 color=vec4(1./length(cUv));
    color*=vOpacity;
    color.rgb*=uColor;
    gl_FragColor=color;
  }
  `;

export default class World {
  public basic: Basic;
  public scene: Scene;
  public camera: PerspectiveCamera;
  public renderer: WebGLRenderer
  public controls: OrbitControls;
  public sizes: Sizes;
  public material: ShaderMaterial | MeshBasicMaterial;
  public resources: Resources;
  public option: IWord;
  public earth: Earth;
  public earthConfig: earthConfig
  public lines: any[]
  public geometry: BufferGeometry
  public params: Params
  public points: Points
  public opacitys: Float32Array

  constructor(option: IWord) {
    /**
     * 加载资源
     */
    this.option = option

    this.basic = new Basic(option.dom)
    this.scene = this.basic.scene
    this.renderer = this.basic.renderer
    this.controls = this.basic.controls
    this.camera = this.basic.camera

    this.sizes = new Sizes({ dom: option.dom })
    this.earthConfig = {
      radius: 50,
      rotateSpeed: 0.002,
      isRotation: false
    }
    this.lines = []
    this.geometry = new BufferGeometry();
    this.params = {
      pointSize: 2.0,
      pointColor: '#4ec0e9',
      currentPos: 0,
      pointSpeed: 20,
    }

    this.points = new Points(this.geometry, new ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true, // 设置透明
      uniforms: {
        uSize: {
          value: this.params.pointSize,
        },
        uColor: {
          value: new Color(this.params.pointColor),
        },
      },
    }));

    this.sizes.$on('resize', () => {
      this.renderer.setSize(Number(this.sizes.viewport.width), Number(this.sizes.viewport.height))
      this.camera.aspect = Number(this.sizes.viewport.width) / Number(this.sizes.viewport.height)
      this.camera.updateProjectionMatrix()
    })

    this.resources = new Resources(async () => {
      await this.createEarth()

      this.earth.earthGroup.add(this.points)
      // 开始渲染
      this.render()
    })
  }



  async createEarth() {
    // 资源加载完成，开始制作地球，注释在new Earth()类型里面
    this.earth = new Earth({
      data: Data,
      dom: this.option.dom,
      textures: this.resources.textures,
      earth: this.earthConfig,
      satellite: {
        show: true,
        rotateSpeed: -0.01,
        size: 1,
        number: 2
      },
      punctuation: {
        circleColor: 0x3892ff,
        lightColumn: {
          startColor: 0xe4007f, // 起点颜色
          endColor: 0xffffff, // 终点颜色
        },
      },
      flyLine: {
        color: 0xf3ae76, // 飞线的颜色
        flyLineColor: 0xff7714, // 飞行线的颜色
        speed: 0.004, // 拖尾飞线的速度
      }
    })

    this.scene.add(this.earth.group)

    await this.earth.init()

    // 隐藏dom
    const loading = document.querySelector('#loading')
    loading.classList.add('out')

  }

  lineDraw(polygon: any[], color) {
    const lineGeometry = new BufferGeometry();
    const pointsArray: Vector3[] = [];
    let indexBol = true
    polygon.forEach((row: [number, number]) => {
      const { x, y, z } = lon2xyz(row[0], row[1], this.earthConfig.radius * 1.001);

      // 创建三维点
      pointsArray.push(new Vector3(x, y, z));

      if (indexBol) {
        this.lines.push([x, y, z]);
      }
    });
    indexBol = false;
    // 放入多个点
    lineGeometry.setFromPoints(pointsArray);

    const lineMaterial = new LineBasicMaterial({
      color: color,
    });
    return new Line(lineGeometry, lineMaterial);
  }

  lineFlow() {
    if (this.points && this.geometry.attributes.position) {
      this.params.currentPos += this.params.pointSpeed;
      for (let i = 0; i < this.params.pointSpeed; i++) {
        this.opacitys[(this.params.currentPos - i) % this.lines.length] = 0;
      }

      for (let i = 0; i < 200; i++) {
        this.opacitys[(this.params.currentPos + i) % this.lines.length] = i / 50 > 2 ? 2 : i / 50;
      }
      this.geometry.attributes.aOpacity.needsUpdate = true;
    }
  }

  /**
   * 渲染函数
   */
  public render() {
    requestAnimationFrame(this.render.bind(this))
    this.renderer.render(this.scene, this.camera)
    this.controls && this.controls.update()
    this.earth && this.earth.render()
    this.lineFlow()
  }
}