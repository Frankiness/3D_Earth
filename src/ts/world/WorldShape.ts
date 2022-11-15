import { lon2xyz } from '../Utils/common'
import { ShapeUtils } from '../Utils/ShapeUtils'
import {
  BufferGeometry, Vector3, Group, Mesh, Float32BufferAttribute
} from "three";
import { IGeojson } from "../interfaces/IGeojson";
import { Province } from './Material';


/**
* 绘制地图几何体
*/
export class WorldShape {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number

  loadGeojson(mapJson: IGeojson) {
    const mainMapGroup = new Group()
    const coor = this.getGeoExtent(mapJson.features);
    this.minLng = coor.minLng;
    this.minLat = coor.minLat;
    this.maxLng = coor.maxLng;
    this.maxLat = coor.maxLat;

    // 根据points创建国家几何体
    const createShape = (points: number[][], shapeVertices: Vector3[]) => {
      // 表面
      const countryShape = new Mesh(this.edgeFence(points, 0.9, 1), Province.shaderMaterial())
      countryShape.name = 'country'
      mainMapGroup.add(countryShape);
      mainMapGroup.add(new Mesh(this.edgeFence(points, 1, 1.01), Province.basicMaterial()));

      // 侧面
      const sideShape = new Mesh(this.customPlaneGeometry(shapeVertices), Province.basicMaterial())
      sideShape.name = 'side'
      mainMapGroup.add(sideShape);
    }

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
              const position = lon2xyz(point[0], point[1], 52);

              linePositions.push(position.x);
              linePositions.push(position.y);
              linePositions.push(position.z);
              _points.push([position.x, position.y, position.z]);
              shapeVertices.push(
                new Vector3(position.x, position.y, position.z)
              );
            }

            createShape(_points, shapeVertices)
          }

          break;
        case "MultiPolygon":
          for (const coordinate of coordinates) {
            for (const points of coordinate) {
              const linePositions: number[] = [],
                _points: number[][] = [],
                shapeVertices = [];
              for (const point of points) {
                const position = lon2xyz(point[0], point[1], 52);
                linePositions.push(position.x);
                linePositions.push(position.y);
                linePositions.push(position.z);

                _points.push([position.x, position.y, position.z]);
                shapeVertices.push(
                  new Vector3(position.x, position.y, position.z)
                );
              }


              createShape(_points, shapeVertices)
            }
          }

          break;
        default:
          break;
      }
    });

    return mainMapGroup
  }
  getGeoExtent(features: any[]) {
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

  /**
   * 绘制国家
   * @param points 
   * @param scaleIn 控制大小
   * @param scaleOut 控制大小
   * @returns 
   */
  edgeFence(points: number[][], scaleIn: number, scaleOut: number) {
    const vertices: number[] = []; // 顶点数组
    const indices: number[] = []; // 索引数组
    const uv: number[] = [];
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
  customPlaneGeometry(shapeVertices: Vector3[]) {
    const geometry = new BufferGeometry();

    const indices: number[] = [];
    const vertices: number[] = [];
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
}