import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, NormalBlending,
  Object3D, Matrix4, Quaternion, Euler, Line, LineBasicMaterial, FileLoader,
  Points, PointsMaterial, Ray, ShaderMaterial, CubicBezierCurve3,
  SphereBufferGeometry, Sprite, SpriteMaterial, Texture, TextureLoader, Vector3
} from "three";

import html2canvas from "html2canvas";

import earthVertex from '../../shaders/earth/vertex.vs';
import earthFragment from '../../shaders/earth/fragment.fs';
import { createAnimateLine, createLightPillar, createPointMesh, createWaveMesh, getCirclePoints, lon2xyz } from "../Utils/common";
import gsap from "gsap";
import { flyArc } from "../Utils/arc";
import { IGeojson } from "../interfaces/IGeojson";
import { WorldShape } from './WorldShape'


export type punctuation = {
  circleColor: number,
  lightColumn: {
    startColor: number, // 起点颜色
    endColor: number, // 终点颜色
  },
}

type options = {
  data: {
    startArray: {
      name: string,
      E: number, // 经度
      N: number, // 维度
    },
    endArray: {
      name: string,
      E: number, // 经度
      N: number, // 维度
    }[]
  }[]
  dom: HTMLElement,
  textures: Record<string, Texture>, // 贴图
  earth: {
    radius: number, // 地球半径
    rotateSpeed: number, // 地球旋转速度
    isRotation: boolean // 地球组是否自转
  }
  satellite: {
    show: boolean, // 是否显示卫星
    rotateSpeed: number, // 旋转速度
    size: number, // 卫星大小
    number: number, // 一个圆环几个球
  },
  punctuation: punctuation,
  flyLine: {
    color: number, // 飞线的颜色
    speed: number, // 飞机拖尾线速度
    flyLineColor: number // 飞行线的颜色
  },
}
type uniforms = {
  glowColor: { value: Color; }
  scale: { type: string; value: number; }
  bias: { type: string; value: number; }
  power: { type: string; value: number; }
  time: { type: string; value: any; }
  isHover: { value: boolean; };
  map: { value: Texture }
}
export default class earth {

  public group: Group;
  public earthGroup: Group;

  public around: BufferGeometry
  public aroundPoints: Points<BufferGeometry, PointsMaterial>;

  public options: options;
  public uniforms: uniforms
  public timeValue: number;

  public earth: Mesh<SphereBufferGeometry, ShaderMaterial>;
  public punctuationMaterial: MeshBasicMaterial;
  public markupPoint: Group;
  public waveMeshArr: Object3D[];

  public circleLineList: any[];
  public circleList: any[];
  public x: number;
  public n: number;
  public isRotation: boolean;
  public flyLineArcGroup: Group;
  public loopTime: number
  public model: any
  public curveCollection: CubicBezierCurve3[]
  public spritesCollection: Sprite[]

  constructor(options: options) {

    this.options = options;

    this.group = new Group()
    this.group.name = "group";
    this.group.scale.set(0, 0, 0)
    this.earthGroup = new Group()
    this.group.add(this.earthGroup)
    this.earthGroup.name = "EarthGroup";

    // 标注点效果
    this.markupPoint = new Group()
    this.markupPoint.name = "markupPoint"
    this.waveMeshArr = []

    // 卫星和标签
    this.circleLineList = []
    this.circleList = [];
    this.x = 0;
    this.n = 0;

    // 地球自转
    this.isRotation = this.options.earth.isRotation

    // 扫光动画 shader
    this.timeValue = 100
    this.uniforms = {
      glowColor: {
        value: new Color(0x0cd1eb),
      },
      scale: {
        type: "f",
        value: -1.0,
      },
      bias: {
        type: "f",
        value: 1.0,
      },
      power: {
        type: "f",
        value: 3.3,
      },
      time: {
        type: "f",
        value: this.timeValue,
      },
      isHover: {
        value: false,
      },
      map: {
        value: null,
      },
    };

    this.loopTime = 10 * 1000
    this.curveCollection = []
    this.spritesCollection = []

  }

  async init(): Promise<void> {
    return new Promise(async (resolve) => {

      this.createEarth(); // 创建地球
      this.createStars(); // 添加星星
      this.createLandShape() //添加陆地形状

      this.createEarthGlow() // 创建地球辉光
      this.createEarthAperture() // 创建地球的大气层
      await this.createMarkupPoint() // 创建柱状点位
      await this.createSpriteLabel() // 创建标签
      this.createAnimateCircle() // 创建环绕卫星
      this.createFlyLine() // 创建飞线

      this.show()
      resolve()
    })
  }

