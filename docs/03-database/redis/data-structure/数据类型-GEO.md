# 数据类型-GEO

## 核心概念

Redis GEO 是 Redis 3.2 新增的数据类型，用于存储地理位置信息并支持附近位置查询。原有关键点：GEO 并没有设计全新的底层结构，而是复用 Sorted Set。Redis 使用 GeoHash 将经纬度编码成一维值，作为 ZSet 的 score 存储，从而利用 ZSet 的有序范围能力完成 LBS（Location Based Service）附近搜索。

常用命令包括 `GEOADD`、`GEOPOS`、`GEODIST`、`GEOHASH`、`GEOSEARCH`、`GEOSEARCHSTORE`。旧版本常见 `GEORADIUS`/`GEORADIUSBYMEMBER`，新版本更推荐 `GEOSEARCH`。经度范围是 -180 到 180，纬度范围是 -85.05112878 到 85.05112878。

## 面试官想考什么

- 是否知道 GEO 底层是 ZSet + GeoHash，而不是独立结构。
- 是否理解附近查询的大致原理和精度限制。
- 是否能设计门店附近搜索、司机派单、附近的人等场景。
- 是否知道 GEO 不适合复杂 GIS，多条件过滤要配合数据库或搜索引擎。

## 标准回答

GEO 用于保存 member 的经纬度并做距离计算、附近搜索。写入时 Redis 将经纬度编码成 GeoHash score 存进 ZSet；查询附近位置时，根据中心点和半径找到相邻 GeoHash 区域，再计算距离并返回结果。它适合轻量 LBS 场景，比如查附近门店、附近车辆。

面试时要补充边界：Redis GEO 主要解决“按距离粗筛 + 排序返回”，不支持复杂多边形、路线规划、行政区划、空间索引组合查询；如果需要复杂 GIS，应使用 PostGIS、Elasticsearch geo 或专业地图服务。

## 深挖追问

1. **为什么 GEO 可以用 ZSet 实现？** GeoHash 把二维经纬度映射为一维有序编码，ZSet 按 score 排序后可以做范围搜索。
2. **GEO 查询结果一定精确吗？** 半径查询会先按 GeoHash 邻域粗筛，再计算距离；存在精度和边界处理，适合业务近似查询。
3. **如何按城市隔离 key？** 可以用 `geo:shop:shanghai`、`geo:driver:hangzhou`，减少单 key 规模。
4. **GEO 和数据库空间索引怎么选？** Redis 适合高频读的缓存/实时位置，数据库空间索引适合权威存储和复杂查询。

## 实战场景 / 代码示例

```bash
# 添加门店坐标：经度 纬度 member
GEOADD geo:shop:shanghai 121.4737 31.2304 shop:1
GEOADD geo:shop:shanghai 121.4998 31.2397 shop:2

# 查询当前位置 3 公里内最近门店
GEOSEARCH geo:shop:shanghai FROMLONLAT 121.48 31.23 BYRADIUS 3 km WITHDIST ASC COUNT 10

# 查询两个门店距离
GEODIST geo:shop:shanghai shop:1 shop:2 km
```

实战中通常把 Redis GEO 返回的 shopId 作为候选集，再批量查 MySQL/缓存补充营业状态、品类、价格等业务字段。

## 易错点 / 总结

- 经纬度顺序是“经度 longitude 在前，纬度 latitude 在后”，写反会查不到或位置漂移。
- 单个 GEO key 过大时附近查询和维护成本会上升，应按城市、业务或分片拆分。
- GEO 不是完整 GIS，复杂空间关系不要硬塞给 Redis。
- 实时位置要设置清理策略，离线司机/设备要及时 `ZREM`。
- 总结：GEO 的关键词是**经纬度、GeoHash、ZSet、附近搜索**；面试要答出底层实现、适用场景和复杂 GIS 边界。
