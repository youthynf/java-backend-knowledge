# Redis键值对数据是如何实现的？

Redis键值对数据是如何实现的？
Redis的键值对中的key是字符串对象，而value可以是字符串对象，也可以是集合数据类型对象，比如List对象、Hash对象、Set对象和Zset对象。

这些键值对是如何保存在Redis中？
Redis是使用了一个哈希表保存键值对，哈希表的最大好处就是让我们可以用O(1)的时间复杂度来快速找到键值对。哈希表其实就是一个数组，数组中的元素叫做哈希桶。

Redis的哈希桶是如何保存键值对数据？

redisServer
├── redisDb
│   ├── id: int                    # 数据库编号
│   ├── dict: *dict                # 键空间字典
│   ├── expires: *dict             # 过期时间字典
│   └── blocking_keys: *dict       # 阻塞键字典
│
├── dict
│   ├── type: *dictType            # 字典类型
│   ├── privdata: void*            # 私有数据
│   ├── ht[2]: dictht              # 哈希表(主/备)
│   ├── rehashidx: long            # 重哈希进度
│   └── iterators: long           # 迭代器计数
│
├── dictht
│   ├── table: dictEntry**         # 哈希表数组
│   ├── size: unsigned long        # 哈希表大小
│   ├── sizemask: unsigned long    # 哈希掩码
│   └── used: unsigned long        # 已用节点数
│
├── dictEntry
│   ├── key: void*                 # 键指针
│   ├── v                          # 值联合体
│   │   ├── val: void*             # 普通值指针
│   │   ├── u64: uint64_t          # 无符号整型
│   │   └── s64: int64_t           # 有符号整型
│   ├── next: *dictEntry           # 哈希冲突链
│   └── metadata                   # 元数据
│
└── redisObject
    ├── type: unsigned             # 数据类型(string/list等)
    ├── encoding: unsigned         # 编码方式
    ├── lru: LRU_BITS              # LRU/LFU信息
    ├── refcount: int              # 引用计数
    └── ptr: void*                 # 数据指针

关键的数据结构名称和用途：
redisDb结构：表示Redis数据库的结构，结构体里存放了指向dict结构的指针；
dict结构：表示数据字典的结构，结构体里存放了2个哈希表（dictht），正常情况下都是使用哈希表1，哈希表2只有在rehash的时候才使用；
dictht结构：表示哈希表的结构，结构里存放了哈希表数组，数组的每个元素都是指向一个哈希表节点结构（dictEntry）的指针；
dictEntry结构：表示哈希表节点的结构，结构里存放了键对象指针和值对象指针，分别指向键对象和值对象；

键值对象指针指向的是Redis对象，Redis中每个对象都有redisObject结构来表示，其组成结构：
type：标识该对象是什么类型对象（String对象、List对象、Hash对象、Set对象、Zset对象）；
encoding：标识该对象使用了哪种底层数据结构；
ptr：指向底层数据结构的指针；
助记：redisDb（数据库）->dict（哈希表数组）->dictht（哈希表）->dictEntry（哈希桶元素）->redisObject（redis对象）-> 底层数据结构
