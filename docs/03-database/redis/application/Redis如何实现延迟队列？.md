# Redis如何实现延迟队列？

Redis如何实现延迟队列？
延迟队列是指把当前要做的事情，往后推迟一段时间再做。延迟队列的常见使用场景有以下几种：
在淘宝、京东等购物平台上下单，超过一定时间未付款，订单会自动取消；
打车的时候，在规定时间没有车主接单，平台会取消你的单并提醒你暂时没有车主接单；
点外卖的时候，如果商家在10分钟还没接单，就会自动取消订单；

在 Redis 可以使用有序集合（ZSet）的方式来实现延迟消息队列的，ZSet 有一个 Score 属性可以用来存储延迟执行的时间。
使用 zadd score1 value1 命令就可以一直往内存中生产消息，添加元素并设置时间score。

# 语法：ZADD 队列名 执行时间戳 消息内容
# 示例：添加10秒后执行的消息
redis-cli ZADD delay_queue $(date -d "+10 seconds" +%s) "task1"
利用 zrangebysocre 查询符合条件的所有待处理的任务，通过循环执行队列任务即可。

# 获取当前时间戳
current=$(date +%s)

# 获取所有已到期的消息（分数≤当前时间）
redis-cli ZRANGEBYSCORE delay_queue 0 $current

# 原子化移除并处理消息（使用管道）
redis-cli --pipe << EOF
ZRANGEBYSCORE delay_queue 0 $current LIMIT 0 1
ZREM delay_queue "\$(ZRANGEBYSCORE delay_queue 0 $current LIMIT 0 1)"
EOF
