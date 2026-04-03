# Redis 数据类型详解

## 一、Redis 数据类型概览

### 1.1 五种基本数据类型

| 类型 | 说明 | 底层实现 | 应用场景 |
|------|------|----------|----------|
| String | 字符串 | SDS | 缓存、计数器、分布式锁 |
| List | 列表 | QuickList | 消息队列、时间线 |
| Hash | 哈希表 | Dict + ZipList | 对象存储、购物车 |
| Set | 集合 | Dict + Intset | 标签、共同关注 |
| ZSet | 有序集合 | SkipList + Dict | 排行榜、优先队列 |

### 1.2 底层数据结构

Redis 使用以下底层结构实现上述数据类型：

- **SDS (Simple Dynamic String)**：简单动态字符串
- **LinkedList**：双向链表
- **Dict**：哈希表/字典
- **SkipList**：跳跃表
- **Intset**：整数集合
- **ZipList**：压缩列表（Redis 7.0 后被 ListPack 取代）
- **QuickList**：快速列表（LinkedList + ZipList 结合）

---

## 二、String（字符串）

### 2.1 特点

- **二进制安全**：可以存储任意数据（字符串、整数、浮点数、图片base64等）
- **最大大小**：512MB
- **底层实现**：SDS（Simple Dynamic String）

### 2.2 SDS vs C 字符串

| 特性 | C 字符串 | SDS |
|------|----------|-----|
| 获取长度 | O(N) | O(1) |
| 缓冲区溢出 | 可能溢出 | 安全，自动扩容 |
| 二进制安全 | 否 | 是 |
| 内存重分配 | 每次修改都需要 | 预分配 + 惰性释放 |

### 2.3 常用命令

```bash
# 基本操作
SET key value
GET key
DEL key
EXISTS key

# 批量操作
MSET key1 value1 key2 value2
MGET key1 key2

# 计数器
INCR key      # 递增
DECR key      # 递减
INCRBY key 10
DECRBY key 10

# 过期时间
SETEX key 60 value   # 设置值并设置过期时间
EXPIRE key 60        # 设置过期时间
TTL key              # 查看剩余过期时间

# 条件设置
SETNX key value      # key 不存在时才设置
```

### 2.4 应用场景

**1. 缓存**
```java
// 存储序列化对象
String userJson = JSON.toJSONString(user);
jedis.set("user:" + userId, userJson);
jedis.expire("user:" + userId, 3600);  // 1小时过期

// 读取缓存
String cached = jedis.get("user:" + userId);
if (cached != null) {
    return JSON.parseObject(cached, User.class);
}
```

**2. 计数器**
```java
// 页面访问计数
jedis.incr("page:view:" + pageId);

// 用户请求数（限流）
long count = jedis.incr("rate:" + userId + ":" + currentMinute);
if (count > 100) {
    throw new RateLimitException("请求过于频繁");
}
```

**3. 分布式锁（简单版）**
```java
// 加锁
boolean locked = jedis.setnx("lock:" + resourceId, "locked") == 1;
if (locked) {
    jedis.expire("lock:" + resourceId, 30);  // 防止死锁
}

// 解锁（应该用 Lua 脚本保证原子性）
jedis.del("lock:" + resourceId);
```

---

## 三、List（列表）

### 3.1 特点

- **有序**：元素按插入顺序排列
- **可重复**：允许重复元素
- **双向链表**：支持双向遍历和操作
- **底层实现**：QuickList（Redis 3.2+）

### 3.2 常用命令

```bash
# 添加元素
LPUSH key value1 value2    # 左边插入
RPUSH key value1 value2    # 右边插入

# 弹出元素
LPOP key                   # 左边弹出
RPOP key                   # 右边弹出

# 查询
LRANGE key start end       # 获取范围元素
LLEN key                   # 列表长度
LINDEX key index           # 获取指定索引元素

# 修改
LSET key index value       # 设置指定索引的值

# 阻塞操作（消息队列常用）
BLPOP key timeout          # 阻塞式左弹出
BRPOP key timeout          # 阻塞式右弹出
```

### 3.3 应用场景

**1. 消息队列（简单实现）**
```java
// 生产者
jedis.lpush("queue:orders", JSON.toJSONString(order));

// 消费者（阻塞式）
while (true) {
    List<String> result = jedis.brpop(0, "queue:orders");  // 0 表示永久阻塞
    String orderJson = result.get(1);
    processOrder(orderJson);
}
```

