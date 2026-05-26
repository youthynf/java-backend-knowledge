# 数据类型-HyperLogLog

数据类型-HyperLogLog
Redis HyperLogLog 是Redis 2.8版本新增的数据类型，是一种用于统计一个集合中不重复的元素个数的数据类型。但是，HyperLogLog的统计规则是基于概率完成的，不是非常准确，标准误算率是0.81%；简单来说HyperLogLog提供不精确的去重计数。

HyperLogLog的优点是，在输入元素的数量或者体积非常非常大时，计算基数所需的内存空间总是固定的、并且很小的。在Redis里面，每个HyperLogLog键只需要花费12KB内存，就可以计算接近2的64次方个不同元素的基数。

基础指令：
pfadd key element [element …]：添加指定元素到HyperLogLog中；
pfcount key [key …]：返回给定HyperLogLog的基数估算值；
pfmerge destkey sourcekey [sourcekey …]：将多个HyperLogLog合并。
