import {
  MeshBasicMaterial, PerspectiveCamera, BufferGeometry, Vector3, LineBasicMaterial, Color, Points,
  Scene, ShaderMaterial, WebGLRenderer, DoubleSide, Line, Group, Mesh, FileLoader, Float32BufferAttribute
} from "three";
import {
  OrbitControls
} from "three/examples/jsm/controls/OrbitControls";

// interfaces
import { IWord } from '../interfaces/IWorld'
import { IGeojson } from "../interfaces/IGeojson";

import { Basic } from './Basic'
import Sizes from '../Utils/Sizes'
import { Resources } from './Resources';

// earth 
import Earth from './Earth'
import Data from './Data'

import { lon2xyz } from '../Utils/common'
import { ShapeUtils } from '../Utils/ShapeUtils'

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


const mat = new MeshBasicMaterial({
  transparent: true,
  opacity: 0.7,
  color: "#87CEFA",
  side: DoubleSide, // FrontSide BackSide DoubleSide
  // depthWrite: false,
  // wireframe: true
});
const mat2 = new MeshBasicMaterial({
  transparent: true,
  opacity: 1.0,
  color: "#1E90FF",
  side: DoubleSide, // FrontSide BackSide DoubleSide
  // depthWrite: false,
  // wireframe: true
});

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
  public minLng = null
  public minLat = null
  public maxLng = null
  public maxLat = null
  public mainMapGroup = new Group();

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

      // 读取geojson
      const loader = new FileLoader();
      loader.load('json/world2.json', (data: string) => {
        const jsonData: IGeojson = JSON.parse(data);
        this.loadGeojson(jsonData);
      })
      this.earth.earthGroup.add(this.points)
      // 开始渲染
      this.render()
    })

    this.scene.add(this.mainMapGroup)
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


  /**
 * 绘制地图几何体
 */
  loadGeojson(mapJson: IGeojson) {
    const coor = this.getGeoExtent(mapJson.features);
    this.minLng = coor.minLng;
    this.minLat = coor.minLat;
    this.maxLng = coor.maxLng;
    this.maxLat = coor.maxLat;

    mapJson.features.forEach((feature) => {
      if (!feature.geometry) return;
      const coordinates = feature.geometry.coordinates;
      switch (feature.geometry.type) {
        case "Polygon":
          for (const points of coordinates) {
            const linePositions = [],
              _points = [],
              shapeVertices = [];
            for (const point of points) {
              const position = lon2xyz(point[0], point[1], 55);

              linePositions.push(position.x);
              linePositions.push(position.y);
              linePositions.push(position.z);
              _points.push([position.x, position.y, position.z]);
              shapeVertices.push(
                new Vector3(position.x, position.y, position.z)
              );
            }

            this.mainMapGroup.add(
              new Mesh(this.edgeFence(_points, 0.9, 1), mat)
            );
            this.mainMapGroup.add(new Mesh(this.edgeFence(_points, 1, 1.02), mat2))
            this.mainMapGroup.add(
              new Mesh(this.customPlaneGeometry(shapeVertices), mat)
            );
          }

          break;
        case "MultiPolygon":
          for (const coordinate of coordinates) {
            for (const points of coordinate) {
              const linePositions = [],
                _points = [],
                shapeVertices = [];
              for (const point of points) {
                const position = lon2xyz(point[0], point[1], 55);
                linePositions.push(position.x);
                linePositions.push(position.y);
                linePositions.push(position.z);

                _points.push([position.x, position.y, position.z]);
                shapeVertices.push(
                  new Vector3(position.x, position.y, position.z)
                );
              }

              this.mainMapGroup.add(
                new Mesh(this.edgeFence(_points, 0.9, 1), mat)
              );
              this.mainMapGroup.add(new Mesh(this.edgeFence(_points, 1, 1.02), mat2))
              this.mainMapGroup.add(
                new Mesh(this.customPlaneGeometry(shapeVertices), mat)
              );
            }
          }

          break;
        default:
          break;
      }
    });
  }
  getGeoExtent(features) {
    // 计算数据的最大最小经纬度、最大最小墨卡托坐标以及墨卡托坐标的的多变形数组
    let minLng = 180,
      maxLng = -180,
      minLat = 90,
      maxLat = -90;

    for (const feature of features) {
      if (feature.geometry) {
        if (feature.geometry.type === "Polygon") {
          for (const points of feature.geometry.coordinates) {
            for (const point of points) {
              minLng = minLng < point[0] ? minLng : point[0];
              maxLng = maxLng > point[0] ? maxLng : point[0];
              minLat = minLat < point[1] ? minLat : point[1];
              maxLat = maxLat > point[1] ? maxLat : point[1];
            }
          }
        } else if (feature.geometry.type === "MultiPolygon") {
          for (const polygonPoints of feature.geometry.coordinates) {
            for (const points of polygonPoints) {
              for (const point of points) {
                minLng = minLng < point[0] ? minLng : point[0];
                maxLng = maxLng > point[0] ? maxLng : point[0];
                minLat = minLat < point[1] ? minLat : point[1];
                maxLat = maxLat > point[1] ? maxLat : point[1];
              }
            }
          }
        }
      }
    }
    return { minLng, minLat, maxLng, maxLat };
  }
  edgeFence(points, scaleIn, scaleOut) {
    const vertices = []; // 顶点数组
    const indices = []; // 索引数组
    const uv = [];
    let index = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const position = points[i];

      vertices.push(position[0] * scaleOut);
      vertices.push(position[1] * scaleOut);
      vertices.push(position[2] * scaleOut);
      indices.push(index);
      indices.push(index + 1);
      indices.push(index + 2);
      uv.push(0);
      uv.push(0);
      index++;

      vertices.push(position[0] * scaleIn);
      vertices.push(position[1] * scaleIn);
      vertices.push(position[2] * scaleIn);
      indices.push(index + 2);
      indices.push(index + 1);
      indices.push(index);
      uv.push(0);
      uv.push(1);
      index++;
    }

    const position = points[points.length - 1];

    vertices.push(position[0] * scaleOut);
    vertices.push(position[1] * scaleOut);
    vertices.push(position[2] * scaleOut);
    uv.push(0);
    uv.push(0);

    vertices.push(position[0] * scaleIn);
    vertices.push(position[1] * scaleIn);
    vertices.push(position[2] * scaleIn);


    uv.push(0);
    uv.push(1);

    const geometry = new BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(vertices, 3)
    );

    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    return geometry;
  }

  /**
   * 定义几何体表面材质
   * @param shapeVertices 
   * @returns 
   */
  customPlaneGeometry(shapeVertices) {
    const geometry = new BufferGeometry();

    const indices = [];
    const vertices = [];
    // const normals = [];
    // const uvs = [];

    for (let i = 0, l = shapeVertices.length; i < l; i++) {
      const vertex = shapeVertices[i];

      vertices.push(vertex.x, vertex.y, vertex.z);
      // normals.push( 0, 0, 1 );
      // uvs.push( vertex.x, vertex.y ); // world uvs
    }

    const faces = ShapeUtils.triangulateShape(shapeVertices, []);
    for (let i = 0, l = faces.length; i < l; i++) {
      const face = faces[i];
      const a = face[0];
      const b = face[1];
      const c = face[2];
      indices.push(a, b, c);
    }


    geometry.setIndex(indices);
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(vertices, 3)
    );


    // geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
    // geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );

    return geometry;
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