**2. 最新消息/时间线**
```java
// 发布动态
jedis.lpush("timeline:" + userId, postId);
jedis.ltrim("timeline:" + userId, 0, 99);  // 只保留最新100条

// 获取最新动态
List<String> posts = jedis.lrange("timeline:" + userId, 0, 9);  // 最新10条
```

**3. 栈和队列**
```java
// 队列：LPUSH + RPOP
jedis.lpush("queue", "item1");
String item = jedis.rpop("queue");

// 栈：LPUSH + LPOP
jedis.lpush("stack", "item1");
String item = jedis.lpop("stack");
```

---

## 四、Hash（哈希表）

### 4.1 特点

- 适合存储对象（字段-值对）
- 底层实现：Dict + ZipList（元素少时用 ZipList）
- 单个 key 最多存储 2^32 - 1 个字段

### 4.2 常用命令

```bash
# 设置/获取字段
HSET key field value
HGET key field
HMSET key field1 value1 field2 value2
HMGET key field1 field2
HGETALL key

# 删除字段
HDEL key field

# 判断字段存在
HEXISTS key field

# 字段数值操作
HINCRBY key field increment

# 只获取字段名或值
HKEYS key
HVALS key
HLEN key  # 字段数量
```

### 4.3 应用场景

**购物车**
```java
// 添加商品
jedis.hset("cart:" + userId, productId, quantity);

// 获取购物车
Map<String, String> cart = jedis.hgetAll("cart:" + userId);

// 更新数量
jedis.hincrBy("cart:" + userId, productId, 1);

// 删除商品
jedis.hdel("cart:" + userId, productId);
```

**对象存储**
```java
// 存储 User 对象
jedis.hset("user:" + userId, "name", "张三");
jedis.hset("user:" + userId, "age", "25");
jedis.hset("user:" + userId, "email", "zhangsan@example.com");

// 或批量设置
Map<String, String> userMap = new HashMap<>();
userMap.put("name", "张三");
userMap.put("age", "25");
jedis.hmset("user:" + userId, userMap);
```

---

## 五、Set（集合）

### 5.1 特点

- **无序**：元素不按插入顺序排列
- **唯一**：不允许重复元素
- 支持集合运算（交集、并集、差集）
- 底层实现：Dict + Intset（整数集合）

### 5.2 常用命令

```bash
# 添加/删除
SADD key member1 member2
SREM key member

# 查询
SMEMBERS key           # 获取所有元素
SISMEMBER key member   # 判断是否存在
SCARD key              # 元素数量

# 随机操作
SRANDMEMBER key count  # 随机获取元素
SPOP key               # 随机弹出元素

# 集合运算
SINTER key1 key2       # 交集
SUNION key1 key2       # 并集
SDIFF key1 key2        # 差集
SINTERSTORE dest key1 key2  # 交集存入新集合
```

### 5.3 应用场景

**标签系统**
```java
// 添加标签
jedis.sadd("article:tags:" + articleId, "Java", "Redis", "数据库");

// 获取所有标签
Set<String> tags = jedis.smembers("article:tags:" + articleId);

// 查找带某标签的所有文章
jedis.sadd("tag:Java", "article:1", "article:2");
jedis.sadd("tag:Redis", "article:1", "article:3");
```

**社交关系**
```java
// 用户关注
jedis.sadd("user:following:" + userId, "user:100");
jedis.sadd("user:followers:" + targetId, "user:1");

// 共同关注
Set<String> common = jedis.sinter("user:following:1", "user:following:2");

// 可能认识的人（我关注的人关注了谁）
Set<String> recommend = jedis.sdiff("user:following:friend", "user:following:me");
```

**点赞/收藏**
```java
// 点赞
jedis.sadd("article:likes:" + articleId, userId);

// 取消点赞
jedis.srem("article:likes:" + articleId, userId);

// 是否已点赞
boolean liked = jedis.sismember("article:likes:" + articleId, userId);

// 点赞数
long count = jedis.scard("article:likes:" + articleId);
```

---

## 六、ZSet（有序集合）

### 6.1 特点

- **有序**：根据 score 排序
- **唯一**：member 不重复
- 底层实现：SkipList + Dict

### 6.2 常用命令