  createEarth() {
    this.uniforms.map.value = this.options.textures.earth;

    //地球外层遮罩
    // const earth_border = new SphereBufferGeometry(
    //   this.options.earth.radius + 10,
    //   60,
    //   60
    // );

    // const pointMaterial = new PointsMaterial({
    //   color: 0x81ffff, //设置颜色，默认 0xFFFFFF
    //   transparent: true,
    //   sizeAttenuation: true,
    //   opacity: 0.1,
    //   vertexColors: false, //定义材料是否使用顶点颜色，默认false ---如果该选项设置为true，则color属性失效
    //   size: 0.01, //定义粒子的大小。默认为1.0
    // })
    // const points = new Points(earth_border, pointMaterial);
    // this.earthGroup.add(points);

    const earth_geometry = new SphereBufferGeometry(
      this.options.earth.radius,
      50,
      50
    );
    const earth_material = new ShaderMaterial({
      // wireframe: true, // 显示模型线条
      uniforms: this.uniforms,
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
    });

    earth_material.needsUpdate = true;
    this.earth = new Mesh(earth_geometry, earth_material);
    this.earth.name = "earth";
    this.earthGroup.add(this.earth);

  }


  createStars() {
    const vertices = []
    const colors = []
    for (let i = 0; i < 500; i++) {
      const vertex = new Vector3();
      vertex.x = 800 * Math.random() - 300;
      vertex.y = 800 * Math.random() - 300;
      vertex.z = 800 * Math.random() - 300;
      vertices.push(vertex.x, vertex.y, vertex.z);
      colors.push(new Color(1, 1, 1));
    }

    // 星空效果
    this.around = new BufferGeometry()
    this.around.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
    this.around.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));

    const aroundMaterial = new PointsMaterial({
      size: 2,
      sizeAttenuation: true, // 尺寸衰减
      color: 0x4d76cf,
      transparent: true,
      opacity: 1,
      map: this.options.textures.gradient,
    });

    this.aroundPoints = new Points(this.around, aroundMaterial);
    this.aroundPoints.name = "星空";
    this.aroundPoints.scale.set(1, 1, 1);
    this.group.add(this.aroundPoints);
  }

  createEarthGlow() {
    const R = this.options.earth.radius; //地球半径

    // TextureLoader创建一个纹理加载器对象，可以加载图片作为纹理贴图
    const texture = this.options.textures.glow; // 加载纹理贴图

    // 创建精灵材质对象SpriteMaterial
    const spriteMaterial = new SpriteMaterial({
      map: texture, // 设置精灵纹理贴图
      color: 0x4390d1,
      transparent: true, //开启透明
      opacity: 0.7, // 可以通过透明度整体调节光圈
      depthWrite: false, //禁止写入深度缓冲区数据
    });

    // 创建表示地球光圈的精灵模型
    const sprite = new Sprite(spriteMaterial);
    sprite.scale.set(R * 3.0, R * 3.0, 1); //适当缩放精灵
    this.earthGroup.add(sprite);
  }

  createEarthAperture() {
    const vertexShader = [
      "varying vec3	vVertexWorldPosition;",
      "varying vec3	vVertexNormal;",
      "varying vec4	vFragColor;",
      "void main(){",
      "	vVertexNormal	= normalize(normalMatrix * normal);", //将法线转换到视图坐标系中
      "	vVertexWorldPosition	= (modelMatrix * vec4(position, 1.0)).xyz;", //将顶点转换到世界坐标系中
      "	// set gl_Position",
      "	gl_Position	= projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}",
    ].join("\n");

    //大气层效果
    const AeroSphere = {
      uniforms: {
        coeficient: {
          type: "f",
          value: 1.0,
        },
        power: {
          type: "f",
          value: 3,
        },
        glowColor: {
          type: "c",
          value: new Color(0x4390d1),
        },
      },
      vertexShader: vertexShader,
      fragmentShader: [
        "uniform vec3	glowColor;",
        "uniform float	coeficient;",
        "uniform float	power;",

        "varying vec3	vVertexNormal;",
        "varying vec3	vVertexWorldPosition;",

        "varying vec4	vFragColor;",

        "void main(){",
        "	vec3 worldCameraToVertex = vVertexWorldPosition - cameraPosition;", //世界坐标系中从相机位置到顶点位置的距离
        "	vec3 viewCameraToVertex	= (viewMatrix * vec4(worldCameraToVertex, 0.0)).xyz;", //视图坐标系中从相机位置到顶点位置的距离
        "	viewCameraToVertex= normalize(viewCameraToVertex);", //规一化
        "	float intensity	= pow(coeficient + dot(vVertexNormal, viewCameraToVertex), power);",
        "	gl_FragColor = vec4(glowColor, intensity);",
        "}",
      ].join("\n"),
    };
    //球体 辉光 大气层
    const material1 = new ShaderMaterial({
      uniforms: AeroSphere.uniforms,
      vertexShader: AeroSphere.vertexShader,
      fragmentShader: AeroSphere.fragmentShader,
      blending: NormalBlending,
      transparent: true,
      depthWrite: false,
    });
    const sphere = new SphereBufferGeometry(
      this.options.earth.radius + 0,
      50,
      50
    );
    const mesh = new Mesh(sphere, material1);
    this.earthGroup.add(mesh);
  }

  async createMarkupPoint() {

    await Promise.all(this.options.data.map(async (item) => {

      const radius = this.options.earth.radius;
      const lon = item.startArray.E; //经度
      const lat = item.startArray.N; //纬度

      this.punctuationMaterial = new MeshBasicMaterial({
        color: this.options.punctuation.circleColor,
        map: this.options.textures.label,
        transparent: true, //使用背景透明的png贴图，注意开启透明计算
        depthWrite: false, //禁止写入深度缓冲区数据
      });

      const mesh = createPointMesh({ radius, lon, lat, material: this.punctuationMaterial }); //光柱底座矩形平面
      this.markupPoint.add(mesh);
      const LightPillar = createLightPillar({
        radius: this.options.earth.radius,
        lon,
        lat,
        index: 0,
        textures: this.options.textures,
        punctuation: this.options.punctuation,
      }); //光柱
      this.markupPoint.add(LightPillar);
      const WaveMesh = createWaveMesh({ radius, lon, lat, textures: this.options.textures }); //波动光圈
      this.markupPoint.add(WaveMesh);
      this.waveMeshArr.push(WaveMesh);

      await Promise.all(item.endArray.map((obj) => {
        const lon = obj.E; //经度
        const lat = obj.N; //纬度
        const mesh = createPointMesh({ radius, lon, lat, material: this.punctuationMaterial }); //光柱底座矩形平面
        this.markupPoint.add(mesh);
        const LightPillar = createLightPillar({
          radius: this.options.earth.radius,
          lon,
          lat,
          index: 1,
          textures: this.options.textures,
          punctuation: this.options.punctuation
        }); //光柱
        this.markupPoint.add(LightPillar);
        const WaveMesh = createWaveMesh({ radius, lon, lat, textures: this.options.textures }); //波动光圈
        this.markupPoint.add(WaveMesh);
        this.waveMeshArr.push(WaveMesh);
      }))
      this.earthGroup.add(this.markupPoint)
    }))
  }

  /**
   * 创建精灵图标签
   */
  async createSpriteLabel() {
    await Promise.all(this.options.data.map(async item => {
      let cityArry = [];
      cityArry.push(item.startArray);
      cityArry = cityArry.concat(...item.endArray);
      await Promise.all(cityArry.map(async e => {
        const p = lon2xyz(e.E, e.N, this.options.earth.radius * 1.001);
        const div = `<div class="fire-div">${e.name}</div>`;
        const shareContent = document.getElementById("html2canvas");
        shareContent.innerHTML = div;
        const opts = {
          backgroundColor: null, // 背景透明
          scale: 6,
          dpi: window.devicePixelRatio,
        };
        const canvas = await html2canvas(document.getElementById("html2canvas"), opts)
        const dataURL = canvas.toDataURL("image/png");
        const map = new TextureLoader().load(dataURL);
        const material = new SpriteMaterial({
          map: map,
          transparent: true,
        });
        const sprite = new Sprite(material);
        const len = 5 + (e.name.length - 2) * 2;
        sprite.scale.set(len, 3, 1);
        sprite.position.set(p.x * 1.1, p.y * 1.1, p.z * 1.1);
        this.earth.add(sprite);
      }))
    }))
  }

  createAnimateCircle() {
    // 创建 圆环 点
    const list = getCirclePoints({
      radius: this.options.earth.radius + 15,
      number: 150, //切割数
      closed: true, // 闭合
    });
    const mat = new MeshBasicMaterial({
      color: "#0c3172",
      transparent: true,
      opacity: 0.4,
      side: DoubleSide,
    });
    const line = createAnimateLine({
      pointList: list,
      material: mat,
      number: 100,
      radius: 0.1,
    });
    this.earthGroup.add(line);

    // 在clone两条线出来
    const l2 = line.clone();
    l2.scale.set(1.2, 1.2, 1.2);
    l2.rotateZ(Math.PI / 6);
    this.earthGroup.add(l2);

    const l3 = line.clone();
    l3.scale.set(0.8, 0.8, 0.8);
    l3.rotateZ(-Math.PI / 6);
    this.earthGroup.add(l3);

    /**
     * 旋转的球
     */
    const ball = new Mesh(
      new SphereBufferGeometry(this.options.satellite.size, 32, 32),
      new MeshBasicMaterial({
        color: "#e0b187", // 745F4D
      })
    );

    const ball2 = new Mesh(
      new SphereBufferGeometry(this.options.satellite.size, 32, 32),
      new MeshBasicMaterial({
        color: "#628fbb", // 324A62
      })
    );

    const ball3 = new Mesh(
      new SphereBufferGeometry(this.options.satellite.size, 32, 32),
      new MeshBasicMaterial({
        color: "#806bdf", //6D5AC4
      })
    );

    this.circleLineList.push(line, l2, l3);
    ball.name = ball2.name = ball3.name = "卫星";

    for (let i = 0; i < this.options.satellite.number; i++) {
      const ball01 = ball.clone();
      // 一根线上总共有几个球，根据数量平均分布一下
      const num = Math.floor(list.length / this.options.satellite.number)
      ball01.position.set(
        list[num * (i + 1)][0] * 1,
        list[num * (i + 1)][1] * 1,
        list[num * (i + 1)][2] * 1
      );
      line.add(ball01);

      const ball02 = ball2.clone();
      const num02 = Math.floor(list.length / this.options.satellite.number)
      ball02.position.set(
        list[num02 * (i + 1)][0] * 1,
        list[num02 * (i + 1)][1] * 1,
        list[num02 * (i + 1)][2] * 1
      );
      l2.add(ball02);

      const ball03 = ball2.clone();
      const num03 = Math.floor(list.length / this.options.satellite.number)
      ball03.position.set(
        list[num03 * (i + 1)][0] * 1,
        list[num03 * (i + 1)][1] * 1,
        list[num03 * (i + 1)][2] * 1
      );
      l3.add(ball03);
    }
  }
  /**
   * 加载飞机的精灵图
   */
  createPlaneSprite(): Sprite {
    const map = new TextureLoader().load('/images/earth/aircraft.png')
    const mat = new SpriteMaterial({ map: map })
    const sprite = new Sprite(mat)
    sprite.scale.set(10, 10, 10)

    return sprite
  }

  /**
   * 添加飞机飞行线路
   * @param radius 地球半径
   * @param lon1 起点经度
   * @param lat1 起点纬度
   * @param lon2 终点经度
   * @param lat2 终点纬度
   */
  createPlaneLine(radius: number, lon1: number, lat1: number, lon2: number, lat2: number) {
    const v0 = lon2xyz(lon1, lat1, radius)
    const v3 = lon2xyz(lon2, lat2, radius)
    const getLenVcetor = (v1: Vector3, v2: Vector3, len: number): Vector3 => {
      const v1v2Len = v1.distanceTo(v2);
      return v1.lerp(v2, len / v1v2Len);
    }
    const getVCenter = (v1: Vector3, v2: Vector3): Vector3 => {
      const v = v1.add(v2);
      return v.divideScalar(2);
    }

    // 夹角
    const angle = (v0.angleTo(v3) * 1.8) / Math.PI / 0.1; // 0 ~ Math.PI
    const aLen = angle * 3 // 角度越大，曲线弧度越大
    const hLen = angle * angle * 10;
    const p0 = new Vector3(0, 0, 0);
    // 法线向量
    const rayLine = new Ray(p0, getVCenter(v0.clone(), v3.clone()));
    // 顶点坐标
    const vtop = rayLine.at(hLen / rayLine.at(1, new Vector3()).distanceTo(p0), new Vector3());
    // 控制点坐标
    const v1 = getLenVcetor(v0.clone(), vtop, aLen);
    const v2 = getLenVcetor(v3.clone(), vtop, aLen);
    // 绘制三维三次贝赛尔曲线
    const planeCurve = new CubicBezierCurve3(v0, v1, v2, v3);
    const geometry = new BufferGeometry();
    const points = planeCurve.getPoints(50);

    geometry.setFromPoints(points);
    const matLine = new LineBasicMaterial({
      color: 0x00ff00
    });

    const planeLine = new Line(geometry, matLine)

    const sprite = this.createPlaneSprite()
    this.earthGroup.add(sprite)

    return { planeLine, planeCurve, sprite }
  }

  // 飞机移动函数
  moveAirplane() {
    for (let i = 0; i < this.spritesCollection.length; i++) {
      const time = Date.now();
      const t = (time % this.loopTime) / this.loopTime; // 计算当前时间进度百分比
      const position = this.curveCollection[i].getPoint(t);
      const sprite = this.spritesCollection[i]
      if (position?.x && sprite) {
        this.handlePlanePosition(position, sprite)
      }
    }
  }

  createFlyLine() {
    this.flyLineArcGroup = new Group();
    this.flyLineArcGroup.userData['flyLineArray'] = []
    this.earthGroup.add(this.flyLineArcGroup)

    this.options.data.forEach((cities, index) => {
      if (index % 2 === 0) {
        cities.endArray.forEach(item => {
          // 调用函数flyArc绘制球面上任意两点之间飞线圆弧轨迹
          const arcline = flyArc(
            this.options.earth.radius,
            cities.startArray.E,
            cities.startArray.N,
            item.E,
            item.N,
            this.options.flyLine
          );

          const { planeLine, planeCurve, sprite } = this.createPlaneLine(
            this.options.earth.radius,
            cities.startArray.E,
            cities.startArray.N,
            item.E,
            item.N
          )

          this.spritesCollection.push(sprite) //添加sprite
          this.curveCollection.push(planeCurve) //添加curve
          this.flyLineArcGroup.add(planeLine);

          this.flyLineArcGroup.add(arcline); // 飞线插入flyArcGroup中
          this.flyLineArcGroup.userData['flyLineArray'].push(arcline.userData['flyLine'])
        });
      }


    })
  }

  /**
   * 根据Geojson创建陆地形状
   */
  createLandShape() {
    // 读取geojson
    const loader = new FileLoader();
    loader.load('json/world2.json', (data: string) => {
      const jsonData: IGeojson = JSON.parse(data);

      // 添加世界地图几何体
      const shape = new WorldShape()
      const worldGeometry = shape.loadGeojson(jsonData)

      this.earthGroup.add(worldGeometry)
    })
  }

  show() {
    gsap.to(this.group.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 2,
      ease: "Quadratic",
    })
  }
  /**
   * 实时更新飞机位置
   * @param position xyz位置
   * @param sprite 精灵图对象
   */
  handlePlanePosition(position: Vector3, sprite: Sprite) {
    //模型的偏移量
    const offsetAngle = Math.PI;
    //创建一个4维矩阵
    const mtx = new Matrix4();
    mtx.lookAt(sprite.position.clone(), position, sprite.up);
    mtx.multiply(new Matrix4().makeRotationFromEuler(new Euler(0, offsetAngle, 0)));
    //计算出需要进行旋转的四元数值
    const toRot = new Quaternion().setFromRotationMatrix(mtx);
    //根据以上值调整角度
    sprite.quaternion.slerp(toRot, 0.2);
    sprite.position.set(position.x, position.y, position.z);
  }

  render() {
    this.moveAirplane()

    this.flyLineArcGroup?.userData['flyLineArray']?.forEach(fly => {
      fly.rotation.z += this.options.flyLine.speed; // 调节飞线速度
      if (fly.rotation.z >= fly.flyEndAngle) fly.rotation.z = 0;
    })

    if (this.isRotation) {
      this.earthGroup.rotation.y += this.options.earth.rotateSpeed;
    }

    this.circleLineList.forEach((e) => {
      e.rotateY(this.options.satellite.rotateSpeed);
    });

    this.uniforms.time.value =
      this.uniforms.time.value < -this.timeValue
        ? this.timeValue
        : this.uniforms.time.value - 1;

    if (this.waveMeshArr.length) {
      this.waveMeshArr.forEach((mesh: Mesh) => {
        mesh.userData['scale'] += 0.007;
        mesh.scale.set(
          mesh.userData['size'] * mesh.userData['scale'],
          mesh.userData['size'] * mesh.userData['scale'],
          mesh.userData['size'] * mesh.userData['scale']
        );
        if (mesh.userData['scale'] <= 1.5) {
          (mesh.material as Material).opacity = (mesh.userData['scale'] - 1) * 2; //2等于1/(1.5-1.0)，保证透明度在0~1之间变化
        } else if (mesh.userData['scale'] > 1.5 && mesh.userData['scale'] <= 2) {
          (mesh.material as Material).opacity = 1 - (mesh.userData['scale'] - 1.5) * 2; //2等于1/(2.0-1.5) mesh缩放2倍对应0 缩放1.5被对应1
        } else {
          mesh.userData['scale'] = 1;
        }
      });
    }
  }
}