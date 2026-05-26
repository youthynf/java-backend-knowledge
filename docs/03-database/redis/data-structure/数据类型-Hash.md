# 数据类型-Hash

数据类型-Hash
Hash类型的底层数据结构是由压缩列表或哈希表实现的。

如果哈希类型元素个数小于512个（默认值，可由hash-max-ziplist-entries配置），且所有值都小于64字节（默认值，可由hash-max-ziplist-value配置）的话，Redis会使用压缩列表作为Hash类型的底层数据结构，否则会使用哈希表作为底层数据结构。

在Redis7.0中，压缩列表数据结构已经废弃了，交由listpack数据结构来实现了。