```bash
# 添加元素
ZADD key score member

# 查询
ZRANGE key start end [WITHSCORES]      # 按排名范围查询
ZREVRANGE key start end [WITHSCORES]   # 倒序查询
ZRANGEBYSCORE key min max              # 按分数范围查询
ZSCORE key member                      # 获取分数
ZRANK key member                       # 获取排名（升序）
ZREVRANK key member                    # 获取排名（降序）
ZCARD key                              # 元素数量

# 删除
ZREM key member
ZREMRANGEBYRANK key start end
ZREMRANGEBYSCORE key min max

# 分数操作
ZINCRBY key increment member
```

### 6.3 应用场景

**排行榜**
```java
// 更新分数
jedis.zincrby("game:leaderboard", 100, "player:1");

// 获取 Top 10
Set<Tuple> top10 = jedis.zrevrangeWithScores("game:leaderboard", 0, 9);

// 获取玩家排名
Long rank = jedis.zrevrank("game:leaderboard", "player:1");  // 排名从 0 开始

// 获取玩家分数
Double score = jedis.zscore("game:leaderboard", "player:1");
```

**延时队列**
```java
// 添加延时任务（score 为执行时间戳）
long executeTime = System.currentTimeMillis() + 30 * 60 * 1000;  // 30分钟后
jedis.zadd("delay:queue", executeTime, "task:" + taskId);

// 消费者轮询
while (true) {
    long now = System.currentTimeMillis();
    Set<Tuple> tasks = jedis.zrangeByScoreWithScores("delay:queue", 0, now);
    for (Tuple task : tasks) {
        // 处理任务
        processTask(task.getElement());
        jedis.zrem("delay:queue", task.getElement());
    }
    Thread.sleep(1000);
}
```

**热搜榜**
```java
// 增加热度
jedis.zincrby("hot:search", 1, "关键词");

// 获取热搜榜
Set<Tuple> hotList = jedis.zrevrangeWithScores("hot:search", 0, 9);
```

---

## 七、高级数据类型

### 7.1 Bitmap（位图）

```bash
# 设置/获取位
SETBIT key offset value
GETBIT key offset

# 统计 1 的个数
BITCOUNT key

# 位运算
BITOP AND destkey key1 key2
BITOP OR destkey key1 key2
```

**应用：用户签到**
```java
// 签到
jedis.setbit("sign:2024:01:" + userId, dayOfMonth, true);

// 检查是否签到
boolean signed = jedis.getbit("sign:2024:01:" + userId, dayOfMonth);

// 统计本月签到天数
long count = jedis.bitcount("sign:2024:01:" + userId);
```

### 7.2 HyperLogLog（基数统计）

```bash
PFADD key element1 element2
PFCOUNT key
PFMERGE destkey sourcekey1 sourcekey2
```

**应用：UV 统计**
```java
// 记录访问
jedis.pfadd("uv:page:" + pageId, userId);

// 获取 UV
long uv = jedis.pfcount("uv:page:" + pageId);

// 合并多天 UV
jedis.pfmerge("uv:total", "uv:day1", "uv:day2", "uv:day3");
```

### 7.3 GEO（地理位置）

```bash
# 添加位置
GEOADD key longitude latitude member

# 获取位置
GEOPOS key member

# 计算距离
GEODIST key member1 member2 [unit]

# 范围查询
GEORADIUS key longitude latitude radius unit
GEORADIUSBYMEMBER key member radius unit
```

**应用：附近的人**
```java
// 记录用户位置
jedis.geoadd("user:location", longitude, latitude, userId);

// 查找附近 5km 的用户
List<GeoRadiusResponse> nearby = jedis.georadius("user:location", 
    longitude, latitude, 5, GeoUnit.KM);
```

---

## 八、数据类型选择建议

| 场景 | 推荐类型 | 示例 |
|------|----------|------|
| 简单缓存 | String | 用户信息缓存 |
| 计数器 | String | 点赞数、访问量 |
| 对象存储 | Hash | 购物车、用户信息 |
| 列表数据 | List | 时间线、消息队列 |
| 去重集合 | Set | 标签、共同关注 |
| 排行榜 | ZSet | 积分榜、热搜 |
| 签到统计 | Bitmap | 每日签到 |
| UV 统计 | HyperLogLog | 页面独立访客 |
| LBS 应用 | GEO | 附近的人、门店 |

---

## 参考资料

- [Redis 官方文档](https://redis.io/docs/)
- [Redis 设计与实现](http://redisbook.com/)
- [JavaGuide - Redis 常见问题](https://javaguide.cn/database/redis/redis-questions-01.html)